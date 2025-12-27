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

  lines.push('## OpenRouter Account Credits');
  lines.push('');
  lines.push(`**Total Credits:** $${response.total_credits.toFixed(4)}`);
  lines.push(`**Total Usage:** $${response.total_usage.toFixed(4)}`);
  lines.push(`**Available Balance:** $${response.available_balance.toFixed(4)}`);
  lines.push('');
  lines.push(`**Usage:** ${response.usage_percentage.toFixed(1)}%`);

  if (response.available_balance < 1) {
    lines.push('');
    lines.push('⚠️ **Warning:** Low balance - consider adding more credits');
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

  logger.debug('Fetching account credits');

  try {
    const apiResponse = await client.getCredits();
    const data = apiResponse.data.data;

    const response: GetCreditsResponse = {
      total_credits: data.total_credits,
      total_usage: data.total_usage,
      available_balance: data.total_credits - data.total_usage,
      usage_percentage: data.total_credits > 0
        ? (data.total_usage / data.total_credits) * 100
        : 0,
    };

    logger.info('Credits fetched', {
      available: response.available_balance,
      usage: response.usage_percentage,
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
