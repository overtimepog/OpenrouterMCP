/**
 * Tests for model ID validation utility.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  computeSimilarity,
  validateModelId,
  formatModelNotFoundError,
  ModelSuggestion,
} from '../../src/utils/modelValidation.js';
import { OpenRouterClient, OpenRouterModel } from '../../src/api/OpenRouterClient.js';
import { Logger } from '../../src/utils/logger.js';

// ============================================================================
// Test Utilities
// ============================================================================

const createTestLogger = (): Logger => new Logger({ level: 'error', name: 'test' });

const mockModels: OpenRouterModel[] = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
  },
  {
    id: 'anthropic/claude-4-opus',
    name: 'Claude 4 Opus',
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
  },
  {
    id: 'anthropic/claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
  },
  {
    id: 'google/gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash Image Preview',
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text', 'image'],
    },
  },
  {
    id: 'meta-llama/llama-3-70b',
    name: 'Llama 3 70B',
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
  },
];

function createMockClient(models: OpenRouterModel[] = mockModels) {
  return {
    listModels: vi.fn().mockResolvedValue({
      data: models,
      rateLimits: null,
      throttleStatus: { isThrottled: false },
      cached: true,
    }),
  } as unknown as OpenRouterClient;
}

// ============================================================================
// computeSimilarity
// ============================================================================

describe('computeSimilarity', () => {
  it('should return 1.0 for exact match', () => {
    expect(computeSimilarity('openai/gpt-4o', 'openai/gpt-4o')).toBe(1.0);
  });

  it('should return 1.0 for case-insensitive exact match', () => {
    expect(computeSimilarity('OpenAI/GPT-4o', 'openai/gpt-4o')).toBe(1.0);
  });

  it('should score higher for same-provider models', () => {
    const sameProvider = computeSimilarity('openai/gpt-4', 'openai/gpt-4o');
    const diffProvider = computeSimilarity('openai/gpt-4', 'anthropic/claude-4-opus');
    expect(sameProvider).toBeGreaterThan(diffProvider);
  });

  it('should score higher for similar model names', () => {
    const similar = computeSimilarity('anthropic/claude-3-opus', 'anthropic/claude-4-opus');
    const dissimilar = computeSimilarity('anthropic/claude-3-opus', 'meta-llama/llama-3-70b');
    expect(similar).toBeGreaterThan(dissimilar);
  });

  it('should handle IDs without slash', () => {
    const score = computeSimilarity('gpt-4', 'openai/gpt-4o');
    expect(score).toBeGreaterThan(0);
  });

  it('should give substring bonus for partial matches', () => {
    const withSubstring = computeSimilarity('openai/gpt-4', 'openai/gpt-4-turbo');
    expect(withSubstring).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// validateModelId
// ============================================================================

describe('validateModelId', () => {
  it('should return valid for an exact model match', async () => {
    const client = createMockClient();
    const logger = createTestLogger();

    const result = await validateModelId('openai/gpt-4o', client, logger);

    expect(result.valid).toBe(true);
    expect(result.model).toBeDefined();
    expect(result.model!.id).toBe('openai/gpt-4o');
    expect(result.error).toBeUndefined();
  });

  it('should return invalid with suggestions for unknown model', async () => {
    const client = createMockClient();
    const logger = createTestLogger();

    const result = await validateModelId('openai/gpt-5-mega', client, logger);

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('not found');
    expect(result.error).toContain('openai/gpt-5-mega');
  });

  it('should suggest similar models from same provider', async () => {
    const client = createMockClient();
    const logger = createTestLogger();

    const result = await validateModelId('anthropic/claude-3-opus', client, logger);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('anthropic/claude-4-opus');
  });

  it('should check image output modality when required', async () => {
    const client = createMockClient();
    const logger = createTestLogger();

    // openai/gpt-4o exists but has no image output
    const result = await validateModelId('openai/gpt-4o', client, logger, {
      requireImageOutput: true,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not support image output');
  });

  it('should pass image-capable models when requireImageOutput is set', async () => {
    const client = createMockClient();
    const logger = createTestLogger();

    const result = await validateModelId(
      'google/gemini-2.5-flash-image-preview',
      client,
      logger,
      { requireImageOutput: true }
    );

    expect(result.valid).toBe(true);
    expect(result.model!.id).toBe('google/gemini-2.5-flash-image-preview');
  });

  it('should gracefully degrade when listModels fails', async () => {
    const client = {
      listModels: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as OpenRouterClient;
    const logger = createTestLogger();

    const result = await validateModelId('any/model', client, logger);

    // Should return valid to let the API handle it
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ============================================================================
// formatModelNotFoundError
// ============================================================================

describe('formatModelNotFoundError', () => {
  it('should include the model ID in the error message', () => {
    const error = formatModelNotFoundError('fake/model', []);
    expect(error).toContain('fake/model');
    expect(error).toContain('not found');
  });

  it('should list suggestions when provided', () => {
    const suggestions: ModelSuggestion[] = [
      { id: 'openai/gpt-4o', name: 'GPT-4o', score: 0.8 },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', score: 0.7 },
    ];

    const error = formatModelNotFoundError('openai/gpt-4', suggestions);

    expect(error).toContain('Did you mean');
    expect(error).toContain('openai/gpt-4o');
    expect(error).toContain('GPT-4o');
    expect(error).toContain('openai/gpt-4-turbo');
  });

  it('should show image-specific wording for no_image_output', () => {
    const error = formatModelNotFoundError('openai/gpt-4o', [], {
      reason: 'no_image_output',
      modelName: 'GPT-4o',
    });

    expect(error).toContain('does not support image output');
    expect(error).toContain('openrouter_search_models');
  });

  it('should suggest using discovery tools', () => {
    const error = formatModelNotFoundError('fake/model', []);
    expect(error).toContain('openrouter_list_models');
  });
});
