/**
 * OpenRouter API Client
 * Provides authenticated access to OpenRouter's unified API.
 */

import { Logger, logger as defaultLogger } from '../utils/logger.js';
import { CacheManager } from './CacheManager.js';
import { RateLimitManager, RateLimitInfo, ThrottleStatus } from './RateLimitManager.js';
import {
  ApiError,
  AuthError,
  ErrorCode,
  parseOpenRouterError,
  createNetworkError,
  OpenRouterErrorResponse,
} from './errors.js';

// ============================================================================
// Types
// ============================================================================

export interface OpenRouterClientConfig {
  apiKey: string;
  baseUrl?: string;
  httpReferer?: string;
  timeout?: number;
  requestsPerSecond?: number;
  logger?: Logger;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  skipCache?: boolean;
  skipThrottle?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  rateLimits: RateLimitInfo | null;
  throttleStatus: ThrottleStatus;
  cached: boolean;
}

// Model types from OpenRouter API
export interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
}

export interface ModelsListResponse {
  data: OpenRouterModel[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'text' | 'json_object' };
  usage?: { include: boolean }; // Enable cost tracking in response
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number; // Cost in credits
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

// Image generation types (via chat/completions with modalities)
// Content can be text or image_url type
export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string; // Base64 data URL (data:image/png;base64,...) or regular URL
  };
}

export interface ImageGenerationRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: ContentPart[]; // Must be array of content parts for image generation
  }>;
  modalities: ['text', 'image']; // Order matters: text first, then image
  stream?: boolean;
  image_config?: {
    aspect_ratio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
    image_size?: '1K' | '2K' | '4K';
  };
}

export interface ImageGenerationResponse {
  id?: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      // Content is an array of content parts (text and image_url objects)
      content?: ContentPart[] | string | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
}

// Credits types
export interface CreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

// ============================================================================
// OpenRouter Client Implementation
// ============================================================================

export class OpenRouterClient {
  private readonly config: Required<Omit<OpenRouterClientConfig, 'logger'>> & { logger: Logger };
  private readonly cacheManager: CacheManager;
  private readonly rateLimitManager: RateLimitManager;

  static readonly DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
  static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  static readonly DEFAULT_RPS = 10;

  constructor(config: OpenRouterClientConfig) {
    if (!config.apiKey) {
      throw new AuthError('API key is required', ErrorCode.AUTH_MISSING_KEY);
    }

    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? OpenRouterClient.DEFAULT_BASE_URL,
      httpReferer: config.httpReferer ?? 'https://github.com/openrouter-mcp-server',
      timeout: config.timeout ?? OpenRouterClient.DEFAULT_TIMEOUT,
      requestsPerSecond: config.requestsPerSecond ?? OpenRouterClient.DEFAULT_RPS,
      logger: config.logger ?? defaultLogger.child('api-client'),
    };

    this.cacheManager = new CacheManager({
      logger: this.config.logger.child('cache'),
    });

    this.rateLimitManager = new RateLimitManager({
      requestsPerSecond: this.config.requestsPerSecond,
      logger: this.config.logger.child('rate-limit'),
    });

