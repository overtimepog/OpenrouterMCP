import { z } from 'zod';

export const GetGenerationInputSchema = z.object({
  generation_id: z.string().min(1, 'Generation ID is required')
    .describe('The generation ID returned from a chat completion response'),
});

export type GetGenerationInput = z.infer<typeof GetGenerationInputSchema>;

export interface GetGenerationResponse {
  id: string;
  model: string;
  provider_name?: string;
  created_at: string;
  tokens_prompt: number;
  tokens_completion: number;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  native_tokens_reasoning?: number;
  native_tokens_cached?: number;
  total_cost: number;
  cache_discount?: number | null;
  latency: number;
  generation_time: number;
  streamed: boolean;
  finish_reason: string;
  native_finish_reason?: string;
}

export default GetGenerationInputSchema;
