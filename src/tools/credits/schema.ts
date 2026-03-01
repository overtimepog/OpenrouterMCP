/**
 * Zod schema for the openrouter_get_credits tool.
 */

import { z } from 'zod';

/**
 * Input schema for the get credits tool (no parameters required)
 */
export const GetCreditsInputSchema = z.object({}).describe(
  'No parameters required - retrieves current API key credit balance and usage'
);

export type GetCreditsInput = z.infer<typeof GetCreditsInputSchema>;

/**
 * Response structure for the get credits tool (from /api/v1/key endpoint)
 */
export interface GetCreditsResponse {
  /** Credit limit or null if unlimited */
  limit: number | null;

  /** Remaining credits or null if unlimited */
  limit_remaining: number | null;

  /** Total credits used (all time) */
  usage: number;

  /** Credits used today (UTC) */
  usage_daily: number;

  /** Credits used this week (UTC, Mon start) */
  usage_weekly: number;

  /** Credits used this month (UTC) */
  usage_monthly: number;

  /** Whether this is a free tier key */
  is_free_tier: boolean;
}

export default GetCreditsInputSchema;
