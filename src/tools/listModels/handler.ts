/**
 * Handler for the openrouter_list_models tool.
 * Fetches models from OpenRouter API and applies filters.
 */

import { OpenRouterClient, OpenRouterModel } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ToolResponse } from '../../server/OpenRouterServer.js';
import { ListModelsInput, ModelInfo, ListModelsResponse } from './schema.js';

// ============================================================================
// Types
// ============================================================================

export interface ListModelsHandlerConfig {
  client: OpenRouterClient;
  logger: Logger;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract provider name from model ID (e.g., "openai/gpt-4" -> "openai")
 */
export function extractProvider(modelId: string): string {
  const parts = modelId.split('/');
  return parts[0] ?? modelId;
}

/**
 * Parse price string to number (OpenRouter returns prices as strings)
 */
export function parsePrice(price: string | undefined): number {
  if (!price) return 0;
  const parsed = parseFloat(price);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract modality from model architecture
 */
export function extractModality(model: OpenRouterModel): string {
  const modality = model.architecture?.modality;
  if (!modality) return 'text';

  // OpenRouter modalities can be: "text", "text+image", "image", "audio", etc.
  if (modality.includes('audio')) return 'audio';
  if (modality.includes('image')) return 'vision';
  return 'text';
}

/**
 * Convert OpenRouter model to ModelInfo format
 */
export function toModelInfo(model: OpenRouterModel): ModelInfo {
  return {
    id: model.id,
    name: model.name ?? model.id,
    context_length: model.context_length ?? 0,
    pricing: {
      prompt: parsePrice(model.pricing?.prompt),
      completion: parsePrice(model.pricing?.completion),
    },
    provider: extractProvider(model.id),
    capabilities: {
      modality: extractModality(model),
      supports_tools: undefined, // Would need additional API data
      supports_streaming: true, // Most models support streaming
    },
  };
}

// ============================================================================
// Filter Functions
// ============================================================================

/**
 * Apply provider filter (case-insensitive match)
 */
export function filterByProvider(models: OpenRouterModel[], provider: string): OpenRouterModel[] {
  const providerLower = provider.toLowerCase();
  return models.filter((model) => {
    const modelProvider = extractProvider(model.id).toLowerCase();
    return modelProvider.includes(providerLower);
  });
}

/**
 * Apply keyword filter (substring match on name, case-insensitive)
 */
export function filterByKeyword(models: OpenRouterModel[], keyword: string): OpenRouterModel[] {
  const keywordLower = keyword.toLowerCase();
  return models.filter((model) => {
    const name = (model.name ?? model.id).toLowerCase();
    const id = model.id.toLowerCase();
    return name.includes(keywordLower) || id.includes(keywordLower);
  });
}

/**
 * Apply context length range filter
 */
export function filterByContextLength(
  models: OpenRouterModel[],
  minLength?: number,
  maxLength?: number
): OpenRouterModel[] {
  return models.filter((model) => {
    const contextLength = model.context_length ?? 0;

    if (minLength !== undefined && contextLength < minLength) {
      return false;
    }
    if (maxLength !== undefined && contextLength > maxLength) {
      return false;
    }
    return true;
  });
}

/**
 * Apply modality filter
 */
export function filterByModality(models: OpenRouterModel[], modality: string): OpenRouterModel[] {
  return models.filter((model) => {
    const modelModality = extractModality(model);
    return modelModality === modality;
  });
}

/**
 * Apply price range filter (based on prompt price)
 */
export function filterByPrice(
  models: OpenRouterModel[],
  minPrice?: number,
  maxPrice?: number
): OpenRouterModel[] {
  return models.filter((model) => {
    const price = parsePrice(model.pricing?.prompt);

    if (minPrice !== undefined && price < minPrice) {
      return false;
    }
    if (maxPrice !== undefined && price > maxPrice) {
      return false;
    }
    return true;
  });
}

/**
 * Apply all filters to the model list
 */
export function applyFilters(
  models: OpenRouterModel[],
  input: ListModelsInput
): OpenRouterModel[] {
  let filtered = [...models];

  if (input.provider) {
    filtered = filterByProvider(filtered, input.provider);
  }

  if (input.keyword) {
    filtered = filterByKeyword(filtered, input.keyword);
  }

  filtered = filterByContextLength(filtered, input.min_context_length, input.max_context_length);

  if (input.modality) {
    filtered = filterByModality(filtered, input.modality);
  }

  filtered = filterByPrice(filtered, input.min_price, input.max_price);

  return filtered;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Create the list models handler
 */
export function createListModelsHandler(config: ListModelsHandlerConfig) {
  const { client, logger } = config;

  return async (input: ListModelsInput): Promise<ToolResponse> => {
    logger.debug('Executing list models tool', { filters: input });

    try {
      // Fetch models from API (uses caching internally)
      const response = await client.listModels();
      const allModels = response.data;
      const totalCount = allModels.length;

      logger.debug('Fetched models from API', {
        count: totalCount,
        cached: response.cached,
      });

      // Apply filters
      const filteredModels = applyFilters(allModels, input);
      const filteredCount = filteredModels.length;

      logger.debug('Applied filters', {
        totalCount,
        filteredCount,
        filters: input,
      });

      // Convert to ModelInfo format
      const models = filteredModels.map(toModelInfo);

      // Build response
      const result: ListModelsResponse = {
        models,
        total_count: totalCount,
        filtered_count: filteredCount,
        filters_applied: Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined)
        ) as Partial<ListModelsInput>,
      };

      // Format text response
      const textResponse = formatTextResponse(result);

      return {
        content: [{ type: 'text', text: textResponse }],
        structuredContent: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('List models tool failed', { error: errorMessage });

      return {
        content: [
          {
            type: 'text',
            text: `Error fetching models: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Format the response as human-readable text
 */
function formatTextResponse(result: ListModelsResponse): string {
  const lines: string[] = [];

  lines.push(`Found ${result.filtered_count} models (out of ${result.total_count} total)`);

  if (Object.keys(result.filters_applied).length > 0) {
    lines.push(`Filters: ${JSON.stringify(result.filters_applied)}`);
  }

  lines.push('');

  if (result.models.length === 0) {
    lines.push('No models match the specified filters.');
  } else {
    // Show first 20 models to avoid overwhelming output
    const displayModels = result.models.slice(0, 20);

    for (const model of displayModels) {
      const price = model.pricing.prompt > 0
        ? `$${model.pricing.prompt.toFixed(8)}/token`
        : 'Free';

      lines.push(`- ${model.id}`);
      lines.push(`  Name: ${model.name}`);
      lines.push(`  Context: ${model.context_length.toLocaleString()} tokens`);
      lines.push(`  Price: ${price}`);
      lines.push(`  Modality: ${model.capabilities.modality}`);
      lines.push('');
    }

    if (result.models.length > 20) {
      lines.push(`... and ${result.models.length - 20} more models`);
    }
  }

  return lines.join('\n');
}

export default createListModelsHandler;
