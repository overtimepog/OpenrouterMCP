/**
 * Get Cost Summary Tool for OpenRouter MCP Server.
 */

import { CostTracker } from '../../cost/CostTracker.js';
import { Logger } from '../../utils/logger.js';
import { GetCostSummaryInputSchema, GetCostSummaryInput } from './schema.js';
import { handleGetCostSummary } from './handler.js';

export * from './schema.js';
export * from './handler.js';

export const GET_COST_SUMMARY_TOOL_NAME = 'openrouter_get_cost_summary';

export interface CreateGetCostSummaryToolOptions {
  costTracker: CostTracker;
  logger: Logger;
}

import { ToolRegistration } from '../../server/OpenRouterServer.js';

/**
 * Tool definition for MCP server registration.
 */
export type GetCostSummaryToolDefinition = ToolRegistration;

/**
 * Create the get cost summary tool for MCP server registration.
 */
export function createGetCostSummaryTool(
  options: CreateGetCostSummaryToolOptions
): GetCostSummaryToolDefinition {
  const { costTracker, logger } = options;
  const toolLogger = logger.child('get-cost-summary');

  return {
    name: GET_COST_SUMMARY_TOOL_NAME,
    description: `Get a summary of API costs for the current session or all sessions.

Parameters:
- session_id (optional): Get costs for a specific session
- recent_only (optional): Only show recent entries

Returns:
- Total cost in credits
- Token usage breakdown (prompt, completion, total)
- Request count
- Cost breakdown by model
- Cost breakdown by operation type (chat, image, etc.)

Use this to monitor your API spending and optimize model usage.`,
    inputSchema: GetCostSummaryInputSchema,
    handler: async (args: unknown) => {
      // The Zod validation is done by the server before calling the handler
      const input = args as GetCostSummaryInput;
      const result = await handleGetCostSummary(input, {
        costTracker,
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

export default createGetCostSummaryTool;
