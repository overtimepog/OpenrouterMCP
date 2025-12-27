/**
 * OpenRouter API module exports
 */

export { OpenRouterClient } from './OpenRouterClient.js';
export type {
  OpenRouterClientConfig,
  RequestOptions,
  ApiResponse,
  OpenRouterModel,
  ModelsListResponse,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from './OpenRouterClient.js';

export { RateLimitManager } from './RateLimitManager.js';
export type {
  RateLimitInfo,
  ThrottleStatus,
  RateLimitManagerConfig,
} from './RateLimitManager.js';

export { CacheManager } from './CacheManager.js';
export type {
  CacheEntry,
  CacheStats,
  CacheManagerConfig,
} from './CacheManager.js';

export {
  ApiError,
  AuthError,
  RateLimitError,
  ValidationError,
  ErrorCode,
  parseOpenRouterError,
  createNetworkError,
  isApiError,
  isRateLimitError,
  isAuthError,
} from './errors.js';
export type {
  ErrorDetails,
  OpenRouterErrorResponse,
} from './errors.js';
