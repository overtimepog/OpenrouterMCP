/**
 * Context limit definitions for different models.
 * Defines maximum token limits and warning thresholds per model.
 */

import { ContextLimit } from './types.js';

/**
 * Known context limits for popular models on OpenRouter.
 * These are approximate and may change as providers update their models.
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI models
  'openai/gpt-4o': 128000,
  'openai/gpt-4o-mini': 128000,
  'openai/gpt-4-turbo': 128000,
  'openai/gpt-4': 8192,
  'openai/gpt-4-32k': 32768,
  'openai/gpt-3.5-turbo': 16385,
  'openai/gpt-3.5-turbo-16k': 16385,
  'openai/o1-preview': 128000,
  'openai/o1-mini': 128000,

  // Anthropic models
  'anthropic/claude-3.5-sonnet': 200000,
  'anthropic/claude-3.5-sonnet-20241022': 200000,
  'anthropic/claude-3-opus': 200000,
  'anthropic/claude-3-sonnet': 200000,
  'anthropic/claude-3-haiku': 200000,
  'anthropic/claude-2.1': 200000,
  'anthropic/claude-2': 100000,
  'anthropic/claude-instant-1': 100000,

  // Google models
  'google/gemini-pro': 32760,
  'google/gemini-pro-1.5': 1000000,
  'google/gemini-flash-1.5': 1000000,
  'google/palm-2-chat-bison': 8196,

  // Meta models
  'meta-llama/llama-3.1-405b-instruct': 131072,
  'meta-llama/llama-3.1-70b-instruct': 131072,
  'meta-llama/llama-3.1-8b-instruct': 131072,
  'meta-llama/llama-3-70b-instruct': 8192,
  'meta-llama/llama-3-8b-instruct': 8192,
  'meta-llama/llama-2-70b-chat': 4096,

  // Mistral models
  'mistralai/mistral-large': 32000,
  'mistralai/mistral-medium': 32000,
  'mistralai/mistral-small': 32000,
  'mistralai/mistral-7b-instruct': 32768,
  'mistralai/mixtral-8x7b-instruct': 32768,
  'mistralai/mixtral-8x22b-instruct': 65536,

  // Cohere models
  'cohere/command-r': 128000,
  'cohere/command-r-plus': 128000,
  'cohere/command': 4096,

  // DeepSeek models
  'deepseek/deepseek-chat': 65536,
  'deepseek/deepseek-coder': 65536,

  // Other popular models
  'perplexity/llama-3.1-sonar-large-128k-online': 128000,
  'perplexity/llama-3.1-sonar-small-128k-online': 128000,
  'qwen/qwen-2.5-72b-instruct': 32768,
  'qwen/qwen-2.5-coder-32b-instruct': 32768,
};

/**
 * Default context limit for models not in the known list
 */
export const DEFAULT_CONTEXT_LIMIT = 4096;

/**
 * Default warning threshold (80% of context limit)
 */
export const DEFAULT_WARNING_THRESHOLD = 0.8;

/**
 * Get the context limit for a specific model
 * @param modelId The model identifier
 * @param defaultLimit Optional override for the default context limit
 */
export function getModelContextLimit(modelId: string, defaultLimit?: number): number {
  // Try exact match first
  const exactMatch = MODEL_CONTEXT_LIMITS[modelId];
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  // Try matching without version suffix
  const baseModelId = modelId.split(':')[0];
  if (baseModelId) {
    const baseMatch = MODEL_CONTEXT_LIMITS[baseModelId];
    if (baseMatch !== undefined) {
      return baseMatch;
    }
  }

  // Try matching provider prefix
  const provider = modelId.split('/')[0];
  const providerDefaults: Record<string, number> = {
    'openai': 16385,
    'anthropic': 200000,
    'google': 32760,
    'meta-llama': 8192,
    'mistralai': 32000,
    'cohere': 4096,
  };

  if (provider) {
    const providerDefault = providerDefaults[provider];
    if (providerDefault !== undefined) {
      return providerDefault;
    }
  }

  return defaultLimit ?? DEFAULT_CONTEXT_LIMIT;
}

/**
 * Get the full context limit configuration for a model
 * @param modelId The model identifier
 * @param warningThreshold Warning threshold as a fraction (0-1)
 * @param defaultLimit Optional override for the default context limit
 */
export function getContextLimitConfig(
  modelId: string,
  warningThreshold: number = DEFAULT_WARNING_THRESHOLD,
  defaultLimit?: number
): ContextLimit {
  const maxTokens = getModelContextLimit(modelId, defaultLimit);

  return {
    maxTokens,
    warningThreshold,
  };
}

/**
 * Check if token count is approaching the context limit
 */
export function isApproachingLimit(
  currentTokens: number,
  contextLimit: ContextLimit
): boolean {
  return currentTokens >= contextLimit.maxTokens * contextLimit.warningThreshold;
}

/**
 * Check if token count exceeds the context limit
 */
export function exceedsLimit(
  currentTokens: number,
  contextLimit: ContextLimit
): boolean {
  return currentTokens > contextLimit.maxTokens;
}

/**
 * Calculate remaining tokens before hitting the limit
 */
export function getRemainingTokens(
  currentTokens: number,
  contextLimit: ContextLimit
): number {
  return Math.max(0, contextLimit.maxTokens - currentTokens);
}

/**
 * Calculate the percentage of context used
 */
export function getContextUsagePercent(
  currentTokens: number,
  contextLimit: ContextLimit
): number {
  return Math.min(100, (currentTokens / contextLimit.maxTokens) * 100);
}

export default {
  getModelContextLimit,
  getContextLimitConfig,
  isApproachingLimit,
  exceedsLimit,
  getRemainingTokens,
  getContextUsagePercent,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_WARNING_THRESHOLD,
};
