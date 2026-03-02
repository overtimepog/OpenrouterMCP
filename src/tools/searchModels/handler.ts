/**
 * Handler for the openrouter_search_models tool.
 * Extends list models with advanced filtering, sorting, and comparison features.
 */

import { OpenRouterClient, OpenRouterModel } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ToolResponse } from '../../server/OpenRouterServer.js';
import { computeSimilarity } from '../../utils/modelValidation.js';
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
    const hasToolSupport = model.supported_parameters?.includes('tools') ?? false;
    return supportsTools ? hasToolSupport : !hasToolSupport;
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
  return models.filter((_model) => {
    // Most models support streaming; only image-only models don't
    const hasStreamingSupport = true;
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
    const hasTemperatureSupport = model.supported_parameters?.includes('temperature') ?? true;
    return supportsTemperature ? hasTemperatureSupport : !hasTemperatureSupport;
  });
}

// ============================================================================
// Query Scoring
// ============================================================================

export interface ScoredModel {
  model: OpenRouterModel;
  score: number;
}

/**
 * Score models by a free-text query. Supports multi-word queries.
 * Returns models sorted by relevance score descending, filtered above threshold.
 */
export function scoreByQuery(
  models: OpenRouterModel[],
  query: string,
  threshold: number = 0.05
): ScoredModel[] {
  const queryLower = query.toLowerCase().trim();
  if (!queryLower) return models.map(m => ({ model: m, score: 0 }));

  const terms = queryLower.split(/\s+/).filter(t => t.length > 0);

  const scored: ScoredModel[] = models.map(model => {
    const idLower = model.id.toLowerCase();
    const nameLower = (model.name ?? '').toLowerCase();
    const descLower = (model.description ?? '').toLowerCase();
    const paramsStr = (model.supported_parameters ?? []).join(' ').toLowerCase();

    // Full-query similarity against model ID (reuse existing utility)
    const fullSimilarity = computeSimilarity(queryLower, idLower);

    // Per-term matching
    let termScore = 0;
    let termsMatched = 0;

    for (const term of terms) {
      let bestTermScore = 0;

      // Exact substring in id or name = high weight
      if (idLower.includes(term)) {
        bestTermScore = Math.max(bestTermScore, 0.4);
      }
      if (nameLower.includes(term)) {
        bestTermScore = Math.max(bestTermScore, 0.35);
      }

      // Substring in description = medium weight
      if (descLower.includes(term)) {
        bestTermScore = Math.max(bestTermScore, 0.15);
      }

      // Substring in supported_parameters = low weight
      if (paramsStr.includes(term)) {
        bestTermScore = Math.max(bestTermScore, 0.05);
      }

      if (bestTermScore > 0) {
        termsMatched++;
      }
      termScore += bestTermScore;
    }

    // Normalize term score by number of terms
    const normalizedTermScore = terms.length > 0 ? termScore / terms.length : 0;

    // Bonus for matching all terms
    const allTermsBonus = terms.length > 1 && termsMatched === terms.length ? 0.15 : 0;

    // Combine: full similarity + per-term matching + all-terms bonus
    const score = Math.min(
      fullSimilarity * 0.4 + normalizedTermScore * 0.5 + allTermsBonus,
      1.0
    );

    return { model, score };
  });

  return scored
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

// ============================================================================
// New Capability Filter Functions
// ============================================================================

/**
 * Filter models by reasoning/thinking support
 */
export function filterByReasoningSupport(
  models: OpenRouterModel[],
  supportsReasoning: boolean
): OpenRouterModel[] {
  return models.filter(model => {
    const has = model.supported_parameters?.includes('reasoning') ?? false;
    return supportsReasoning ? has : !has;
  });
}

/**
 * Filter models by structured output / response_format support
 */
export function filterByJsonOutputSupport(
  models: OpenRouterModel[],
  supportsJsonOutput: boolean
): OpenRouterModel[] {
  return models.filter(model => {
    const params = model.supported_parameters ?? [];
    const has = params.includes('structured_outputs') || params.includes('response_format');
    return supportsJsonOutput ? has : !has;
  });
}

/**
 * Filter models by web search plugin support
 */
export function filterByWebSearchSupport(
  models: OpenRouterModel[],
  supportsWebSearch: boolean
): OpenRouterModel[] {
  return models.filter(model => {
    const has = model.supported_parameters?.includes('web_search') ?? false;
    return supportsWebSearch ? has : !has;
  });
}

/**
 * Filter models by image generation capability (output_modalities includes "image")
 */
export function filterByImageOutputSupport(
  models: OpenRouterModel[],
  supportsImageOutput: boolean
): OpenRouterModel[] {
  return models.filter(model => {
    const has = model.architecture?.output_modalities?.includes('image') ?? false;
    return supportsImageOutput ? has : !has;
  });
}

/**
 * Filter models by vision/image input capability (input_modalities includes "image")
 */
export function filterByVisionSupport(
  models: OpenRouterModel[],
  supportsVision: boolean
): OpenRouterModel[] {
  return models.filter(model => {
    const has = model.architecture?.input_modalities?.includes('image') ?? false;
    return supportsVision ? has : !has;
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

  // Apply reasoning support filter
  if (input.supports_reasoning !== undefined) {
    filtered = filterByReasoningSupport(filtered, input.supports_reasoning);
  }

  // Apply JSON output support filter
  if (input.supports_json_output !== undefined) {
    filtered = filterByJsonOutputSupport(filtered, input.supports_json_output);
  }

  // Apply web search support filter
  if (input.supports_web_search !== undefined) {
    filtered = filterByWebSearchSupport(filtered, input.supports_web_search);
  }

  // Apply image output support filter
  if (input.supports_image_output !== undefined) {
    filtered = filterByImageOutputSupport(filtered, input.supports_image_output);
  }

  // Apply vision support filter
  if (input.supports_vision !== undefined) {
    filtered = filterByVisionSupport(filtered, input.supports_vision);
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
    case 'relevance':
      // Relevance sorting is handled by scoreByQuery in the main handler;
      // if called directly, just return as-is (already sorted by score)
      return models;
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
  const supportedParams = model.supported_parameters ?? [];
  const inputMods = model.architecture?.input_modalities ?? [];
  const outputMods = model.architecture?.output_modalities ?? [];

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

  // Capability differentiators from real API data
  if (inputMods.includes('image') || inputMods.includes('vision')) {
    differentiators.push('Vision Capable');
  }

  if (outputMods.includes('image')) {
    differentiators.push('Image Generation');
  }

  if (inputMods.includes('audio') || outputMods.includes('audio')) {
    differentiators.push('Audio Capable');
  }

  // Tool support from supported_parameters
  if (supportedParams.includes('tools')) {
    differentiators.push('Tool Calling');
  }

  // Reasoning support from supported_parameters
  if (supportedParams.includes('reasoning')) {
    differentiators.push('Reasoning');
  }

  // Web search support from supported_parameters
  if (supportedParams.includes('web_search')) {
    differentiators.push('Web Search');
  }

  // JSON output support
  if (supportedParams.includes('structured_outputs') || supportedParams.includes('response_format')) {
    differentiators.push('Structured Output');
  }

  // Provider from model ID
  const provider = extractProvider(model.id);
  differentiators.push(provider);

  return differentiators;
}

/**
 * Convert OpenRouterModel to SearchModelInfo with ranking and extras
 */
export function toSearchModelInfo(
  model: OpenRouterModel,
  rank: number,
  relevanceScore?: number
): SearchModelInfo {
  const baseInfo = toModelInfo(model);

  return {
    ...baseInfo,
    rank,
    relevance_score: relevanceScore,
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
      query: input.query,
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

      // Step 1: If query is provided, score models by relevance first
      let scoredResults: ScoredModel[] | undefined;
      let workingModels: OpenRouterModel[];

      if (input.query) {
        scoredResults = scoreByQuery(allModels, input.query);
        workingModels = scoredResults.map(s => s.model);
        logger.debug('Applied query scoring', {
          query: input.query,
          matchCount: scoredResults.length,
        });
      } else {
        workingModels = allModels;
      }

      // Step 2: Apply all filters (base + advanced)
      let filteredModels = applyAdvancedFilters(workingModels, input);
      const filteredCount = filteredModels.length;

      logger.debug('Applied filters', {
        totalCount,
        filteredCount,
        filters: input,
      });

      // Step 3: Apply sorting
      // If no sort_by and query was provided, default to relevance sort
      const effectiveSortBy = input.sort_by ?? (input.query ? 'relevance' : undefined);
      // Default to desc for relevance (best matches first), asc for everything else
      const sortOrder = input.sort_order ?? (effectiveSortBy === 'relevance' ? 'desc' : 'asc');

      if (effectiveSortBy && effectiveSortBy !== 'relevance') {
        filteredModels = applySorting(filteredModels, effectiveSortBy, sortOrder);
      } else if (effectiveSortBy === 'relevance' && sortOrder === 'asc') {
        // Models come from scoreByQuery in best-first (desc) order; reverse for asc
        filteredModels = filteredModels.slice().reverse();
      }
      // For relevance sort with desc (default): best matches first, already ordered by scoreByQuery

      if (effectiveSortBy) {
        logger.debug('Applied sorting', {
          sortBy: effectiveSortBy,
          sortOrder,
        });
      }

      // Step 4: Apply limit
      const limit = input.limit ?? 20;
      const limitedModels = filteredModels.slice(0, limit);

      // Step 5: Build score lookup for relevance_score attachment
      const scoreMap = new Map<string, number>();
      if (scoredResults) {
        for (const s of scoredResults) {
          scoreMap.set(s.model.id, s.score);
        }
      }

      // Convert to SearchModelInfo with ranking and optional relevance_score
      const models = limitedModels.map((model, index) =>
        toSearchModelInfo(
          model,
          index + 1,
          scoreMap.get(model.id)
        )
      );

      // Build response
      const result: SearchModelsResponse = {
        models,
        total_count: totalCount,
        filtered_count: filteredCount,
        filters_applied: Object.fromEntries(
          Object.entries(input).filter(([k, v]) => v !== undefined && k !== 'limit')
        ) as Partial<SearchModelsInput>,
        sort_applied: effectiveSortBy ? {
          by: effectiveSortBy,
          order: sortOrder,
        } : undefined,
      };

      // Format text response
      const textResponse = formatTextResponse(result, limit);

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
function formatTextResponse(result: SearchModelsResponse, limit: number = 20): string {
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

    // Display all models (already limited by the handler)
    for (const model of result.models) {
      const price = model.pricing.prompt > 0
        ? `$${model.pricing.prompt.toFixed(8)}/token`
        : 'Free';

      lines.push(`#${model.rank} ${model.id}`);
      lines.push(`   Name: ${model.name}`);
      lines.push(`   Context: ${model.context_length.toLocaleString()} tokens`);
      lines.push(`   Price: ${price}`);
      lines.push(`   Modality: ${model.capabilities.modality}`);

      if (model.relevance_score !== undefined) {
        lines.push(`   Relevance: ${(model.relevance_score * 100).toFixed(1)}%`);
      }

      if (model.differentiators.length > 0) {
        lines.push(`   Highlights: ${model.differentiators.join(', ')}`);
      }

      if (model.latency_hint?.available && model.latency_hint.estimated_ms) {
        lines.push(`   Latency: ~${model.latency_hint.estimated_ms}ms`);
      }

      lines.push('');
    }

    if (result.filtered_count > limit) {
      lines.push(`Showing ${result.models.length} of ${result.filtered_count} matching models`);
    }

    // Add comparison summary
    lines.push('=' .repeat(80));
    lines.push('Summary:');

    if (result.models.length > 0) {
      // Find cheapest and most expensive in displayed set
      const cheapest = result.models.reduce((min, m) =>
        m.pricing.prompt < min.pricing.prompt ? m : min
      );
      const mostExpensive = result.models.reduce((max, m) =>
        m.pricing.prompt > max.pricing.prompt ? m : max
      );
      const largestContext = result.models.reduce((max, m) =>
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
