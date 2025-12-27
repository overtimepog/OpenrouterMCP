/**
 * Zod schema for the openrouter_get_credits tool.
 */

import { z } from 'zod';

/**
 * Input schema for the get credits tool (no parameters required)
 */
export const GetCreditsInputSchema = z.object({}).describe(
  'No parameters required - retrieves current account credit balance'
);

export type GetCreditsInput = z.infer<typeof GetCreditsInputSchema>;

/**
 * Response structure for the get credits tool
 */
export interface GetCreditsResponse {
  /** Total credits purchased */
  total_credits: number;

  /** Total credits used */
  total_usage: number;

  /** Available balance (total_credits - total_usage) */
  available_balance: number;

  /** Usage percentage */
  usage_percentage: number;
}

export default GetCreditsInputSchema;