    this.config.logger.debug('OpenRouterClient initialized', {
      baseUrl: this.config.baseUrl,
      hasApiKey: true,
    });
  }

  // ============================================================================
  // Header Construction
  // ============================================================================

  /**
   * Build request headers with authentication and attribution.
   * Returns a plain object for better compatibility with Node.js fetch.
   */
  buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.config.httpReferer,
    };

    // Add any additional headers
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }

    // Debug log to verify Authorization header is present
    this.config.logger.debug('Request headers built', {
      hasAuthorization: Boolean(headers['Authorization']),
      authHeaderLength: headers['Authorization']?.length ?? 0,
    });

    return headers;
  }

  // ============================================================================
  // Generic Request Method
  // ============================================================================

  /**
   * Make a request to the OpenRouter API with error handling, caching, and throttling.
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', body, headers: additionalHeaders, timeout, skipThrottle = false } = options;

    const url = `${this.config.baseUrl}${endpoint}`;
    const requestTimeout = timeout ?? this.config.timeout;

    // Apply throttling unless skipped
    let throttleStatus: ThrottleStatus = { isThrottled: false };
    if (!skipThrottle) {
      throttleStatus = await this.rateLimitManager.waitForThrottle();
    }

    // Build headers
    const headers = this.buildHeaders(additionalHeaders);

    // Direct console output for debugging auth issues
    console.error(`[DEBUG] API Request: ${method} ${url}`);
    console.error(`[DEBUG] Auth header present: ${Boolean(headers['Authorization'])}`);
    console.error(`[DEBUG] Auth header prefix: ${headers['Authorization']?.substring(0, 25)}...`);

    // Detailed debug logging for troubleshooting
    this.config.logger.debug('Making API request', {
      method,
      endpoint,
      url,
      throttled: throttleStatus.isThrottled,
      hasAuthHeader: Boolean(headers['Authorization']),
      authHeaderPrefix: headers['Authorization']?.substring(0, 20) + '...',
      allHeaderKeys: Object.keys(headers),
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      // Parse rate limit headers
      const rateLimits = this.rateLimitManager.parseHeaders(response.headers);

      // Handle non-OK responses
      if (!response.ok) {
        let errorBody: OpenRouterErrorResponse;
        try {
          errorBody = (await response.json()) as OpenRouterErrorResponse;
        } catch {
          errorBody = { message: `HTTP ${response.status}: ${response.statusText}` };
        }

        throw parseOpenRouterError(errorBody, response.status, response.headers);
      }

      // Parse successful response
      const data = (await response.json()) as T;

      this.config.logger.debug('API request successful', {
        endpoint,
        statusCode: response.status,
      });

      return {
        data,
        rateLimits,
        throttleStatus,
        cached: false,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError({
          code: ErrorCode.API_TIMEOUT,
          message: `Request timed out after ${requestTimeout}ms`,
        });
      }

      // Handle network errors
      throw createNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ============================================================================
  // API Endpoints
  // ============================================================================

  /**
   * Fetch all available models from OpenRouter.
   * Uses caching to reduce API calls.
   */
  async listModels(skipCache = false): Promise<ApiResponse<OpenRouterModel[]>> {
    const cacheKey = CacheManager.KEYS.MODEL_LIST;

    // Check cache first
    if (!skipCache) {
      const cached = this.cacheManager.get<OpenRouterModel[]>(cacheKey);
      if (cached) {
        return {
          data: cached,
          rateLimits: this.rateLimitManager.getCurrentLimits(),
          throttleStatus: { isThrottled: false },
          cached: true,
        };
      }
    }

    // Fetch from API
    const response = await this.request<ModelsListResponse>('/models');

    // Cache the result
    this.cacheManager.set(cacheKey, response.data.data, CacheManager.TTL.MODEL_LIST);

    return {
      data: response.data.data,
      rateLimits: response.rateLimits,
      throttleStatus: response.throttleStatus,
      cached: false,
    };
  }

  /**
   * Create a chat completion.
   */
  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ApiResponse<ChatCompletionResponse>> {
    return this.request<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Create an image generation request.
   * Uses the /chat/completions endpoint with modalities parameter.
   */
  async createImageGeneration(
    request: ImageGenerationRequest
  ): Promise<ApiResponse<ImageGenerationResponse>> {
    return this.request<ImageGenerationResponse>('/chat/completions', {
      method: 'POST',
      body: {
        ...request,
        stream: false, // Image generation doesn't support streaming in the same way
      },
      timeout: 120000, // 2 minutes for image generation
    });
  }

  /**
   * Create a streaming chat completion.
   * Returns a ReadableStream for SSE chunks.
   */
  async createStreamingChatCompletion(
    request: ChatCompletionRequest
  ): Promise<{
    stream: ReadableStream<Uint8Array>;
    rateLimits: RateLimitInfo | null;
    throttleStatus: ThrottleStatus;
  }> {
    const url = `${this.config.baseUrl}/chat/completions`;

    // Apply throttling
    const throttleStatus = await this.rateLimitManager.waitForThrottle();

    const headers = this.buildHeaders();

    // Direct console output for debugging auth issues
    console.error(`[DEBUG] Streaming Request: POST ${url}`);
    console.error(`[DEBUG] Auth header present: ${Boolean(headers['Authorization'])}`);
    console.error(`[DEBUG] Auth header prefix: ${headers['Authorization']?.substring(0, 25)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...request, stream: true }),
        signal: controller.signal,
      });

      // Parse rate limit headers
      const rateLimits = this.rateLimitManager.parseHeaders(response.headers);

      if (!response.ok) {
        let errorBody: OpenRouterErrorResponse;
        try {
          errorBody = (await response.json()) as OpenRouterErrorResponse;
        } catch {
          errorBody = { message: `HTTP ${response.status}: ${response.statusText}` };
        }
        throw parseOpenRouterError(errorBody, response.status, response.headers);
      }

      if (!response.body) {
        throw new ApiError({
          code: ErrorCode.API_RESPONSE_INVALID,
          message: 'No response body for streaming request',
        });
      }

      // Clear timeout since we got a response
      clearTimeout(timeoutId);

      return {
        stream: response.body,
        rateLimits,
        throttleStatus,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError({
          code: ErrorCode.API_TIMEOUT,
          message: `Streaming request timed out after ${this.config.timeout}ms`,
        });
      }

      throw createNetworkError(error);
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Get account credits information.
   */
  async getCredits(): Promise<ApiResponse<CreditsResponse>> {
    return this.request<CreditsResponse>('/credits');
  }

  /**
   * Invalidate the model list cache.
   */
  invalidateModelCache(): void {
    this.cacheManager.invalidate(CacheManager.KEYS.MODEL_LIST);
    this.config.logger.debug('Model cache invalidated');
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    this.cacheManager.clear();
    this.config.logger.debug('All caches cleared');
  }

  /**
   * Get cache statistics.
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  // ============================================================================
  // Rate Limit Management
  // ============================================================================

  /**
   * Get current rate limit information.
   */
  getRateLimits(): RateLimitInfo | null {
    return this.rateLimitManager.getCurrentLimits();
  }

  /**
   * Check current throttle status.
   */
  getThrottleStatus(): ThrottleStatus {
    return this.rateLimitManager.checkThrottle();
  }

  /**
   * Reset throttle state.
   */
  resetThrottle(): void {
    this.rateLimitManager.reset();
    this.config.logger.debug('Throttle state reset');
  }
}

export default OpenRouterClient;
