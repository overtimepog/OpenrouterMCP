/**
 * Handler for the openrouter_get_cost_summary tool.
 */

import { CostTracker, CostSummary } from '../../cost/CostTracker.js';
import { Logger } from '../../utils/logger.js';
import {
  GetCostSummaryInput,
  GetCostSummaryResponse,
  ModelCostBreakdown,
  OperationCostBreakdown,
} from './schema.js';

export interface GetCostSummaryHandlerDeps {
  costTracker: CostTracker;
  logger: Logger;
}

/**
 * Format cost summary response for display.
 */
function formatTextResponse(response: GetCostSummaryResponse): string {
  const lines: string[] = [];

  const scopeLabel = response.scope === 'session'
    ? `Session ${response.session_id}`
    : 'Total (All Sessions)';

  lines.push(`## Cost Summary: ${scopeLabel}`);
  lines.push('');

  // Overview
  lines.push('### Overview');
  lines.push(`- **Total Cost:** $${response.total_cost.toFixed(6)}`);
  lines.push(`- **Total Requests:** ${response.request_count}`);
  lines.push(`- **Total Tokens:** ${response.total_tokens.toLocaleString()}`);
  lines.push(`  - Prompt: ${response.total_prompt_tokens.toLocaleString()}`);
  lines.push(`  - Completion: ${response.total_completion_tokens.toLocaleString()}`);

  if (response.time_range.start && response.time_range.end) {
    lines.push('');
    lines.push(`**Time Range:** ${response.time_range.start} to ${response.time_range.end}`);
  }

  // By Model
  if (response.by_model.length > 0) {
    lines.push('');
    lines.push('### Cost by Model');
    lines.push('');

    // Sort by cost descending
    const sortedModels = [...response.by_model].sort((a, b) => b.cost - a.cost);

    for (const model of sortedModels) {
      lines.push(`**${model.model}**`);
      lines.push(`- Cost: $${model.cost.toFixed(6)} (${model.requestCount} requests)`);
      lines.push(`- Tokens: ${model.totalTokens.toLocaleString()} (${model.promptTokens.toLocaleString()} prompt + ${model.completionTokens.toLocaleString()} completion)`);
      lines.push('');
    }
  }

  // By Operation
  if (response.by_operation.length > 0) {
    lines.push('### Cost by Operation');
    lines.push('');

    for (const op of response.by_operation) {
      lines.push(`- **${op.operation}:** $${op.cost.toFixed(6)} (${op.requestCount} requests)`);
    }
  }

  if (response.request_count === 0) {
    lines.push('');
    lines.push('*No cost data recorded yet.*');
  }

  return lines.join('\n');
}

/**
 * Convert CostSummary to response format.
 */
function convertToResponse(
  summary: CostSummary,
  scope: 'session' | 'total',
  sessionId?: string
): GetCostSummaryResponse {
  const byModel: ModelCostBreakdown[] = Object.entries(summary.byModel).map(
    ([model, data]) => ({
      model,
      cost: data.cost,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.totalTokens,
      requestCount: data.requestCount,
    })
  );

  const byOperation: OperationCostBreakdown[] = Object.entries(summary.byOperation).map(
    ([operation, data]) => ({
      operation,
      cost: data.cost,
      requestCount: data.requestCount,
    })
  );

  return {
    scope,
    session_id: sessionId,
    total_cost: summary.totalCost,
    total_prompt_tokens: summary.totalPromptTokens,
    total_completion_tokens: summary.totalCompletionTokens,
    total_tokens: summary.totalTokens,
    request_count: summary.requestCount,
    by_model: byModel,
    by_operation: byOperation,
    time_range: {
      start: summary.timeRange.start?.toISOString() ?? null,
      end: summary.timeRange.end?.toISOString() ?? null,
    },
  };
}

/**
 * Handle get cost summary request.
 */
export async function handleGetCostSummary(
  input: GetCostSummaryInput,
  deps: GetCostSummaryHandlerDeps
): Promise<{
  textResponse: string;
  structuredResponse: GetCostSummaryResponse;
}> {
  const { costTracker, logger } = deps;

  logger.debug('Fetching cost summary', {
    sessionId: input.session_id,
    recentOnly: input.recent_only,
  });

  let summary: CostSummary;
  let scope: 'session' | 'total';

  if (input.session_id) {
    summary = costTracker.getSessionCosts(input.session_id);
    scope = 'session';
  } else {
    summary = costTracker.getTotalCosts();
    scope = 'total';
  }

  const response = convertToResponse(summary, scope, input.session_id);

  logger.info('Cost summary retrieved', {
    scope,
    sessionId: input.session_id,
    totalCost: response.total_cost,
    requestCount: response.request_count,
  });

  return {
    textResponse: formatTextResponse(response),
    structuredResponse: response,
  };
}

export default handleGetCostSummary;
