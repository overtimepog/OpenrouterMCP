/**
 * Handler for the openrouter_search_models tool.
 * Extends list models with advanced filtering, sorting, and comparison features.
 */

import { OpenRouterClient, OpenRouterModel } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ToolResponse } from '../../server/OpenRouterServer.js';
import {
  applyFilters,
  toModelInfo,
  parsePrice,
  extractProvider,
} from '../listModels/handler.js';
import {
  SearchModelsInput,
  SearchModelInfo,
  SearchModelsResponse,
  SortBy,
  SortOrder,
} from './schema.js';

// ============================================================================
// Types
// ============================================================================

export interface SearchModelsHandlerConfig {
  client: OpenRouterClient;
  logger: Logger;
}

// ============================================================================
// Advanced Filter Functions
// ============================================================================

/**
 * Filter models by tool/function calling support
 */
export function filterByToolsSupport(
  models: OpenRouterModel[],
  supportsTools: boolean
): OpenRouterModel[] {
  return models.filter((model) => {
    // Check if model supports tools based on architecture or known capabilities
    // OpenRouter models typically support tools if they're based on certain architectures
    const modelId = model.id.toLowerCase();
    const supportsToolCalling =
      modelId.includes('gpt-4') ||
      modelId.includes('gpt-3.5-turbo') ||
      modelId.includes('claude-3') ||
      modelId.includes('claude-2') ||
      modelId.includes('gemini') ||
      modelId.includes('mistral') && (modelId.includes('large') || modelId.includes('medium')) ||
      modelId.includes('command') ||
      modelId.includes('qwen');

    return supportsTools ? supportsToolCalling : !supportsToolCalling;
  });
}

/**
 * Filter models by streaming support
 * Most OpenRouter models support streaming
 */
export function filterByStreamingSupport(
  models: OpenRouterModel[],
  supportsStreaming: boolean
): OpenRouterModel[] {
  return models.filter((model) => {
    // Most models support streaming; only filter out specific known exceptions
    const modelId = model.id.toLowerCase();
    const hasStreamingSupport = !modelId.includes('dall-e') && !modelId.includes('stable-diffusion');

    return supportsStreaming ? hasStreamingSupport : !hasStreamingSupport;
  });
}

/**
 * Filter models by temperature parameter support
 */
export function filterByTemperatureSupport(
  models: OpenRouterModel[],
  supportsTemperature: boolean
): OpenRouterModel[] {
  return models.filter((model) => {
    // Most language models support temperature
    // Image generation models typically don't
    const modelId = model.id.toLowerCase();
    const hasTemperatureSupport =
      !modelId.includes('dall-e') &&
      !modelId.includes('stable-diffusion') &&
      !modelId.includes('midjourney');

    return supportsTemperature ? hasTemperatureSupport : !hasTemperatureSupport;
  });
}

/**
 * Apply advanced filters (extends base filters from list models)
 */
export function applyAdvancedFilters(
  models: OpenRouterModel[],
  input: SearchModelsInput
): OpenRouterModel[] {
  // First apply base filters from list models
  let filtered = applyFilters(models, input);

  // Apply tool support filter
  if (input.supports_tools !== undefined) {
    filtered = filterByToolsSupport(filtered, input.supports_tools);
  }

  // Apply streaming support filter
  if (input.supports_streaming !== undefined) {
    filtered = filterByStreamingSupport(filtered, input.supports_streaming);
  }

  // Apply temperature support filter
  if (input.supports_temperature !== undefined) {
    filtered = filterByTemperatureSupport(filtered, input.supports_temperature);
  }

  return filtered;
}

// ============================================================================
// Sorting Functions
// ============================================================================

/**
 * Sort models by price (prompt price)
 */
export function sortByPrice(
  models: OpenRouterModel[],
  order: SortOrder
): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const priceA = parsePrice(a.pricing?.prompt);
    const priceB = parsePrice(b.pricing?.prompt);

    return order === 'asc' ? priceA - priceB : priceB - priceA;
  });
}

/**
 * Sort models by context length
 */
