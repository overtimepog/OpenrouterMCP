/**
 * Zod schema for the openrouter_list_models tool.
 * Defines input validation for model listing and filtering.
 */

import { z } from 'zod';

/**
 * Modality options for model filtering
 */
export const ModalityEnum = z.enum(['text', 'vision', 'audio']);
export type Modality = z.infer<typeof ModalityEnum>;

/**
 * Input schema for the list models tool
 */
export const ListModelsInputSchema = z.object({
  /** Filter by provider name (case-insensitive match) */
  provider: z
    .string()
    .optional()
    .describe('Filter by provider name (e.g., "openai", "anthropic")'),

  /** Search keyword in model name (substring match) */
  keyword: z
    .string()
    .optional()
    .describe('Search for keyword in model name'),

  /** Minimum context length (tokens) */
  min_context_length: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Minimum context length in tokens'),

  /** Maximum context length (tokens) */
  max_context_length: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum context length in tokens'),

  /** Filter by modality (text, vision, audio) */
  modality: ModalityEnum
    .optional()
    .describe('Filter by model modality'),

  /** Minimum price per token (prompt price) */
  min_price: z
    .number()
    .nonnegative()
    .optional()
    .describe('Minimum price per prompt token'),

  /** Maximum price per token (prompt price) */
  max_price: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum price per prompt token'),
});

export type ListModelsInput = z.infer<typeof ListModelsInputSchema>;

/**
 * Model representation in the response
 */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
    request?: number;
    image?: number;
    web_search?: number;
    internal_reasoning?: number;
    input_cache_read?: number;
    input_cache_write?: number;
  };
  provider: string;
  capabilities: {
    modality: string;
    input_modalities?: string[];
    output_modalities?: string[];
    supports_tools?: boolean;
    supports_streaming?: boolean;
    supports_temperature?: boolean;
    supports_reasoning?: boolean;
    supports_json_output?: boolean;
    supports_web_search?: boolean;
  };
  supported_parameters?: string[];
  per_request_limits?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
}

/**
 * Response structure for the list models tool
 */
export interface ListModelsResponse {
  models: ModelInfo[];
  total_count: number;
  filtered_count: number;
  filters_applied: Partial<ListModelsInput>;
}

export default ListModelsInputSchema;
