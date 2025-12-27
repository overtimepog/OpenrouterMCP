/**
 * Rate Limit Manager for OpenRouter API client.
 * Parses rate limit headers and implements server-side throttling.
 */

import { Logger, logger as defaultLogger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitInfo {
  // Request limits
  requestsLimit?: number;
  requestsRemaining?: number;
  requestsReset?: Date;

  // Token limits
  tokensLimit?: number;
  tokensRemaining?: number;
  tokensReset?: Date;

  // Computed properties
  isApproachingRequestLimit: boolean;
  isApproachingTokenLimit: boolean;
  percentRequestsRemaining?: number;
  percentTokensRemaining?: number;
}

export interface ThrottleStatus {
  isThrottled: boolean;
  reason?: string;
  waitTimeMs?: number;
  queuePosition?: number;
}

export interface RateLimitManagerConfig {
  requestsPerSecond?: number;
  warningThreshold?: number; // Percentage (0-100) at which to warn
  logger?: Logger;
}

// ============================================================================
// Rate Limit Manager Implementation
// ============================================================================

export class RateLimitManager {
  private readonly logger: Logger;
  private _requestsPerSecond: number;
  private readonly warningThreshold: number;

  // Rate limit state from API headers
  private currentRateLimitInfo: RateLimitInfo | null = null;

  // Throttling state
  private requestTimestamps: number[] = [];
  private pendingRequests: Array<{ resolve: () => void; timestamp: number }> = [];

  constructor(config: RateLimitManagerConfig = {}) {
    this.logger = config.logger ?? defaultLogger.child('rate-limit');
    this._requestsPerSecond = config.requestsPerSecond ?? 10; // Default: 10 req/s
    this.warningThreshold = config.warningThreshold ?? 10; // Default: warn at 10% remaining
  }

  /**
   * Get the current requests per second limit.
   */
  get requestsPerSecond(): number {
    return this._requestsPerSecond;
  }

  // ============================================================================
  // Header Parsing
  // ============================================================================

  /**
   * Parse rate limit information from response headers.
   * OpenRouter uses x-ratelimit-* headers.
   */
  parseHeaders(headers: Headers): RateLimitInfo {
    // Parse request limits
    const requestsLimit = this.parseHeader(headers, 'x-ratelimit-limit-requests');
    const requestsRemaining = this.parseHeader(headers, 'x-ratelimit-remaining-requests');
    const requestsResetSeconds = this.parseHeader(headers, 'x-ratelimit-reset-requests');

    // Parse token limits
    const tokensLimit = this.parseHeader(headers, 'x-ratelimit-limit-tokens');
    const tokensRemaining = this.parseHeader(headers, 'x-ratelimit-remaining-tokens');
    const tokensResetSeconds = this.parseHeader(headers, 'x-ratelimit-reset-tokens');

    // Calculate reset timestamps
    const now = Date.now();
    const requestsReset = requestsResetSeconds
      ? new Date(now + requestsResetSeconds * 1000)
      : undefined;
    const tokensReset = tokensResetSeconds ? new Date(now + tokensResetSeconds * 1000) : undefined;

    // Calculate percentages
    const percentRequestsRemaining =
      requestsLimit && requestsRemaining !== undefined
        ? (requestsRemaining / requestsLimit) * 100
        : undefined;

    const percentTokensRemaining =
      tokensLimit && tokensRemaining !== undefined
        ? (tokensRemaining / tokensLimit) * 100
        : undefined;

    // Check if approaching limits
    const isApproachingRequestLimit =
      percentRequestsRemaining !== undefined && percentRequestsRemaining < this.warningThreshold;
    const isApproachingTokenLimit =
      percentTokensRemaining !== undefined && percentTokensRemaining < this.warningThreshold;

    const info: RateLimitInfo = {
      requestsLimit,
      requestsRemaining,
      requestsReset,
      tokensLimit,
      tokensRemaining,
      tokensReset,
      isApproachingRequestLimit,
      isApproachingTokenLimit,
      percentRequestsRemaining,
      percentTokensRemaining,
    };

    // Store current state
    this.currentRateLimitInfo = info;

    // Log warnings if approaching limits
    this.logWarningsIfNeeded(info);

    return info;
  }

  /**
   * Parse a single rate limit header value.
   */
  private parseHeader(headers: Headers, name: string): number | undefined {
    const value = headers.get(name);
    if (!value) return undefined;

    // Handle time formats like "1s", "500ms", "1m"
    if (value.endsWith('s') && !value.endsWith('ms')) {
      const numStr = value.slice(0, -1);
      const num = parseFloat(numStr);
      return isNaN(num) ? undefined : num;
    }
    if (value.endsWith('ms')) {
      const numStr = value.slice(0, -2);
      const num = parseFloat(numStr);
      return isNaN(num) ? undefined : num / 1000;
    }
    if (value.endsWith('m')) {
      const numStr = value.slice(0, -1);
      const num = parseFloat(numStr);
      return isNaN(num) ? undefined : num * 60;
    }

    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }

  /**
   * Log warnings when approaching rate limits.
   */
  private logWarningsIfNeeded(info: RateLimitInfo): void {
    if (info.isApproachingRequestLimit) {
      this.logger.warn('Approaching request rate limit', {
        remaining: info.requestsRemaining,
        limit: info.requestsLimit,
        percentRemaining: info.percentRequestsRemaining?.toFixed(1),
        resetAt: info.requestsReset?.toISOString(),
      });
    }

    if (info.isApproachingTokenLimit) {
      this.logger.warn('Approaching token rate limit', {
        remaining: info.tokensRemaining,
        limit: info.tokensLimit,
        percentRemaining: info.percentTokensRemaining?.toFixed(1),
        resetAt: info.tokensReset?.toISOString(),
      });
    }
  }

  // ============================================================================
  // Throttling
  // ============================================================================

  /**
   * Check if a request should be throttled.
   * Returns throttle status with wait time if throttling is needed.
   */
  checkThrottle(): ThrottleStatus {
    const now = Date.now();

    // Clean up old timestamps (older than 1 second)
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < 1000);

    // Check if we're at the rate limit
    if (this.requestTimestamps.length >= this._requestsPerSecond) {
      const oldestTimestamp = this.requestTimestamps[0];
      if (oldestTimestamp !== undefined) {
        const waitTimeMs = 1000 - (now - oldestTimestamp);

        if (waitTimeMs > 0) {
          return {
            isThrottled: true,
            reason: `Rate limit: ${this._requestsPerSecond} requests per second`,
            waitTimeMs,
            queuePosition: this.pendingRequests.length + 1,
          };
        }
      }
    }

    // Check if API rate limits are exhausted
    if (this.currentRateLimitInfo?.requestsRemaining === 0) {
      const resetTime = this.currentRateLimitInfo.requestsReset;
      if (resetTime) {
        const waitTimeMs = resetTime.getTime() - now;
        if (waitTimeMs > 0) {
          return {
            isThrottled: true,
            reason: 'OpenRouter request rate limit exhausted',
            waitTimeMs,
          };
        }
      }
    }

    return { isThrottled: false };
  }

  /**
   * Record a request timestamp for throttling.
   */
  recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Wait for throttling to clear before proceeding.
   * Returns a promise that resolves when it's safe to make a request.
   */
  async waitForThrottle(): Promise<ThrottleStatus> {
    const status = this.checkThrottle();

    if (!status.isThrottled) {
      this.recordRequest();
      return status;
    }

    // Create a promise to wait for our turn
    return new Promise((resolve) => {
      const request = {
        resolve: () => {
          this.recordRequest();
          resolve({ isThrottled: false });
        },
        timestamp: Date.now(),
      };

      this.pendingRequests.push(request);

      // Schedule the request
      setTimeout(() => {
        const index = this.pendingRequests.indexOf(request);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
          request.resolve();
        }
      }, status.waitTimeMs ?? 1000);
    });
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /**
   * Get current rate limit information.
   */
  getCurrentLimits(): RateLimitInfo | null {
    return this.currentRateLimitInfo;
  }

  /**
   * Get the number of pending requests in the throttle queue.
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.length;
  }

  /**
   * Reset the throttle state (useful for testing).
   */
  reset(): void {
    this.requestTimestamps = [];
    this.pendingRequests = [];
    this.currentRateLimitInfo = null;
  }

  /**
   * Update configuration at runtime.
   */
  setRequestsPerSecond(rps: number): void {
    if (rps > 0) {
      this._requestsPerSecond = rps;
    }
  }
}

export default RateLimitManager;
