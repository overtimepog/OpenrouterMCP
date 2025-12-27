/**
 * Zod schema for the openrouter_search_models tool.
 * Extends list models with advanced filtering and sorting capabilities.
 */

import { z } from 'zod';
import { ListModelsInputSchema, ModelInfo } from '../listModels/schema.js';

/**
 * Sort field options for model results
 */
export const SortByEnum = z.enum(['price', 'context_length', 'provider']);
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

  /** Sort results by specified field */
  sort_by: SortByEnum
    .optional()
    .describe('Sort results by: price, context_length, or provider'),

  /** Sort order (ascending or descending) */
  sort_order: SortOrderEnum
    .optional()
    .default('asc')
    .describe('Sort order: asc (default) or desc'),
});

export type SearchModelsInput = z.infer<typeof SearchModelsInputSchema>;

/**
 * Extended model information for search results
 * Includes additional metadata for comparison
 */
export interface SearchModelInfo extends ModelInfo {
  /** Ranking position in search results */
  rank: number;
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
