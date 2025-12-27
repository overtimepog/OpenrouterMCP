/**
 * API Client Tests for OpenRouter MCP Server
 * Tests: Authentication, request flow, error parsing, rate limits, and caching
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterClient } from '../../src/api/OpenRouterClient.js';
import { RateLimitManager } from '../../src/api/RateLimitManager.js';
import { CacheManager } from '../../src/api/CacheManager.js';
import {
  ApiError,
  AuthError,
  RateLimitError,
  ErrorCode,
  parseOpenRouterError,
} from '../../src/api/errors.js';
import { Logger } from '../../src/utils/logger.js';

// Create a silent logger for tests
const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'test' });
};

// Helper to create fresh mock Response
const createMockResponse = (body: unknown, status = 200, headers?: Record<string, string>) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
  });
};

// ============================================================================
// Test 1: Authentication Header Construction
// ============================================================================

describe('Authentication Header Construction', () => {
  it('should set Authorization Bearer header with API key', () => {
    const apiKey = 'sk-or-v1-test-key-12345';
    const client = new OpenRouterClient({
      apiKey,
      logger: createTestLogger(),
    });

    const headers = client.buildHeaders();

    expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
  });

  it('should set Content-Type to application/json', () => {
    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    const headers = client.buildHeaders();

    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should set HTTP-Referer header for attribution', () => {
    const client = new OpenRouterClient({
      apiKey: 'test-key',
      httpReferer: 'https://my-app.example.com',
      logger: createTestLogger(),
    });

    const headers = client.buildHeaders();

    expect(headers['HTTP-Referer']).toBe('https://my-app.example.com');
  });

  it('should use default HTTP-Referer when not specified', () => {
    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    const headers = client.buildHeaders();

    expect(headers['HTTP-Referer']).toContain('github.com');
  });

  it('should throw AuthError when API key is missing', () => {
    expect(() => {
      new OpenRouterClient({
        apiKey: '',
        logger: createTestLogger(),
      });
    }).toThrow(AuthError);
  });
});

// ============================================================================
// Test 2: Successful API Request Flow (Mock)
// ============================================================================

describe('Successful API Request Flow', () => {
  const mockModelsResponse = {
    data: [
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        context_length: 8192,
        pricing: { prompt: '0.00003', completion: '0.00006' },
      },
      {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        context_length: 200000,
        pricing: { prompt: '0.000015', completion: '0.000075' },
      },
    ],
  };

  beforeEach(() => {
    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should successfully fetch models list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createMockResponse(mockModelsResponse, 200, {
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '99',
      })
    );

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    const result = await client.listModels();

    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.id).toBe('openai/gpt-4');
    expect(result.cached).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should include proper headers in request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(mockModelsResponse));

    const client = new OpenRouterClient({
      apiKey: 'my-secret-key',
      httpReferer: 'https://test-app.com',
      logger: createTestLogger(),
    });

    await client.listModels();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/models'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer my-secret-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });
});

// ============================================================================
// Test 3: Error Response Parsing
// ============================================================================

describe('Error Response Parsing', () => {
  it('should parse 401 as AuthError with invalid key', () => {
    const errorResponse = {
      error: {
        message: 'Invalid API key provided',
        type: 'invalid_api_key',
      },
    };

    const error = parseOpenRouterError(errorResponse, 401);

    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe(ErrorCode.AUTH_INVALID_KEY);
    expect(error.statusCode).toBe(401);
  });

  it('should parse 429 as RateLimitError', () => {
    const errorResponse = {
      error: {
        message: 'Rate limit exceeded',
      },
    };

    const headers = new Headers({
      'retry-after': '60',
    });

    const error = parseOpenRouterError(errorResponse, 429, headers);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    expect(error.retryAfter).toBe(60);
  });

  it('should parse 400 as validation error', () => {
    const errorResponse = {
      error: {
        message: 'Invalid request: messages array is required',
      },
    };

    const error = parseOpenRouterError(errorResponse, 400);

    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.statusCode).toBe(400);
  });

  it('should parse 404 for model not found', () => {
    const errorResponse = {
      error: {
        message: 'Model not found: invalid/model-name',
      },
    };

    const error = parseOpenRouterError(errorResponse, 404);

    expect(error.code).toBe(ErrorCode.MODEL_NOT_FOUND);
    expect(error.statusCode).toBe(404);
  });

  it('should parse generic errors with API_REQUEST_FAILED code', () => {
    const errorResponse = {
      message: 'Internal server error',
    };

    const error = parseOpenRouterError(errorResponse, 500);

    expect(error.code).toBe(ErrorCode.API_REQUEST_FAILED);
    expect(error.message).toContain('Internal server error');
  });

  it('should convert error to MCP-compliant format', () => {
    const error = new ApiError({
      code: ErrorCode.API_REQUEST_FAILED,
      message: 'Test error',
      statusCode: 500,
    });

    const mcpError = error.toMcpError();

    expect(mcpError.code).toBe(ErrorCode.API_REQUEST_FAILED);
    expect(mcpError.message).toBe('Test error');
    expect(mcpError.data?.statusCode).toBe(500);
  });
});

// ============================================================================
// Test 4: Rate Limit Header Extraction
// ============================================================================

describe('Rate Limit Header Extraction', () => {
  it('should parse x-ratelimit-limit-* headers', () => {
    const manager = new RateLimitManager({ logger: createTestLogger() });

    const headers = new Headers({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '95',
      'x-ratelimit-reset-requests': '60',
      'x-ratelimit-limit-tokens': '100000',
      'x-ratelimit-remaining-tokens': '90000',
      'x-ratelimit-reset-tokens': '30',
    });

    const info = manager.parseHeaders(headers);

    expect(info.requestsLimit).toBe(100);
    expect(info.requestsRemaining).toBe(95);
    expect(info.tokensLimit).toBe(100000);
    expect(info.tokensRemaining).toBe(90000);
  });

  it('should calculate percentage remaining correctly', () => {
    const manager = new RateLimitManager({
      warningThreshold: 10,
      logger: createTestLogger(),
    });

    const headers = new Headers({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '50',
    });

    const info = manager.parseHeaders(headers);

    expect(info.percentRequestsRemaining).toBe(50);
    expect(info.isApproachingRequestLimit).toBe(false);
  });

  it('should detect approaching limits when below threshold', () => {
    const manager = new RateLimitManager({
      warningThreshold: 10,
      logger: createTestLogger(),
    });

    const headers = new Headers({
      'x-ratelimit-limit-requests': '100',
      'x-ratelimit-remaining-requests': '5',
    });

    const info = manager.parseHeaders(headers);

    expect(info.percentRequestsRemaining).toBe(5);
    expect(info.isApproachingRequestLimit).toBe(true);
  });

  it('should parse time-based reset values (e.g., "1s", "500ms")', () => {
    const manager = new RateLimitManager({ logger: createTestLogger() });

    const headers = new Headers({
      'x-ratelimit-reset-requests': '2s',
      'x-ratelimit-reset-tokens': '500ms',
    });

    const info = manager.parseHeaders(headers);

    // Reset times should be in the future
    expect(info.requestsReset).toBeInstanceOf(Date);
    expect(info.tokensReset).toBeInstanceOf(Date);
  });

  it('should handle missing rate limit headers gracefully', () => {
    const manager = new RateLimitManager({ logger: createTestLogger() });

    const headers = new Headers({});

    const info = manager.parseHeaders(headers);

    expect(info.requestsLimit).toBeUndefined();
    expect(info.requestsRemaining).toBeUndefined();
    expect(info.isApproachingRequestLimit).toBe(false);
  });
});

// ============================================================================
// Test 5: Caching Behavior for Model List
// ============================================================================

describe('Caching Behavior for Model List', () => {
  const mockModelsResponse = {
    data: [
      { id: 'test/model-1', name: 'Model 1' },
      { id: 'test/model-2', name: 'Model 2' },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should cache model list responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(mockModelsResponse));

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    // First call - should fetch from API
    const result1 = await client.listModels();
    expect(result1.cached).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await client.listModels();
    expect(result2.cached).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1); // No additional fetch
  });

  it('should bypass cache when skipCache is true', async () => {
    // Return a new Response for each call
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(createMockResponse(mockModelsResponse))
    );

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    // First call
    await client.listModels();

    // Second call with skipCache
    const result = await client.listModels(true);
    expect(result.cached).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should invalidate cache on demand', async () => {
    // Return a new Response for each call
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(createMockResponse(mockModelsResponse))
    );

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    // First call - cache populated
    await client.listModels();
    expect(fetch).toHaveBeenCalledTimes(1);

    // Invalidate cache
    client.invalidateModelCache();

    // Next call should fetch again
    await client.listModels();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should track cache statistics', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(mockModelsResponse));

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      logger: createTestLogger(),
    });

    // First call - miss
    await client.listModels();

    // Second call - hit
    await client.listModels();

    const stats = client.getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });
});

// ============================================================================
// Test 6: Cache Manager Unit Tests
// ============================================================================

describe('CacheManager', () => {
  it('should store and retrieve values', () => {
    const cache = new CacheManager({ logger: createTestLogger() });

    cache.set('test-key', { value: 'test-data' });
    const result = cache.get('test-key');

    expect(result).toEqual({ value: 'test-data' });
  });

  it('should return undefined for expired entries', async () => {
    const cache = new CacheManager({
      defaultTtlMs: 50, // 50ms TTL
      logger: createTestLogger(),
    });

    cache.set('test-key', 'test-value');

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = cache.get('test-key');
    expect(result).toBeUndefined();
  });

  it('should respect custom TTL', () => {
    const cache = new CacheManager({ logger: createTestLogger() });

    cache.set('short-ttl', 'data', 1000);
    cache.set('long-ttl', 'data', 60000);

    const shortTtl = cache.getTtl('short-ttl');
    const longTtl = cache.getTtl('long-ttl');

    expect(shortTtl).toBeLessThanOrEqual(1000);
    expect(longTtl).toBeLessThanOrEqual(60000);
    expect(longTtl).toBeGreaterThan(shortTtl ?? 0);
  });

  it('should clear all entries', () => {
    const cache = new CacheManager({ logger: createTestLogger() });

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    expect(cache.getStats().size).toBe(2);

    cache.clear();

    expect(cache.getStats().size).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
  });
});

// ============================================================================
// Test 7: Server-side Throttling
// ============================================================================

describe('Server-side Throttling', () => {
  it('should allow requests within rate limit', () => {
    const manager = new RateLimitManager({
      requestsPerSecond: 10,
      logger: createTestLogger(),
    });

    // First request should not be throttled
    const status = manager.checkThrottle();
    expect(status.isThrottled).toBe(false);
  });

  it('should throttle when exceeding requests per second', () => {
    const manager = new RateLimitManager({
      requestsPerSecond: 2,
      logger: createTestLogger(),
    });

    // Record 2 requests (at the limit)
    manager.recordRequest();
    manager.recordRequest();

    // Third request should be throttled
    const status = manager.checkThrottle();
    expect(status.isThrottled).toBe(true);
    expect(status.waitTimeMs).toBeGreaterThan(0);
  });

  it('should clear throttle after wait period', async () => {
    const manager = new RateLimitManager({
      requestsPerSecond: 2,
      logger: createTestLogger(),
    });

    // Exhaust rate limit
    manager.recordRequest();
    manager.recordRequest();

    // Wait for throttle to clear
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const status = manager.checkThrottle();
    expect(status.isThrottled).toBe(false);
  });

  it('should track pending request count', async () => {
    const manager = new RateLimitManager({
      requestsPerSecond: 1,
      logger: createTestLogger(),
    });

    // First request takes the slot
    manager.recordRequest();

    expect(manager.getPendingRequestCount()).toBe(0);

    // Start waiting for throttle (don't await)
    const waitPromise = manager.waitForThrottle();

    // There should now be a pending request
    expect(manager.getPendingRequestCount()).toBe(1);

    // Wait for it to complete
    await waitPromise;
    expect(manager.getPendingRequestCount()).toBe(0);
  });

  it('should reset throttle state', () => {
    const manager = new RateLimitManager({
      requestsPerSecond: 2,
      logger: createTestLogger(),
    });

    manager.recordRequest();
    manager.recordRequest();

    // Should be throttled
    expect(manager.checkThrottle().isThrottled).toBe(true);

    // Reset
    manager.reset();

    // Should no longer be throttled
    expect(manager.checkThrottle().isThrottled).toBe(false);
  });
});

// ============================================================================
// Test 8: Request Flow with Throttling Integration
// ============================================================================

describe('Request Flow with Throttling', () => {
  const mockModelsResponse = {
    data: [{ id: 'test/model' }],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should include throttle status in response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(mockModelsResponse));

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      requestsPerSecond: 10,
      logger: createTestLogger(),
    });

    const result = await client.listModels();

    expect(result.throttleStatus).toBeDefined();
    expect(result.throttleStatus.isThrottled).toBe(false);
  });

  it('should report current throttle status', () => {
    const client = new OpenRouterClient({
      apiKey: 'test-key',
      requestsPerSecond: 5,
      logger: createTestLogger(),
    });

    const status = client.getThrottleStatus();
    expect(status).toHaveProperty('isThrottled');
  });

  it('should allow resetting throttle state', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(createMockResponse(mockModelsResponse))
    );

    const client = new OpenRouterClient({
      apiKey: 'test-key',
      requestsPerSecond: 1,
      logger: createTestLogger(),
    });

    // Make a request to trigger rate tracking
    await client.listModels(true);

    // Reset throttle
    client.resetThrottle();

    // Should be able to make another request without throttling
    const status = client.getThrottleStatus();
    expect(status.isThrottled).toBe(false);
  });
});
