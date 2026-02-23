import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { GetModelEndpointsInput, GetModelEndpointsResponse, EndpointInfo } from './schema.js';

interface GetModelEndpointsDeps {
  client: OpenRouterClient;
  logger: Logger;
}

export async function handleGetModelEndpoints(
  input: GetModelEndpointsInput,
  deps: GetModelEndpointsDeps
): Promise<{ result: GetModelEndpointsResponse; structuredContent: string }> {
  const { client, logger } = deps;

  logger.info('Fetching model endpoints', { modelSlug: input.model_slug });

  const response = await client.getModelEndpoints(input.model_slug);
  const data = response.data.data;

  const endpoints: EndpointInfo[] = data.endpoints.map(ep => ({
    name: ep.name,
    provider_name: ep.provider_name,
    context_length: ep.context_length,
    max_completion_tokens: ep.max_completion_tokens,
    supported_parameters: ep.supported_parameters,
    quantization: ep.quantization,
    status: ep.status,
    pricing: {
      prompt: ep.pricing.prompt,
      completion: ep.pricing.completion,
      image: ep.pricing.image,
      web_search: ep.pricing.web_search,
      internal_reasoning: ep.pricing.internal_reasoning,
    },
    latency_last_30m: ep.latency_last_30m,
    throughput_last_30m: ep.throughput_last_30m,
    uptime_last_30m: ep.uptime_last_30m,
  }));

  const result: GetModelEndpointsResponse = {
    model_id: data.id,
    model_name: data.name,
    description: data.description,
    endpoints,
    endpoint_count: endpoints.length,
  };

  // Build text summary
  const lines: (string | null)[] = [
    `Model: ${result.model_name} (${result.model_id})`,
    result.description ? `Description: ${result.description}` : null,
    `Endpoints: ${result.endpoint_count}`,
    ``,
  ];

  for (const ep of endpoints) {
    lines.push(`--- ${ep.provider_name} ---`);
    lines.push(`  Context: ${ep.context_length} tokens`);
    if (ep.max_completion_tokens) lines.push(`  Max Output: ${ep.max_completion_tokens} tokens`);
    if (ep.quantization) lines.push(`  Quantization: ${ep.quantization}`);
    if (ep.status) lines.push(`  Status: ${ep.status}`);
    if (ep.pricing.prompt) lines.push(`  Price: ${ep.pricing.prompt}/token (prompt), ${ep.pricing.completion}/token (completion)`);
    if (ep.latency_last_30m) {
      lines.push(`  Latency (30m): p50=${ep.latency_last_30m.p50}ms, p90=${ep.latency_last_30m.p90}ms, p99=${ep.latency_last_30m.p99}ms`);
    }
    if (ep.uptime_last_30m !== undefined) {
      lines.push(`  Uptime (30m): ${(ep.uptime_last_30m * 100).toFixed(1)}%`);
    }
    lines.push(``);
  }

  logger.info('Model endpoints fetched', { modelId: result.model_id, count: result.endpoint_count });

  return { result, structuredContent: lines.filter(l => l !== null).join('\n') };
}
