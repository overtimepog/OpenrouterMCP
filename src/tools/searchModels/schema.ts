/**
 * Zod schema for the openrouter_search_models tool.
 * Extends list models with advanced filtering and sorting capabilities.
 */

import { z } from 'zod';
import { ListModelsInputSchema, ModelInfo } from '../listModels/schema.js';

/**
 * Sort field options for model results
 */
export const SortByEnum = z.enum(['price', 'context_length', 'provider', 'relevance']);
export type SortBy = z.infer<typeof SortByEnum>;

/**
 * Sort order options
 */
export const SortOrderEnum = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderEnum>;

/**
 * Extended input schema for the search models tool
 * Inherits all filters from list models and adds advanced options
 */
export const SearchModelsInputSchema = ListModelsInputSchema.extend({
  /** Free-text search across model ID, name, and description */
  query: z
    .string()
    .optional()
    .describe('Free-text search across model ID, name, and description. Supports multi-word queries. Ranked by relevance when no explicit sort_by is set.'),

  /** Filter by tool/function calling support */
  supports_tools: z
    .boolean()
    .optional()
    .describe('Filter by tool/function calling support'),

  /** Filter by streaming support */
  supports_streaming: z
    .boolean()
    .optional()
    .describe('Filter by streaming response support'),

  /** Filter by temperature parameter support */
  supports_temperature: z
    .boolean()
    .optional()
    .describe('Filter by temperature parameter support'),

  /** Filter by reasoning/thinking support */
  supports_reasoning: z
    .boolean()
    .optional()
    .describe('Filter by reasoning/thinking support'),

  /** Filter by structured output / response_format support */
  supports_json_output: z
    .boolean()
    .optional()
    .describe('Filter by structured output / JSON response_format support'),

  /** Filter by web search plugin support */
  supports_web_search: z
    .boolean()
    .optional()
    .describe('Filter by web search plugin support'),

  /** Filter by image generation capability */
  supports_image_output: z
    .boolean()
    .optional()
    .describe('Filter by image generation capability (output_modalities includes "image")'),

  /** Filter by vision/image input capability */
  supports_vision: z
    .boolean()
    .optional()
    .describe('Filter by vision/image input capability (input_modalities includes "image")'),

  /** Sort results by specified field */
  sort_by: SortByEnum
    .optional()
    .describe('Sort results by: price, context_length, provider, or relevance'),

  /** Sort order (ascending or descending) */
  sort_order: SortOrderEnum
    .optional()
    .default('asc')
    .describe('Sort order: asc (default) or desc'),

  /** Max results to return */
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Max results to return (default 20, max 100)'),
});

export type SearchModelsInput = z.infer<typeof SearchModelsInputSchema>;

/**
 * Extended model information for search results
 * Includes additional metadata for comparison
 */
export interface SearchModelInfo extends ModelInfo {
  /** Ranking position in search results */
  rank: number;
  /** Relevance score from query search (0-1) */
  relevance_score?: number;
  /** Latency hint if available from API */
  latency_hint?: {
    /** Estimated latency in milliseconds */
    estimated_ms?: number;
    /** Whether latency data is available */
    available: boolean;
  };
  /** Key differentiators for comparison */
  differentiators: string[];
}

/**
 * Response structure for the search models tool
 */
export interface SearchModelsResponse {
  models: SearchModelInfo[];
  total_count: number;
  filtered_count: number;
  filters_applied: Partial<SearchModelsInput>;
  sort_applied?: {
    by: SortBy;
    order: SortOrder;
  };
}

export default SearchModelsInputSchema;
