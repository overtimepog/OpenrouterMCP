/**
 * Search Models Tool Tests
 * Tests: Tool support filter, sorting by price, sorting by context length
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterClient, OpenRouterModel } from '../../src/api/OpenRouterClient.js';
import { Logger } from '../../src/utils/logger.js';
import {
  createSearchModelsHandler,
  filterByToolsSupport,
  filterByStreamingSupport,
  filterByTemperatureSupport,
  applyAdvancedFilters,
  sortByPrice,
  sortByContextLength,
  sortByProvider,
  applySorting,
} from '../../src/tools/searchModels/handler.js';
import { SearchModelsInputSchema, SearchModelsInput } from '../../src/tools/searchModels/schema.js';

// Create a silent logger for tests
const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'test' });
};

// Mock models for testing with varied capabilities
const mockModels: OpenRouterModel[] = [
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    context_length: 128000,
    pricing: { prompt: '0.00001', completion: '0.00003' },
    architecture: { modality: 'text+image', tokenizer: 'gpt-4', input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream', 'response_format'],
  },
  {
    id: 'openai/gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    context_length: 16385,
    pricing: { prompt: '0.0000005', completion: '0.0000015' },
    architecture: { modality: 'text', tokenizer: 'gpt-3.5', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream'],
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    context_length: 200000,
    pricing: { prompt: '0.000015', completion: '0.000075' },
    architecture: { modality: 'text+image', tokenizer: 'claude', input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream'],
  },
  {
    id: 'anthropic/claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: { modality: 'text', tokenizer: 'claude', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream'],
  },
  {
    id: 'google/gemini-pro',
    name: 'Gemini Pro',
    context_length: 32768,
    pricing: { prompt: '0.0000005', completion: '0.0000015' },
    architecture: { modality: 'text', tokenizer: 'gemini', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream'],
  },
  {
    id: 'meta-llama/llama-3-70b',
    name: 'Llama 3 70B',
    context_length: 8192,
    pricing: { prompt: '0', completion: '0' },
    architecture: { modality: 'text', tokenizer: 'llama', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['temperature', 'top_p', 'max_tokens', 'stream'],
  },
  {
    id: 'cohere/command-r-plus',
    name: 'Command R Plus',
    context_length: 128000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: { modality: 'text', tokenizer: 'command', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream'],
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    context_length: 32768,
    pricing: { prompt: '0.000004', completion: '0.000012' },
    architecture: { modality: 'text', tokenizer: 'mistral', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream'],
  },
];

// ============================================================================
// Test 1: Filtering by Tool/Function Calling Support
// ============================================================================

describe('Tool/Function Calling Support Filter', () => {
  it('should filter models that support tool calling', () => {
    const results = filterByToolsSupport(mockModels, true);

    // Models known to support tools: GPT-4, GPT-3.5, Claude-3, Gemini, Command, Mistral Large
    expect(results.length).toBeGreaterThan(0);

    // All results should be tool-capable models
    const toolCapableIds = results.map(m => m.id);
    expect(toolCapableIds).toContain('openai/gpt-4-turbo');
    expect(toolCapableIds).toContain('openai/gpt-3.5-turbo');
    expect(toolCapableIds).toContain('anthropic/claude-3-opus');
    expect(toolCapableIds).toContain('google/gemini-pro');
  });

  it('should filter models that do NOT support tool calling', () => {
    const results = filterByToolsSupport(mockModels, false);

    // Llama 3 70B should be in results (basic Llama without tool support)
    const modelIds = results.map(m => m.id);
    expect(modelIds).toContain('meta-llama/llama-3-70b');

    // Tool-capable models should NOT be in results
    expect(modelIds).not.toContain('openai/gpt-4-turbo');
    expect(modelIds).not.toContain('anthropic/claude-3-opus');
  });

  it('should work with the full handler', async () => {
    const mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const handler = createSearchModelsHandler({
      client: mockClient,
      logger: createTestLogger(),
    });

    const result = await handler({ supports_tools: true });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const structured = result.structuredContent as { models: Array<{ id: string }>; filtered_count: number };
    expect(structured.filtered_count).toBeGreaterThan(0);

    // All returned models should support tools
    const modelIds = structured.models.map(m => m.id);
    expect(modelIds.some(id => id.includes('gpt') || id.includes('claude-3') || id.includes('gemini'))).toBe(true);
  });
});

// ============================================================================
// Test 2: Sorting by Price
// ============================================================================

describe('Sorting by Price', () => {
  it('should sort models by price in ascending order (cheapest first)', () => {
    const sorted = sortByPrice(mockModels, 'asc');

    // First model should be free or cheapest
    expect(sorted[0]?.pricing?.prompt).toBe('0'); // Llama 3 is free

    // Verify ascending order
    for (let i = 1; i < sorted.length; i++) {
      const prevPrice = parseFloat(sorted[i - 1]?.pricing?.prompt ?? '0');
      const currPrice = parseFloat(sorted[i]?.pricing?.prompt ?? '0');
      expect(currPrice).toBeGreaterThanOrEqual(prevPrice);
    }
  });

  it('should sort models by price in descending order (most expensive first)', () => {
    const sorted = sortByPrice(mockModels, 'desc');

    // First model should be most expensive (Claude 3 Opus at $0.000015)
    expect(sorted[0]?.id).toBe('anthropic/claude-3-opus');

    // Verify descending order
    for (let i = 1; i < sorted.length; i++) {
      const prevPrice = parseFloat(sorted[i - 1]?.pricing?.prompt ?? '0');
      const currPrice = parseFloat(sorted[i]?.pricing?.prompt ?? '0');
      expect(currPrice).toBeLessThanOrEqual(prevPrice);
    }
  });

  it('should work through the full handler with sort_by=price', async () => {
    const mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const handler = createSearchModelsHandler({
      client: mockClient,
      logger: createTestLogger(),
    });

    const result = await handler({ sort_by: 'price', sort_order: 'asc' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const structured = result.structuredContent as {
      models: Array<{ id: string; pricing: { prompt: number } }>;
      sort_applied: { by: string; order: string };
    };

    expect(structured.sort_applied).toEqual({ by: 'price', order: 'asc' });

    // Verify first model is free (Llama 3)
    expect(structured.models[0]?.id).toBe('meta-llama/llama-3-70b');
  });
});

// ============================================================================
// Test 3: Sorting by Context Length
// ============================================================================

describe('Sorting by Context Length', () => {
  it('should sort models by context length in ascending order (smallest first)', () => {
    const sorted = sortByContextLength(mockModels, 'asc');

    // First model should have smallest context
    expect(sorted[0]?.context_length).toBe(8192); // Llama 3

    // Verify ascending order
    for (let i = 1; i < sorted.length; i++) {
      const prevContext = sorted[i - 1]?.context_length ?? 0;
      const currContext = sorted[i]?.context_length ?? 0;
      expect(currContext).toBeGreaterThanOrEqual(prevContext);
    }
  });

  it('should sort models by context length in descending order (largest first)', () => {
    const sorted = sortByContextLength(mockModels, 'desc');

    // First models should have largest context (Claude 3 at 200K)
    expect(sorted[0]?.context_length).toBe(200000);

    // Verify descending order
    for (let i = 1; i < sorted.length; i++) {
      const prevContext = sorted[i - 1]?.context_length ?? 0;
      const currContext = sorted[i]?.context_length ?? 0;
      expect(currContext).toBeLessThanOrEqual(prevContext);
    }
  });

  it('should work through the full handler with sort_by=context_length', async () => {
    const mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const handler = createSearchModelsHandler({
      client: mockClient,
      logger: createTestLogger(),
    });

    const result = await handler({ sort_by: 'context_length', sort_order: 'desc' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const structured = result.structuredContent as {
      models: Array<{ id: string; context_length: number }>;
      sort_applied: { by: string; order: string };
    };

    expect(structured.sort_applied).toEqual({ by: 'context_length', order: 'desc' });

    // First model should have 200000 context
    expect(structured.models[0]?.context_length).toBe(200000);
  });
});

// ============================================================================
// Additional Tests: Provider Sorting and Combined Filters
// ============================================================================

describe('Sorting by Provider', () => {
  it('should sort models by provider name alphabetically (ascending)', () => {
    const sorted = sortByProvider(mockModels, 'asc');

    // First should be 'anthropic' (alphabetically first)
    expect(sorted[0]?.id.startsWith('anthropic/')).toBe(true);

    // Last should be 'openai' (alphabetically last among our test set)
    const providers = sorted.map(m => m.id.split('/')[0]);
    const uniqueProviders = [...new Set(providers)];

    // Verify alphabetical order
    for (let i = 1; i < uniqueProviders.length; i++) {
      expect(uniqueProviders[i]! >= uniqueProviders[i - 1]!).toBe(true);
    }
  });

  it('should sort models by provider name in descending order', () => {
    const sorted = sortByProvider(mockModels, 'desc');

    // First should be 'openai' (reverse alphabetical)
    expect(sorted[0]?.id.startsWith('openai/')).toBe(true);
  });
});

describe('Combined Filters and Sorting', () => {
  it('should apply tool filter and then sort by price', async () => {
    const mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const handler = createSearchModelsHandler({
      client: mockClient,
      logger: createTestLogger(),
    });

    const result = await handler({
      supports_tools: true,
      sort_by: 'price',
      sort_order: 'asc',
    });

    expect(result.isError).toBeFalsy();

    const structured = result.structuredContent as {
      models: Array<{ id: string; pricing: { prompt: number } }>;
      filters_applied: { supports_tools: boolean };
    };

    // Should have filtered for tool support
    expect(structured.filters_applied.supports_tools).toBe(true);

    // Verify all models in results support tools
    const modelIds = structured.models.map(m => m.id);
    expect(modelIds).not.toContain('meta-llama/llama-3-70b'); // Llama doesn't support tools

    // Verify sorted by price (ascending)
    for (let i = 1; i < structured.models.length; i++) {
      expect(structured.models[i]!.pricing.prompt).toBeGreaterThanOrEqual(
        structured.models[i - 1]!.pricing.prompt
      );
    }
  });
});

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Search Models Input Schema Validation', () => {
  it('should accept empty input', () => {
    const result = SearchModelsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept all valid parameters including advanced filters', () => {
    const result = SearchModelsInputSchema.safeParse({
      provider: 'openai',
      keyword: 'gpt',
      min_context_length: 1000,
      max_context_length: 100000,
      modality: 'text',
      min_price: 0,
      max_price: 0.001,
      supports_tools: true,
      supports_streaming: true,
      supports_temperature: true,
      sort_by: 'price',
      sort_order: 'asc',
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid sort_by value', () => {
    const result = SearchModelsInputSchema.safeParse({
      sort_by: 'invalid-sort',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid sort_order value', () => {
    const result = SearchModelsInputSchema.safeParse({
      sort_order: 'random',
    });

    expect(result.success).toBe(false);
  });

  it('should accept valid sort_by values', () => {
    const validSortBy = ['price', 'context_length', 'provider'];

    for (const sortBy of validSortBy) {
      const result = SearchModelsInputSchema.safeParse({ sort_by: sortBy });
      expect(result.success).toBe(true);
    }
  });

  it('should default sort_order to asc', () => {
    const result = SearchModelsInputSchema.parse({ sort_by: 'price' });
    expect(result.sort_order).toBe('asc');
  });
});