export function sortByContextLength(
  models: OpenRouterModel[],
  order: SortOrder
): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const contextA = a.context_length ?? 0;
    const contextB = b.context_length ?? 0;

    return order === 'asc' ? contextA - contextB : contextB - contextA;
  });
}

/**
 * Sort models by provider name (alphabetical)
 */
export function sortByProvider(
  models: OpenRouterModel[],
  order: SortOrder
): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const providerA = extractProvider(a.id).toLowerCase();
    const providerB = extractProvider(b.id).toLowerCase();

    const comparison = providerA.localeCompare(providerB);
    return order === 'asc' ? comparison : -comparison;
  });
}

/**
 * Apply sorting to models based on sort_by and sort_order
 */
export function applySorting(
  models: OpenRouterModel[],
  sortBy?: SortBy,
  sortOrder: SortOrder = 'asc'
): OpenRouterModel[] {
  if (!sortBy) {
    return models;
  }

  switch (sortBy) {
    case 'price':
      return sortByPrice(models, sortOrder);
    case 'context_length':
      return sortByContextLength(models, sortOrder);
    case 'provider':
      return sortByProvider(models, sortOrder);
    default:
      return models;
  }
}

// ============================================================================
// Latency and Differentiator Functions
// ============================================================================

/**
 * Extract latency hints from model data
 * OpenRouter may include latency estimates in model metadata
 */
export function extractLatencyHint(_model: OpenRouterModel): SearchModelInfo['latency_hint'] {
  // OpenRouter doesn't currently expose latency in the models endpoint
  // but we structure this for future compatibility
  // If top_provider or other metadata contained latency, we'd extract it here
  // The _model parameter is kept for future API compatibility

  return {
    available: false,
    estimated_ms: undefined,
  };
}

/**
 * Generate key differentiators for a model
 */
export function generateDifferentiators(model: OpenRouterModel): string[] {
  const differentiators: string[] = [];
  const modelId = model.id.toLowerCase();

  // Price differentiator
  const promptPrice = parsePrice(model.pricing?.prompt);
  if (promptPrice === 0) {
    differentiators.push('Free');
  } else if (promptPrice < 0.000001) {
    differentiators.push('Very Low Cost');
  } else if (promptPrice > 0.00003) {
    differentiators.push('Premium');
  }

  // Context length differentiator
  const contextLength = model.context_length ?? 0;
  if (contextLength >= 128000) {
    differentiators.push('Long Context (128K+)');
  } else if (contextLength >= 32000) {
    differentiators.push('Extended Context (32K+)');
  }

  // Capability differentiators
  if (modelId.includes('vision') || model.architecture?.modality?.includes('image')) {
    differentiators.push('Vision Capable');
  }

  if (modelId.includes('code') || modelId.includes('codex')) {
    differentiators.push('Code Optimized');
  }

  // Tool support indicator
  if (
    modelId.includes('gpt-4') ||
    modelId.includes('claude-3') ||
    modelId.includes('gemini')
  ) {
    differentiators.push('Tool Calling');
  }

  // Provider-specific differentiators
  if (modelId.includes('claude')) {
    differentiators.push('Anthropic');
  } else if (modelId.includes('gpt')) {
    differentiators.push('OpenAI');
  } else if (modelId.includes('gemini')) {
    differentiators.push('Google');
  }

  return differentiators;
}

/**
 * Convert OpenRouterModel to SearchModelInfo with ranking and extras
 */
