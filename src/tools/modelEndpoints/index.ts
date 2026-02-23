/**
 * Get Model Endpoints Tool for OpenRouter MCP Server.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ApiError } from '../../api/errors.js';
import { GetModelEndpointsInputSchema } from './schema.js';
import { handleGetModelEndpoints } from './handler.js';

export * from './schema.js';
export * from './handler.js';

export const GET_MODEL_ENDPOINTS_TOOL_NAME = 'openrouter_get_model_endpoints';

export interface CreateGetModelEndpointsToolOptions {
  client: OpenRouterClient;
  logger: Logger;
}

import { ToolRegistration } from '../../server/OpenRouterServer.js';

/**
 * Tool definition for MCP server registration.
 */
export type GetModelEndpointsToolDefinition = ToolRegistration;

/**
 * Create the get model endpoints tool for MCP server registration.
 */
export function createGetModelEndpointsTool(
  options: CreateGetModelEndpointsToolOptions
): GetModelEndpointsToolDefinition {
  const { client, logger } = options;
  const toolLogger = logger.child('get-model-endpoints');

  return {
    name: GET_MODEL_ENDPOINTS_TOOL_NAME,
    description: `Get all available providers/endpoints for a model with latency, uptime, pricing, and capability details.

Returns for each endpoint/provider:
- Context length and max completion tokens
- Pricing per token (prompt and completion)
- Latency percentiles (p50, p90, p99) over last 30 minutes
- Uptime percentage over last 30 minutes
- Supported parameters and quantization info

Use this to compare providers for a specific model and choose the best one for your needs.`,
    inputSchema: GetModelEndpointsInputSchema,
    handler: async (args: unknown) => {
      try {
        const input = GetModelEndpointsInputSchema.parse(args);
        const { result, structuredContent } = await handleGetModelEndpoints(input, {
          client,
          logger: toolLogger,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: structuredContent,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          const mcpError = error.toMcpError();
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error fetching model endpoints: ${mcpError.message} (Code: ${mcpError.code})`,
              },
            ],
            isError: true,
            structuredContent: {
              error: true,
              code: mcpError.code,
              message: mcpError.message,
            },
          };
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error fetching model endpoints: ${errorMessage}`,
            },
          ],
          isError: true,
          structuredContent: {
            error: true,
            message: errorMessage,
          },
        };
      }
    },
  };
}

export default createGetModelEndpointsTool;
