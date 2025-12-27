/**
 * List Models Tool Tests
 * Tests: Model fetching, provider filter, context length filter, keyword search
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterClient, OpenRouterModel } from '../../src/api/OpenRouterClient.js';
import { Logger } from '../../src/utils/logger.js';
import {
  createListModelsHandler,
  extractProvider,
  parsePrice,
  extractModality,
  filterByProvider,
  filterByKeyword,
  filterByContextLength,
  filterByModality,
  filterByPrice,
  applyFilters,
} from '../../src/tools/listModels/handler.js';
import { ListModelsInputSchema, ListModelsInput } from '../../src/tools/listModels/schema.js';

// Create a silent logger for tests
const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'test' });
};

// Mock models for testing
const mockModels: OpenRouterModel[] = [
  {
    id: 'openai/gpt-4',
    name: 'GPT-4',
    context_length: 8192,
    pricing: { prompt: '0.00003', completion: '0.00006' },
    architecture: { modality: 'text', tokenizer: 'gpt-4' },
  },
  {
    id: 'openai/gpt-4-vision',
    name: 'GPT-4 Vision',
    context_length: 128000,
    pricing: { prompt: '0.00001', completion: '0.00003' },
    architecture: { modality: 'text+image', tokenizer: 'gpt-4' },
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    context_length: 200000,
    pricing: { prompt: '0.000015', completion: '0.000075' },
    architecture: { modality: 'text+image', tokenizer: 'claude' },
  },
  {
    id: 'anthropic/claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: { modality: 'text', tokenizer: 'claude' },
  },
  {
    id: 'google/gemini-pro',
    name: 'Gemini Pro',
    context_length: 32768,
    pricing: { prompt: '0.0000005', completion: '0.0000015' },
    architecture: { modality: 'text', tokenizer: 'gemini' },
  },
  {
    id: 'meta-llama/llama-3-70b',
    name: 'Llama 3 70B',
    context_length: 8192,
    pricing: { prompt: '0', completion: '0' },
    architecture: { modality: 'text', tokenizer: 'llama' },
  },
];

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('List Models Helper Functions', () => {
  describe('extractProvider', () => {
    it('should extract provider from model ID', () => {
      expect(extractProvider('openai/gpt-4')).toBe('openai');
      expect(extractProvider('anthropic/claude-3-opus')).toBe('anthropic');
      expect(extractProvider('meta-llama/llama-3-70b')).toBe('meta-llama');
    });

    it('should handle model IDs without provider', () => {
      expect(extractProvider('standalone-model')).toBe('standalone-model');
    });
  });

  describe('parsePrice', () => {
    it('should parse valid price strings', () => {
      expect(parsePrice('0.00003')).toBe(0.00003);
      expect(parsePrice('0.000015')).toBe(0.000015);
      expect(parsePrice('0')).toBe(0);
    });

    it('should handle undefined and invalid values', () => {
      expect(parsePrice(undefined)).toBe(0);
      expect(parsePrice('invalid')).toBe(0);
    });
  });

  describe('extractModality', () => {
    it('should extract text modality', () => {
      const model: OpenRouterModel = {
        id: 'test/model',
        architecture: { modality: 'text' },
      };
      expect(extractModality(model)).toBe('text');
    });

    it('should extract vision modality from text+image', () => {
      const model: OpenRouterModel = {
        id: 'test/model',
        architecture: { modality: 'text+image' },
      };
      expect(extractModality(model)).toBe('vision');
    });

    it('should extract audio modality', () => {
      const model: OpenRouterModel = {
        id: 'test/model',
        architecture: { modality: 'audio' },
      };
      expect(extractModality(model)).toBe('audio');
    });

    it('should default to text when no modality specified', () => {
      const model: OpenRouterModel = { id: 'test/model' };
      expect(extractModality(model)).toBe('text');
    });
  });
});

// ============================================================================
// Test 1: Fetching All Models Returns Structured Array
// ============================================================================

describe('Fetching All Models', () => {
  let mockClient: OpenRouterClient;

  beforeEach(() => {
    // Create a mock client
    mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;
  });

  it('should fetch all models and return structured array', async () => {
    const handler = createListModelsHandler({
      client: mockClient,
      logger: createTestLogger(),
    });

    const result = await handler({});

    // Should not be an error
    expect(result.isError).toBeFalsy();

    // Should have text content
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]?.type).toBe('text');

    // Should have structured content
    expect(result.structuredContent).toBeDefined();
    const structured = result.structuredContent as { models: unknown[]; total_count: number };
    expect(structured.models).toBeInstanceOf(Array);
    expect(structured.total_count).toBe(mockModels.length);
    expect(structured.models).toHaveLength(mockModels.length);
  });

  it('should include model metadata in response', async () => {
    const handler = createListModelsHandler({
      client: mockClient,
      logger: createTestLogger(),
    });

    const result = await handler({});
    const structured = result.structuredContent as { models: Array<{ id: string; name: string; context_length: number; pricing: object; provider: string; capabilities: object }> };

    // Check first model has all expected fields
    const firstModel = structured.models[0];
    expect(firstModel).toHaveProperty('id');
    expect(firstModel).toHaveProperty('name');
    expect(firstModel).toHaveProperty('context_length');
    expect(firstModel).toHaveProperty('pricing');
    expect(firstModel).toHaveProperty('provider');
    expect(firstModel).toHaveProperty('capabilities');
  });

  it('should use cached response when available', async () => {
    const cachedClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: true,
      }),
    } as unknown as OpenRouterClient;

    const handler = createListModelsHandler({
      client: cachedClient,
      logger: createTestLogger(),
    });

    await handler({});

    expect(cachedClient.listModels).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Test 2: Provider Filter Narrows Results
// ============================================================================

describe('Provider Filter', () => {
  it('should filter models by provider (case-insensitive)', () => {
    // Filter for OpenAI models
    const openaiModels = filterByProvider(mockModels, 'openai');
    expect(openaiModels).toHaveLength(2);
    expect(openaiModels.every((m) => m.id.startsWith('openai/'))).toBe(true);

    // Filter for Anthropic models
    const anthropicModels = filterByProvider(mockModels, 'anthropic');
    expect(anthropicModels).toHaveLength(2);
    expect(anthropicModels.every((m) => m.id.startsWith('anthropic/'))).toBe(true);
  });

  it('should handle partial provider matches', () => {
    const results = filterByProvider(mockModels, 'llama');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('meta-llama/llama-3-70b');
  });

  it('should be case-insensitive', () => {
    const results1 = filterByProvider(mockModels, 'OPENAI');
    const results2 = filterByProvider(mockModels, 'OpenAI');
    const results3 = filterByProvider(mockModels, 'openai');

    expect(results1).toHaveLength(2);
    expect(results2).toHaveLength(2);
    expect(results3).toHaveLength(2);
  });

  it('should return empty array when no matches', () => {
    const results = filterByProvider(mockModels, 'nonexistent');
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// Test 3: Context Length Range Filter
// ============================================================================

describe('Context Length Range Filter', () => {
  it('should filter by minimum context length', () => {
    const results = filterByContextLength(mockModels, 100000, undefined);

    expect(results.length).toBe(3); // GPT-4 Vision, Claude 3 Opus, Claude 3 Sonnet
    expect(results.every((m) => (m.context_length ?? 0) >= 100000)).toBe(true);
  });

  it('should filter by maximum context length', () => {
    const results = filterByContextLength(mockModels, undefined, 10000);

    expect(results.length).toBe(2); // GPT-4 and Llama 3
    expect(results.every((m) => (m.context_length ?? 0) <= 10000)).toBe(true);
  });

  it('should filter by context length range', () => {
    const results = filterByContextLength(mockModels, 10000, 50000);

    expect(results.length).toBe(1); // Gemini Pro only (32768)
    expect(results[0]?.id).toBe('google/gemini-pro');
  });

  it('should return all models when no range specified', () => {
    const results = filterByContextLength(mockModels, undefined, undefined);
    expect(results).toHaveLength(mockModels.length);
  });
});

// ============================================================================
// Test 4: Keyword Search Matches Model Names
// ============================================================================

describe('Keyword Search', () => {
  it('should match keyword in model name', () => {
    const results = filterByKeyword(mockModels, 'claude');
    expect(results).toHaveLength(2);
    expect(results.every((m) => m.name?.toLowerCase().includes('claude'))).toBe(true);
  });

  it('should match keyword in model ID', () => {
    const results = filterByKeyword(mockModels, 'gpt');
    expect(results).toHaveLength(2);
    expect(results.every((m) => m.id.toLowerCase().includes('gpt'))).toBe(true);
  });

  it('should be case-insensitive', () => {
    const results1 = filterByKeyword(mockModels, 'GPT');
    const results2 = filterByKeyword(mockModels, 'gpt');
    const results3 = filterByKeyword(mockModels, 'Gpt');

    expect(results1).toHaveLength(2);
    expect(results2).toHaveLength(2);
    expect(results3).toHaveLength(2);
  });

  it('should match partial keywords', () => {
    const results = filterByKeyword(mockModels, 'opus');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('anthropic/claude-3-opus');
  });

  it('should return empty array when no matches', () => {
    const results = filterByKeyword(mockModels, 'nonexistent-keyword');
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// Test 5: Modality Filter
// ============================================================================

describe('Modality Filter', () => {
  it('should filter by text modality', () => {
    const results = filterByModality(mockModels, 'text');

    // GPT-4, Claude 3 Sonnet, Gemini Pro, Llama 3
    expect(results.length).toBe(4);
    expect(results.every((m) => extractModality(m) === 'text')).toBe(true);
  });

  it('should filter by vision modality', () => {
    const results = filterByModality(mockModels, 'vision');

    // GPT-4 Vision, Claude 3 Opus (both have text+image)
    expect(results.length).toBe(2);
    expect(results.every((m) => extractModality(m) === 'vision')).toBe(true);
  });
});

// ============================================================================
// Test 6: Price Range Filter
// ============================================================================

describe('Price Range Filter', () => {
  it('should filter by maximum price', () => {
    const results = filterByPrice(mockModels, undefined, 0.00001);

    // Should include cheaper models (Gemini Pro, Llama 3, Claude 3 Sonnet)
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((m) => parsePrice(m.pricing?.prompt) <= 0.00001)).toBe(true);
  });

  it('should filter by minimum price', () => {
    const results = filterByPrice(mockModels, 0.00001, undefined);

    // Should include more expensive models
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((m) => parsePrice(m.pricing?.prompt) >= 0.00001)).toBe(true);
  });

  it('should include free models when min_price is 0', () => {
    const results = filterByPrice(mockModels, 0, 0);

    // Should only include Llama 3 (free)
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('meta-llama/llama-3-70b');
  });
});

// ============================================================================
// Combined Filters Test
// ============================================================================

describe('Combined Filters', () => {
  it('should apply multiple filters together', () => {
    const input: ListModelsInput = {
      provider: 'anthropic',
      min_context_length: 100000,
    };

    const results = applyFilters(mockModels, input);

    // Both Anthropic models have 200000 context length
    expect(results).toHaveLength(2);
    expect(results.every((m) => m.id.startsWith('anthropic/'))).toBe(true);
    expect(results.every((m) => (m.context_length ?? 0) >= 100000)).toBe(true);
  });

  it('should return empty when filters conflict', () => {
    const input: ListModelsInput = {
      provider: 'openai',
      keyword: 'claude', // Claude is Anthropic, not OpenAI
    };

    const results = applyFilters(mockModels, input);
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Input Schema Validation', () => {
  it('should accept empty input', () => {
    const result = ListModelsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid filter parameters', () => {
    const result = ListModelsInputSchema.safeParse({
      provider: 'openai',
      keyword: 'gpt',
      min_context_length: 1000,
      max_context_length: 100000,
      modality: 'text',
      min_price: 0,
      max_price: 0.001,
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid modality', () => {
    const result = ListModelsInputSchema.safeParse({
      modality: 'invalid-modality',
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative context lengths', () => {
    const result = ListModelsInputSchema.safeParse({
      min_context_length: -100,
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative prices', () => {
    const result = ListModelsInputSchema.safeParse({
      min_price: -0.001,
    });

    expect(result.success).toBe(false);
  });
});
