/**
 * Get Generation Tool for OpenRouter MCP Server.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ApiError } from '../../api/errors.js';
import { GetGenerationInputSchema } from './schema.js';
import { handleGetGeneration } from './handler.js';

export * from './schema.js';
export * from './handler.js';

export const GET_GENERATION_TOOL_NAME = 'openrouter_get_generation';

export interface CreateGetGenerationToolOptions {
  client: OpenRouterClient;
  logger: Logger;
}

import { ToolRegistration } from '../../server/OpenRouterServer.js';

/**
 * Tool definition for MCP server registration.
 */
export type GetGenerationToolDefinition = ToolRegistration;

/**
 * Create the get generation tool for MCP server registration.
 */
export function createGetGenerationTool(
  options: CreateGetGenerationToolOptions
): GetGenerationToolDefinition {
  const { client, logger } = options;
  const toolLogger = logger.child('get-generation');

  return {
    name: GET_GENERATION_TOOL_NAME,
    description: `Get detailed stats for a specific generation including tokens, cost, latency, and provider info`,
    inputSchema: GetGenerationInputSchema,
    handler: async (args: unknown) => {
      try {
        const input = GetGenerationInputSchema.parse(args);
        const result = await handleGetGeneration(input, {
          client,
          logger: toolLogger,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: result.structuredContent,
            },
          ],
          structuredContent: result.result,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          const mcpError = error.toMcpError();
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error fetching generation stats: ${mcpError.message} (Code: ${mcpError.code})`,
              },
            ],
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
              text: `Error fetching generation stats: ${errorMessage}`,
            },
          ],
          structuredContent: {
            error: true,
            message: errorMessage,
          },
        };
      }
    },
  };
}

export default createGetGenerationTool;
