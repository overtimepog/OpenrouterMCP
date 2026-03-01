/**
 * Handler for the openrouter_get_credits tool.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ApiError } from '../../api/errors.js';
import { GetCreditsResponse } from './schema.js';

export interface GetCreditsHandlerDeps {
  client: OpenRouterClient;
  logger: Logger;
}

/**
 * Format credits response for display.
 */
function formatTextResponse(response: GetCreditsResponse): string {
  const lines: string[] = [];

  lines.push('## OpenRouter API Key Credits');
  lines.push('');

  if (response.limit !== null) {
    lines.push(`**Credit Limit:** $${response.limit.toFixed(4)}`);
    lines.push(`**Remaining:** $${(response.limit_remaining ?? 0).toFixed(4)}`);
  } else {
    lines.push('**Credit Limit:** Unlimited');
  }

  lines.push(`**Total Usage (All Time):** $${response.usage.toFixed(4)}`);
  lines.push('');
  lines.push('### Usage Breakdown');
  lines.push(`- **Today:** $${response.usage_daily.toFixed(4)}`);
  lines.push(`- **This Week:** $${response.usage_weekly.toFixed(4)}`);
  lines.push(`- **This Month:** $${response.usage_monthly.toFixed(4)}`);

  if (response.is_free_tier) {
    lines.push('');
    lines.push('*Free tier key*');
  }

  if (response.limit !== null && response.limit_remaining !== null && response.limit_remaining < 1) {
    lines.push('');
    lines.push('Warning: Low balance - consider adding more credits');
  }

  return lines.join('\n');
}

/**
 * Handle get credits request.
 */
export async function handleGetCredits(
  deps: GetCreditsHandlerDeps
): Promise<{
  textResponse: string;
  structuredResponse: GetCreditsResponse;
}> {
  const { client, logger } = deps;

  logger.debug('Fetching API key credits');

  try {
    const apiResponse = await client.getCredits();
    const data = apiResponse.data.data;

    const response: GetCreditsResponse = {
      limit: data.limit,
      limit_remaining: data.limit_remaining,
      usage: data.usage,
      usage_daily: data.usage_daily,
      usage_weekly: data.usage_weekly,
      usage_monthly: data.usage_monthly,
      is_free_tier: data.is_free_tier,
    };

    logger.info('Credits fetched', {
      limit: response.limit,
      remaining: response.limit_remaining,
      usage: response.usage,
    });

    return {
      textResponse: formatTextResponse(response),
      structuredResponse: response,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      logger.error('API error fetching credits', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error fetching credits', { error: errorMessage });
    throw error;
  }
}

export default handleGetCredits;
