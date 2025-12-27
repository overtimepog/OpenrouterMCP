/**
 * List Models Tool - Entry Point
 * Exports the tool registration for the MCP server.
 */

export { ListModelsInputSchema, type ListModelsInput, type ModelInfo, type ListModelsResponse } from './schema.js';
export { createListModelsHandler, type ListModelsHandlerConfig } from './handler.js';

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ToolRegistration, ToolResponse } from '../../server/OpenRouterServer.js';
import { ListModelsInputSchema, ListModelsInput } from './schema.js';
import { createListModelsHandler } from './handler.js';

/**
 * Tool name constant
 */
export const LIST_MODELS_TOOL_NAME = 'openrouter_list_models';

/**
 * Tool description
 */
export const LIST_MODELS_TOOL_DESCRIPTION = `List all available AI models from OpenRouter with optional filtering.
Filters by provider, keyword, context length, modality, and price.
Returns model IDs, names, context lengths, pricing, and capabilities.`;

/**
 * Create the list models tool registration for the MCP server
 */
export function createListModelsTool(config: {
  client: OpenRouterClient;
  logger: Logger;
}): ToolRegistration {
  const { client, logger } = config;

  const innerHandler = createListModelsHandler({
    client,
    logger: logger.child('list-models'),
  });

  // Wrap the handler to accept unknown input and validate/cast appropriately
  const handler = async (args: unknown): Promise<ToolResponse> => {
    // The Zod validation is done by the server before calling the handler,
    // so we can safely cast args to the expected type
    return innerHandler(args as ListModelsInput);
  };

  return {
    name: LIST_MODELS_TOOL_NAME,
    description: LIST_MODELS_TOOL_DESCRIPTION,
    inputSchema: ListModelsInputSchema,
    handler,
  };
}

export default createListModelsTool;