export function toSearchModelInfo(
  model: OpenRouterModel,
  rank: number
): SearchModelInfo {
  const baseInfo = toModelInfo(model);

  return {
    ...baseInfo,
    rank,
    latency_hint: extractLatencyHint(model),
    differentiators: generateDifferentiators(model),
  };
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Create the search models handler
 */
export function createSearchModelsHandler(config: SearchModelsHandlerConfig) {
  const { client, logger } = config;

  return async (input: SearchModelsInput): Promise<ToolResponse> => {
    logger.debug('Executing search models tool', {
      filters: input,
      sortBy: input.sort_by,
      sortOrder: input.sort_order,
    });

    try {
      // Fetch models from API (uses caching internally)
      const response = await client.listModels();
      const allModels = response.data;
      const totalCount = allModels.length;

      logger.debug('Fetched models from API', {
        count: totalCount,
        cached: response.cached,
      });

      // Apply advanced filters (includes base filters)
      let filteredModels = applyAdvancedFilters(allModels, input);
      const filteredCount = filteredModels.length;

      logger.debug('Applied filters', {
        totalCount,
        filteredCount,
        filters: input,
      });

      // Apply sorting
      const sortOrder = input.sort_order ?? 'asc';
      filteredModels = applySorting(filteredModels, input.sort_by, sortOrder);

      if (input.sort_by) {
        logger.debug('Applied sorting', {
          sortBy: input.sort_by,
          sortOrder,
        });
      }

      // Convert to SearchModelInfo with ranking
      const models = filteredModels.map((model, index) =>
        toSearchModelInfo(model, index + 1)
      );

      // Build response
      const result: SearchModelsResponse = {
        models,
        total_count: totalCount,
        filtered_count: filteredCount,
        filters_applied: Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined)
        ) as Partial<SearchModelsInput>,
        sort_applied: input.sort_by ? {
          by: input.sort_by,
          order: sortOrder,
        } : undefined,
      };

      // Format text response
      const textResponse = formatTextResponse(result);

      return {
        content: [{ type: 'text', text: textResponse }],
        structuredContent: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Search models tool failed', { error: errorMessage });

      return {
        content: [
          {
            type: 'text',
            text: `Error searching models: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Format the response as human-readable text for comparison
 */
function formatTextResponse(result: SearchModelsResponse): string {
  const lines: string[] = [];

  lines.push(`Found ${result.filtered_count} models (out of ${result.total_count} total)`);

  if (Object.keys(result.filters_applied).length > 0) {
    lines.push(`Filters: ${JSON.stringify(result.filters_applied)}`);
  }

  if (result.sort_applied) {
    lines.push(`Sorted by: ${result.sort_applied.by} (${result.sort_applied.order})`);
  }

  lines.push('');

  if (result.models.length === 0) {
    lines.push('No models match the specified criteria.');
  } else {
    // Show comparison table header
    lines.push('Model Comparison:');
    lines.push('=' .repeat(80));
    lines.push('');

    // Show first 20 models to avoid overwhelming output
    const displayModels = result.models.slice(0, 20);

    for (const model of displayModels) {
      const price = model.pricing.prompt > 0
        ? `$${model.pricing.prompt.toFixed(8)}/token`
        : 'Free';

      lines.push(`#${model.rank} ${model.id}`);
      lines.push(`   Name: ${model.name}`);
      lines.push(`   Context: ${model.context_length.toLocaleString()} tokens`);
      lines.push(`   Price: ${price}`);
      lines.push(`   Modality: ${model.capabilities.modality}`);

      if (model.differentiators.length > 0) {
        lines.push(`   Highlights: ${model.differentiators.join(', ')}`);
      }

      if (model.latency_hint?.available && model.latency_hint.estimated_ms) {
        lines.push(`   Latency: ~${model.latency_hint.estimated_ms}ms`);
      }

      lines.push('');
    }

    if (result.models.length > 20) {
      lines.push(`... and ${result.models.length - 20} more models`);
    }

    // Add comparison summary
    lines.push('=' .repeat(80));
    lines.push('Summary:');

    if (displayModels.length > 0) {
      // Find cheapest and most expensive in displayed set
      const cheapest = displayModels.reduce((min, m) =>
        m.pricing.prompt < min.pricing.prompt ? m : min
      );
      const mostExpensive = displayModels.reduce((max, m) =>
        m.pricing.prompt > max.pricing.prompt ? m : max
      );
      const largestContext = displayModels.reduce((max, m) =>
        m.context_length > max.context_length ? m : max
      );

      lines.push(`   Lowest Price: ${cheapest.id} ($${cheapest.pricing.prompt.toFixed(8)}/token)`);
      lines.push(`   Highest Price: ${mostExpensive.id} ($${mostExpensive.pricing.prompt.toFixed(8)}/token)`);
      lines.push(`   Largest Context: ${largestContext.id} (${largestContext.context_length.toLocaleString()} tokens)`);
    }
  }

  return lines.join('\n');
}

export default createSearchModelsHandler;
