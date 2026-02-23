import { z } from 'zod';

export const GetModelEndpointsInputSchema = z.object({
  model_slug: z.string().min(1, 'Model slug is required')
    .describe('Model identifier in "author/model-name" format (e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4")'),
});

export type GetModelEndpointsInput = z.infer<typeof GetModelEndpointsInputSchema>;

export interface EndpointInfo {
  name: string;
  provider_name: string;
  context_length: number;
  max_completion_tokens?: number;
  supported_parameters?: string[];
  quantization?: string;
  status?: string;
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
    web_search?: string;
    internal_reasoning?: string;
  };
  latency_last_30m?: {
    p50?: number;
    p75?: number;
    p90?: number;
    p99?: number;
  };
  throughput_last_30m?: {
    p50?: number;
    p75?: number;
    p90?: number;
    p99?: number;
  };
  uptime_last_30m?: number;
}

export interface GetModelEndpointsResponse {
  model_id: string;
  model_name: string;
  description?: string;
  endpoints: EndpointInfo[];
  endpoint_count: number;
}

export default GetModelEndpointsInputSchema;
