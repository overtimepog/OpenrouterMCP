import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { GetGenerationInput, GetGenerationResponse } from './schema.js';

interface GetGenerationDeps {
  client: OpenRouterClient;
  logger: Logger;
}

export async function handleGetGeneration(
  input: GetGenerationInput,
  deps: GetGenerationDeps
): Promise<{ result: GetGenerationResponse; structuredContent: string }> {
  const { client, logger } = deps;

  logger.info('Fetching generation stats', { generationId: input.generation_id });

  const response = await client.getGeneration(input.generation_id);
  const data = response.data.data;

  const result: GetGenerationResponse = {
    id: data.id,
    model: data.model,
    provider_name: data.provider_name,
    created_at: data.created_at,
    tokens_prompt: data.tokens_prompt,
    tokens_completion: data.tokens_completion,
    native_tokens_prompt: data.native_tokens_prompt,
    native_tokens_completion: data.native_tokens_completion,
    native_tokens_reasoning: data.native_tokens_reasoning,
    native_tokens_cached: data.native_tokens_cached,
    total_cost: data.total_cost,
    cache_discount: data.cache_discount,
    latency: data.latency,
    generation_time: data.generation_time,
    streamed: data.streamed,
    finish_reason: data.finish_reason,
    native_finish_reason: data.native_finish_reason,
  };

  const lines = [
    `Generation: ${result.id}`,
    `Model: ${result.model}`,
    result.provider_name ? `Provider: ${result.provider_name}` : null,
    `Created: ${result.created_at}`,
    ``,
    `Tokens:`,
    `  Prompt: ${result.tokens_prompt}`,
    `  Completion: ${result.tokens_completion}`,
    result.native_tokens_reasoning ? `  Reasoning: ${result.native_tokens_reasoning}` : null,
    result.native_tokens_cached ? `  Cached: ${result.native_tokens_cached}` : null,
    ``,
    `Cost: $${result.total_cost.toFixed(6)}`,
    result.cache_discount ? `Cache Discount: $${result.cache_discount.toFixed(6)}` : null,
    ``,
    `Performance:`,
    `  Latency: ${result.latency}ms`,
    `  Generation Time: ${result.generation_time}ms`,
    `  Streamed: ${result.streamed}`,
    `  Finish Reason: ${result.finish_reason}`,
    result.native_finish_reason ? `  Native Finish Reason: ${result.native_finish_reason}` : null,
  ].filter(Boolean).join('\n');

  logger.info('Generation stats fetched', { generationId: result.id, cost: result.total_cost });

  return { result, structuredContent: lines };
}
