/**
 * Custom error classes for OpenRouter API client.
 * Maps OpenRouter API errors to MCP-compliant error format.
 */

// ============================================================================
// Error Codes
// ============================================================================

export enum ErrorCode {
  // Authentication errors
  AUTH_MISSING_KEY = 'AUTH_MISSING_KEY',
  AUTH_INVALID_KEY = 'AUTH_INVALID_KEY',
  AUTH_EXPIRED_KEY = 'AUTH_EXPIRED_KEY',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_REQUESTS = 'RATE_LIMIT_REQUESTS',
  RATE_LIMIT_TOKENS = 'RATE_LIMIT_TOKENS',

  // API errors
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',
  API_RESPONSE_INVALID = 'API_RESPONSE_INVALID',
  API_TIMEOUT = 'API_TIMEOUT',
  API_NETWORK_ERROR = 'API_NETWORK_ERROR',

  // Model errors
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// Base API Error
// ============================================================================

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  retryAfter?: number;
  originalError?: unknown;
}

/**
 * Base error class for all OpenRouter API errors.
 * Provides consistent error structure for MCP responses.
 */
export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode?: number;
  public readonly retryAfter?: number;
  public readonly originalError?: unknown;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = 'ApiError';
    this.code = details.code;
    this.statusCode = details.statusCode;
    this.retryAfter = details.retryAfter;
    this.originalError = details.originalError;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Convert to MCP-compliant error format
   */
  toMcpError(): { code: string; message: string; data?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      data: {
        statusCode: this.statusCode,
        retryAfter: this.retryAfter,
      },
    };
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
    };
  }
}

// ============================================================================
// Authentication Error
// ============================================================================

/**
 * Error thrown when authentication fails (invalid/missing API key).
 */
export class AuthError extends ApiError {
  constructor(message: string, code: ErrorCode = ErrorCode.AUTH_INVALID_KEY, statusCode?: number) {
    super({
      code,
      message,
      statusCode: statusCode ?? 401,
    });
    this.name = 'AuthError';
  }
}

// ============================================================================
// Rate Limit Error
// ============================================================================

/**
 * Error thrown when rate limits are exceeded.
 */
export class RateLimitError extends ApiError {
  public readonly limitType: 'requests' | 'tokens' | 'unknown';
  public readonly limit?: number;
  public readonly remaining?: number;
  public readonly resetAt?: Date;

  constructor(
    message: string,
    options: {
      limitType?: 'requests' | 'tokens' | 'unknown';
      limit?: number;
      remaining?: number;
      resetAt?: Date;
      retryAfter?: number;
    } = {}
  ) {
    const code =
      options.limitType === 'requests'
        ? ErrorCode.RATE_LIMIT_REQUESTS
        : options.limitType === 'tokens'
          ? ErrorCode.RATE_LIMIT_TOKENS
          : ErrorCode.RATE_LIMIT_EXCEEDED;

    super({
      code,
      message,
      statusCode: 429,
      retryAfter: options.retryAfter,
    });

    this.name = 'RateLimitError';
    this.limitType = options.limitType ?? 'unknown';
    this.limit = options.limit;
    this.remaining = options.remaining;
    this.resetAt = options.resetAt;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      limitType: this.limitType,
      limit: this.limit,
      remaining: this.remaining,
      resetAt: this.resetAt?.toISOString(),
    };
  }
}

// ============================================================================
// Validation Error
// ============================================================================

/**
 * Error thrown when request validation fails.
 */
export class ValidationError extends ApiError {
  public readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super({
      code: ErrorCode.VALIDATION_FAILED,
      message,
      statusCode: 400,
    });

    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      fieldErrors: this.fieldErrors,
    };
  }
}

// ============================================================================
// Error Response Parser
// ============================================================================

/**
 * OpenRouter API error response structure
 */
export interface OpenRouterErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
  };
  message?: string;
}

/**
 * Parse OpenRouter API error responses and create appropriate error instances.
 */
export function parseOpenRouterError(
  response: OpenRouterErrorResponse,
  statusCode: number,
  headers?: Headers
): ApiError {
  const errorMessage =
    response.error?.message ?? response.message ?? 'Unknown error from OpenRouter API';
  const errorType = response.error?.type ?? '';

  // Check for rate limit errors
  if (statusCode === 429) {
    const retryAfterHeader = headers?.get('retry-after');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    return new RateLimitError(errorMessage, {
      retryAfter: isNaN(retryAfter ?? NaN) ? undefined : retryAfter,
    });
  }

  // Check for authentication errors
  if (statusCode === 401) {
    if (errorType.includes('invalid_api_key') || errorMessage.includes('Invalid API key')) {
      return new AuthError(errorMessage, ErrorCode.AUTH_INVALID_KEY, statusCode);
    }
    return new AuthError(errorMessage, ErrorCode.AUTH_MISSING_KEY, statusCode);
  }

  if (statusCode === 403) {
    return new AuthError(errorMessage, ErrorCode.AUTH_EXPIRED_KEY, statusCode);
  }

  // Check for validation errors
  if (statusCode === 400) {
    return new ValidationError(errorMessage);
  }

  // Check for model not found
  if (statusCode === 404) {
    if (errorMessage.toLowerCase().includes('model')) {
      return new ApiError({
        code: ErrorCode.MODEL_NOT_FOUND,
        message: errorMessage,
        statusCode,
      });
    }
  }

  // Check for service unavailable
  if (statusCode === 503) {
    return new ApiError({
      code: ErrorCode.MODEL_UNAVAILABLE,
      message: errorMessage,
      statusCode,
    });
  }

  // Generic API error
  return new ApiError({
    code: ErrorCode.API_REQUEST_FAILED,
    message: errorMessage,
    statusCode,
  });
}

/**
 * Create an error from a network/fetch failure.
 */
export function createNetworkError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : 'Network request failed';

  if (message.includes('timeout') || message.includes('timed out')) {
    return new ApiError({
      code: ErrorCode.API_TIMEOUT,
      message: `Request timed out: ${message}`,
      originalError: error,
    });
  }

  return new ApiError({
    code: ErrorCode.API_NETWORK_ERROR,
    message: `Network error: ${message}`,
    originalError: error,
  });
}

/**
 * Check if an error is an ApiError instance.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Check if an error is a RateLimitError instance.
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Check if an error is an AuthError instance.
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
