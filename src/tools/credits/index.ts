/**
 * Get Credits Tool for OpenRouter MCP Server.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ApiError } from '../../api/errors.js';
import { GetCreditsInputSchema } from './schema.js';
import { handleGetCredits } from './handler.js';

export * from './schema.js';
export * from './handler.js';

export const GET_CREDITS_TOOL_NAME = 'openrouter_get_credits';

export interface CreateGetCreditsToolOptions {
  client: OpenRouterClient;
  logger: Logger;
}

import { ToolRegistration } from '../../server/OpenRouterServer.js';

/**
 * Tool definition for MCP server registration.
 */
export type GetCreditsToolDefinition = ToolRegistration;

/**
 * Create the get credits tool for MCP server registration.
 */
export function createGetCreditsTool(
  options: CreateGetCreditsToolOptions
): GetCreditsToolDefinition {
  const { client, logger } = options;
  const toolLogger = logger.child('get-credits');

  return {
    name: GET_CREDITS_TOOL_NAME,
    description: `Get your OpenRouter API key credits and usage information.

Returns:
- Credit limit and remaining balance (if set)
- Total usage (all time)
- Usage breakdown: daily, weekly, monthly
- Free tier status

Use this to monitor your API spending and check your key's credit balance.`,
    inputSchema: GetCreditsInputSchema,
    handler: async (_args: unknown) => {
      try {
        const result = await handleGetCredits({
          client,
          logger: toolLogger,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: result.textResponse,
            },
          ],
          structuredContent: result.structuredResponse,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          const mcpError = error.toMcpError();
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error fetching credits: ${mcpError.message} (Code: ${mcpError.code})`,
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
              text: `Error fetching credits: ${errorMessage}`,
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

export default createGetCreditsTool;
