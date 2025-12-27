/**
 * Zod schema for the openrouter_get_cost_summary tool.
 */

import { z } from 'zod';

/**
 * Input schema for the get cost summary tool
 */
export const GetCostSummaryInputSchema = z.object({
  /** Optional session ID to get costs for a specific session */
  session_id: z
    .string()
    .optional()
    .describe('Optional session ID to get costs for a specific session. If not provided, returns total costs.'),

  /** Optional: only show recent entries */
  recent_only: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, only show the most recent 50 cost entries'),
});

export type GetCostSummaryInput = z.infer<typeof GetCostSummaryInputSchema>;

/**
 * Model cost breakdown
 */
export interface ModelCostBreakdown {
  model: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

/**
 * Operation cost breakdown
 */
export interface OperationCostBreakdown {
  operation: string;
  cost: number;
  requestCount: number;
}

/**
 * Response structure for the get cost summary tool
 */
export interface GetCostSummaryResponse {
  /** Scope of this summary (session or total) */
  scope: 'session' | 'total';

  /** Session ID if applicable */
  session_id?: string;

  /** Total cost in credits */
  total_cost: number;

  /** Total prompt tokens */
  total_prompt_tokens: number;

  /** Total completion tokens */
  total_completion_tokens: number;

  /** Total tokens */
  total_tokens: number;

  /** Total number of requests */
  request_count: number;

  /** Cost breakdown by model */
  by_model: ModelCostBreakdown[];

  /** Cost breakdown by operation type */
  by_operation: OperationCostBreakdown[];

  /** Time range of the data */
  time_range: {
    start: string | null;
    end: string | null;
  };
}

export default GetCostSummaryInputSchema;
