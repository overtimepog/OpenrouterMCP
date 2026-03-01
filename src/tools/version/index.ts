/**
 * Get Version Tool for OpenRouter MCP Server.
 */

import { Logger } from '../../utils/logger.js';
import { GetVersionInputSchema } from './schema.js';
import { handleGetVersion } from './handler.js';

export * from './schema.js';
export * from './handler.js';

export const GET_VERSION_TOOL_NAME = 'openrouter_get_version';

export interface CreateGetVersionToolOptions {
  logger: Logger;
}

import { ToolRegistration } from '../../server/OpenRouterServer.js';

/**
 * Tool definition for MCP server registration.
 */
export type GetVersionToolDefinition = ToolRegistration;

/**
 * Create the get version tool for MCP server registration.
 */
export function createGetVersionTool(
  options: CreateGetVersionToolOptions
): GetVersionToolDefinition {
  const { logger } = options;
  const toolLogger = logger.child('get-version');

  return {
    name: GET_VERSION_TOOL_NAME,
    description: `Get the OpenRouter MCP server version information.

Returns:
- Server package name
- Server version number
- Node.js runtime version

Use this to check the server version for compatibility or issue reporting.`,
    inputSchema: GetVersionInputSchema,
    handler: async (_args: unknown) => {
      const result = await handleGetVersion({
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
    },
  };
}

export default createGetVersionTool;
