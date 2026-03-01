/**
 * Search Models Tool - Entry Point
 * Exports the tool registration for the MCP server.
 */

export {
  SearchModelsInputSchema,
  type SearchModelsInput,
  type SearchModelInfo,
  type SearchModelsResponse,
  SortByEnum,
  SortOrderEnum,
  type SortBy,
  type SortOrder,
} from './schema.js';

export {
  createSearchModelsHandler,
  type SearchModelsHandlerConfig,
  filterByToolsSupport,
  filterByStreamingSupport,
  filterByTemperatureSupport,
  applyAdvancedFilters,
  sortByPrice,
  sortByContextLength,
  sortByProvider,
  applySorting,
} from './handler.js';

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ToolRegistration, ToolResponse } from '../../server/OpenRouterServer.js';
import { SearchModelsInputSchema, SearchModelsInput } from './schema.js';
import { createSearchModelsHandler } from './handler.js';

/**
 * Tool name constant
 */
export const SEARCH_MODELS_TOOL_NAME = 'openrouter_search_models';

/**
 * Tool description
 */
export const SEARCH_MODELS_TOOL_DESCRIPTION = `Search and compare AI models from OpenRouter with advanced filtering and sorting.
IMPORTANT: You MUST call this tool (or openrouter_list_models) BEFORE calling openrouter_chat or openrouter_generate_image to discover current, valid model IDs. Never guess model IDs from memory - always look them up first to ensure you use the latest available models.

Features:
- Filter by tool/function calling, streaming, and temperature support
- Sort by price, context length, or provider
- Latency hints (when available)
- Side-by-side comparison output with model rankings`;

/**
 * Create the search models tool registration for the MCP server
 */
export function createSearchModelsTool(config: {
  client: OpenRouterClient;
  logger: Logger;
}): ToolRegistration {
  const { client, logger } = config;

  const innerHandler = createSearchModelsHandler({
    client,
    logger: logger.child('search-models'),
  });

  // Wrap the handler to accept unknown input and validate/cast appropriately
  const handler = async (args: unknown): Promise<ToolResponse> => {
    // The Zod validation is done by the server before calling the handler,
    // so we can safely cast args to the expected type
    return innerHandler(args as SearchModelsInput);
  };

  return {
    name: SEARCH_MODELS_TOOL_NAME,
    description: SEARCH_MODELS_TOOL_DESCRIPTION,
    inputSchema: SearchModelsInputSchema,
    handler,
  };
}

export default createSearchModelsTool;
