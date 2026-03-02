/**
 * Search Models Tool Tests
 * Tests: Tool support filter, sorting by price, sorting by context length
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterClient, OpenRouterModel } from '../../src/api/OpenRouterClient.js';
import { Logger } from '../../src/utils/logger.js';
import {
  createSearchModelsHandler,
  scoreByQuery,
  filterByToolsSupport,
  filterByStreamingSupport,
  filterByTemperatureSupport,
  filterByReasoningSupport,
  filterByJsonOutputSupport,
  filterByWebSearchSupport,
  filterByImageOutputSupport,
  filterByVisionSupport,
  applyAdvancedFilters,
  sortByPrice,
  sortByContextLength,
  sortByProvider,
  applySorting,
} from '../../src/tools/searchModels/handler.js';
import { SearchModelsInputSchema, SearchModelsInput, SearchModelInfo } from '../../src/tools/searchModels/schema.js';

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

// Extended mock models with new capabilities for testing
const extendedMockModels: OpenRouterModel[] = [
  ...mockModels,
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropics most intelligent model with reasoning capabilities',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: { modality: 'text+image', tokenizer: 'claude', input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream', 'reasoning', 'response_format', 'web_search'],
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI flagship multimodal model',
    context_length: 128000,
    pricing: { prompt: '0.000005', completion: '0.000015' },
    architecture: { modality: 'text+image', tokenizer: 'gpt-4o', input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'temperature', 'top_p', 'max_tokens', 'stream', 'structured_outputs', 'response_format', 'web_search'],
  },
  {
    id: 'openai/dall-e-3',
    name: 'DALL-E 3',
    description: 'Image generation model by OpenAI',
    context_length: 4096,
    pricing: { prompt: '0', completion: '0' },
    architecture: { modality: 'text+image', tokenizer: 'dall-e', input_modalities: ['text'], output_modalities: ['image'] },
    supported_parameters: [],
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    description: 'DeepSeek reasoning model with chain of thought',
    context_length: 64000,
    pricing: { prompt: '0.000001', completion: '0.000004' },
    architecture: { modality: 'text', tokenizer: 'deepseek', input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['temperature', 'max_tokens', 'stream', 'reasoning'],
  },
];

// Helper to create a mock client
function createMockClient(models: OpenRouterModel[] = extendedMockModels) {
  return {
    listModels: vi.fn().mockResolvedValue({
      data: models,
      rateLimits: null,
      throttleStatus: { isThrottled: false },
      cached: false,
    }),
  } as unknown as OpenRouterClient;
}

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

  it('should accept valid sort_by values including relevance', () => {
    const validSortBy = ['price', 'context_length', 'provider', 'relevance'];

    for (const sortBy of validSortBy) {
      const result = SearchModelsInputSchema.safeParse({ sort_by: sortBy });
      expect(result.success).toBe(true);
    }
  });

  it('should default sort_order to asc', () => {
    const result = SearchModelsInputSchema.parse({ sort_by: 'price' });
    expect(result.sort_order).toBe('asc');
  });

  it('should accept new capability filter parameters', () => {
    const result = SearchModelsInputSchema.safeParse({
      query: 'claude opus',
      supports_reasoning: true,
      supports_json_output: true,
      supports_web_search: false,
      supports_image_output: true,
      supports_vision: false,
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should default limit to 20', () => {
    const result = SearchModelsInputSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('should reject limit above 100', () => {
    const result = SearchModelsInputSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('should reject limit below 1', () => {
    const result = SearchModelsInputSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Query Search Tests
// ============================================================================

describe('Query Search (scoreByQuery)', () => {
  it('should find models with multi-word query "claude opus"', () => {
    const results = scoreByQuery(extendedMockModels, 'claude opus');

    expect(results.length).toBeGreaterThan(0);
    // Claude 3 Opus should be the top result
    expect(results[0]!.model.id).toBe('anthropic/claude-3-opus');
    expect(results[0]!.score).toBeGreaterThan(0.1);
  });

  it('should find models with single-word query "gemini"', () => {
    const results = scoreByQuery(extendedMockModels, 'gemini');

    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.model.id);
    expect(ids).toContain('google/gemini-pro');
  });

  it('should return no results for gibberish', () => {
    const results = scoreByQuery(extendedMockModels, 'xyzzyqwerty999');

    expect(results.length).toBe(0);
  });

  it('should rank Claude models higher for query "claude"', () => {
    const results = scoreByQuery(extendedMockModels, 'claude');

    expect(results.length).toBeGreaterThan(0);
    // Top results should be Claude models
    const topIds = results.slice(0, 3).map(r => r.model.id);
    expect(topIds.every(id => id.includes('claude'))).toBe(true);
  });

  it('should match on description text', () => {
    const results = scoreByQuery(extendedMockModels, 'reasoning');

    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.model.id);
    // Claude 3.5 Sonnet and DeepSeek R1 both mention reasoning
    expect(ids).toContain('anthropic/claude-3.5-sonnet');
    expect(ids).toContain('deepseek/deepseek-r1');
  });

  it('should handle empty query gracefully', () => {
    const results = scoreByQuery(extendedMockModels, '');
    // All models returned with score 0
    expect(results.length).toBe(extendedMockModels.length);
  });
});

// ============================================================================
// Relevance Sorting Tests
// ============================================================================

describe('Relevance Sorting', () => {
  it('should default to relevance sort when query is provided and no sort_by', async () => {
    const handler = createSearchModelsHandler({
      client: createMockClient(),
      logger: createTestLogger(),
    });

    const result = await handler({ query: 'claude opus' });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      models: SearchModelInfo[];
      sort_applied: { by: string; order: string };
    };

    expect(structured.sort_applied).toEqual({ by: 'relevance', order: 'desc' });
    // First result should be Claude Opus
    expect(structured.models[0]?.id).toBe('anthropic/claude-3-opus');
    // Should have relevance_score
    expect(structured.models[0]?.relevance_score).toBeDefined();
    expect(structured.models[0]!.relevance_score!).toBeGreaterThan(0);
  });

  it('should allow overriding sort with explicit sort_by when query is present', async () => {
    const handler = createSearchModelsHandler({
      client: createMockClient(),
      logger: createTestLogger(),
    });

    const result = await handler({ query: 'claude', sort_by: 'price', sort_order: 'asc' });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      models: SearchModelInfo[];
      sort_applied: { by: string; order: string };
    };

    expect(structured.sort_applied.by).toBe('price');
  });
});

// ============================================================================
// New Capability Filter Tests
// ============================================================================

describe('Reasoning Support Filter', () => {
  it('should filter models that support reasoning', () => {
    const results = filterByReasoningSupport(extendedMockModels, true);
    const ids = results.map(m => m.id);
    expect(ids).toContain('anthropic/claude-3.5-sonnet');
    expect(ids).toContain('deepseek/deepseek-r1');
    expect(ids).not.toContain('openai/gpt-4-turbo');
  });

  it('should filter models that do NOT support reasoning', () => {
    const results = filterByReasoningSupport(extendedMockModels, false);
    const ids = results.map(m => m.id);
    expect(ids).toContain('openai/gpt-4-turbo');
    expect(ids).not.toContain('anthropic/claude-3.5-sonnet');
    expect(ids).not.toContain('deepseek/deepseek-r1');
  });
});

describe('JSON Output Support Filter', () => {
  it('should filter models that support structured output', () => {
    const results = filterByJsonOutputSupport(extendedMockModels, true);
    const ids = results.map(m => m.id);
    // GPT-4 Turbo has response_format, GPT-4o has structured_outputs + response_format, Claude 3.5 has response_format
    expect(ids).toContain('openai/gpt-4-turbo');
    expect(ids).toContain('openai/gpt-4o');
    expect(ids).toContain('anthropic/claude-3.5-sonnet');
    expect(ids).not.toContain('meta-llama/llama-3-70b');
  });

  it('should filter models that do NOT support structured output', () => {
    const results = filterByJsonOutputSupport(extendedMockModels, false);
    const ids = results.map(m => m.id);
    expect(ids).toContain('meta-llama/llama-3-70b');
    expect(ids).not.toContain('openai/gpt-4-turbo');
  });
});

describe('Web Search Support Filter', () => {
  it('should filter models that support web search', () => {
    const results = filterByWebSearchSupport(extendedMockModels, true);
    const ids = results.map(m => m.id);
    expect(ids).toContain('anthropic/claude-3.5-sonnet');
    expect(ids).toContain('openai/gpt-4o');
    expect(ids).not.toContain('openai/gpt-4-turbo');
  });

  it('should filter models that do NOT support web search', () => {
    const results = filterByWebSearchSupport(extendedMockModels, false);
    const ids = results.map(m => m.id);
    expect(ids).toContain('openai/gpt-4-turbo');
    expect(ids).not.toContain('anthropic/claude-3.5-sonnet');
  });
});

describe('Image Output Support Filter', () => {
  it('should filter models that support image generation', () => {
    const results = filterByImageOutputSupport(extendedMockModels, true);
    const ids = results.map(m => m.id);
    expect(ids).toContain('openai/dall-e-3');
    expect(ids).not.toContain('openai/gpt-4-turbo');
  });

  it('should filter models that do NOT support image generation', () => {
    const results = filterByImageOutputSupport(extendedMockModels, false);
    const ids = results.map(m => m.id);
    expect(ids).not.toContain('openai/dall-e-3');
    expect(ids).toContain('openai/gpt-4-turbo');
  });
});

describe('Vision Support Filter', () => {
  it('should filter models that support vision input', () => {
    const results = filterByVisionSupport(extendedMockModels, true);
    const ids = results.map(m => m.id);
    expect(ids).toContain('openai/gpt-4-turbo');
    expect(ids).toContain('anthropic/claude-3-opus');
    expect(ids).toContain('openai/gpt-4o');
    expect(ids).not.toContain('meta-llama/llama-3-70b');
    expect(ids).not.toContain('openai/dall-e-3');
  });

  it('should filter models that do NOT support vision input', () => {
    const results = filterByVisionSupport(extendedMockModels, false);
    const ids = results.map(m => m.id);
    expect(ids).toContain('meta-llama/llama-3-70b');
    expect(ids).not.toContain('openai/gpt-4-turbo');
  });
});

// ============================================================================
// Limit Parameter Tests
// ============================================================================

describe('Limit Parameter', () => {
  it('should respect the limit parameter', async () => {
    const handler = createSearchModelsHandler({
      client: createMockClient(),
      logger: createTestLogger(),
    });

    const result = await handler({ limit: 3 });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { models: SearchModelInfo[] };
    expect(structured.models.length).toBeLessThanOrEqual(3);
  });

  it('should default to 20 results', async () => {
    // Create many mock models
    const manyModels: OpenRouterModel[] = Array.from({ length: 30 }, (_, i) => ({
      id: `test/model-${i}`,
      name: `Model ${i}`,
      context_length: 4096,
      pricing: { prompt: '0.000001', completion: '0.000002' },
      architecture: { modality: 'text', tokenizer: 'test', input_modalities: ['text'], output_modalities: ['text'] },
      supported_parameters: ['temperature'],
    }));

    const handler = createSearchModelsHandler({
      client: createMockClient(manyModels),
      logger: createTestLogger(),
    });

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { models: SearchModelInfo[]; filtered_count: number };
    expect(structured.models.length).toBe(20);
    expect(structured.filtered_count).toBe(30);
  });
});

// ============================================================================
// Combined Query + Filters Tests
// ============================================================================

describe('Combined Query and Filters', () => {
  it('should combine query with capability filter', async () => {
    const handler = createSearchModelsHandler({
      client: createMockClient(),
      logger: createTestLogger(),
    });

    const result = await handler({
      query: 'claude',
      supports_reasoning: true,
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { models: SearchModelInfo[] };
    // Only Claude 3.5 Sonnet supports reasoning among Claude models
    const ids = structured.models.map(m => m.id);
    expect(ids).toContain('anthropic/claude-3.5-sonnet');
    expect(ids).not.toContain('anthropic/claude-3-opus'); // no reasoning support
  });

  it('should combine query with supports_tools and limit', async () => {
    const handler = createSearchModelsHandler({
      client: createMockClient(),
      logger: createTestLogger(),
    });

    const result = await handler({
      query: 'gpt',
      supports_tools: true,
      limit: 5,
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { models: SearchModelInfo[] };
    expect(structured.models.length).toBeLessThanOrEqual(5);
    // All should be GPT models with tool support
    for (const model of structured.models) {
      expect(model.id).toMatch(/gpt/);
    }
  });
});
