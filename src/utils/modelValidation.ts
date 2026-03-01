/**
 * Model ID validation utility.
 * Validates model IDs against the live model list and suggests alternatives on mismatch.
 */

import { OpenRouterClient, OpenRouterModel } from '../api/OpenRouterClient.js';
import { Logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  model?: OpenRouterModel;
  error?: string;
}

export interface ValidationOptions {
  /** When true, also checks that the model supports image output */
  requireImageOutput?: boolean;
}

export interface ModelSuggestion {
  id: string;
  name?: string;
  score: number;
}

// ============================================================================
// Similarity Scoring
// ============================================================================

/**
 * Compute similarity between a query model ID and a candidate model ID.
 * Uses token-based matching with provider awareness.
 */
export function computeSimilarity(query: string, candidate: string): number {
  const queryLower = query.toLowerCase();
  const candidateLower = candidate.toLowerCase();

  // Exact match
  if (queryLower === candidateLower) return 1.0;

  // Split provider/model
  const queryParts = queryLower.split('/');
  const candidateParts = candidateLower.split('/');

  const queryProvider = queryParts.length > 1 ? queryParts[0]! : '';
  const queryModel = queryParts.length > 1 ? queryParts.slice(1).join('/') : queryParts[0]!;

  const candidateProvider = candidateParts.length > 1 ? candidateParts[0]! : '';
  const candidateModel = candidateParts.length > 1 ? candidateParts.slice(1).join('/') : candidateParts[0]!;

  let score = 0;

  // Provider scoring (0.3 weight)
  if (queryProvider && candidateProvider) {
    if (queryProvider === candidateProvider) {
      score += 0.3;
    } else if (
      candidateProvider.includes(queryProvider) ||
      queryProvider.includes(candidateProvider)
    ) {
      score += 0.15;
    }
  }

  // Model name token similarity (0.55 weight) — Jaccard similarity
  const queryTokens = tokenize(queryModel);
  const candidateTokens = tokenize(candidateModel);

  if (queryTokens.size > 0 && candidateTokens.size > 0) {
    const intersection = new Set([...queryTokens].filter(t => candidateTokens.has(t)));
    const union = new Set([...queryTokens, ...candidateTokens]);
    const jaccard = intersection.size / union.size;
    score += jaccard * 0.55;
  }

  // Substring bonus (0.1 weight)
  if (
    candidateModel.includes(queryModel) ||
    queryModel.includes(candidateModel)
  ) {
    score += 0.1;
  }

  // Additional bonus: if queryModel is a prefix of candidateModel or vice versa
  // This helps match e.g. "gpt-4" to "gpt-4o", "gpt-4-turbo"
  if (candidateLower.includes(queryLower) || queryLower.includes(candidateLower)) {
    score += 0.05;
  }

  return Math.min(score, 1.0);
}

/**
 * Tokenize a model name by splitting on separators and digits.
 */
function tokenize(name: string): Set<string> {
  // Split on `-`, `_`, `.`, and between letters/digits
  const tokens = name
    .split(/[-_.]/)
    .flatMap(part => {
      // Also split on digit boundaries: "gpt4" → ["gpt", "4"]
      return part.split(/(?<=\D)(?=\d)|(?<=\d)(?=\D)/);
    })
    .filter(t => t.length > 0);
  return new Set(tokens);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a model ID against the live model list.
 * Uses the client's cached model list (no extra API call if cache is warm).
 * Gracefully degrades if listModels fails — returns valid to let the API handle it.
 */
export async function validateModelId(
  modelId: string,
  client: OpenRouterClient,
  logger: Logger,
  options?: ValidationOptions
): Promise<ValidationResult> {
  try {
    const response = await client.listModels();
    const models = response.data;

    // Exact match
    const exactMatch = models.find(m => m.id === modelId);
    if (exactMatch) {
      // Check image output requirement
      if (options?.requireImageOutput) {
        const outputMods = exactMatch.architecture?.output_modalities ?? [];
        if (!outputMods.includes('image')) {
          return {
            valid: false,
            error: formatModelNotFoundError(modelId, [], {
              reason: 'no_image_output',
              modelName: exactMatch.name ?? exactMatch.id,
            }),
          };
        }
      }
      return { valid: true, model: exactMatch };
    }

    // No exact match — find suggestions
    const scored: ModelSuggestion[] = models
      .map(m => ({
        id: m.id,
        name: m.name,
        score: computeSimilarity(modelId, m.id),
      }))
      .filter(s => s.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      valid: false,
      error: formatModelNotFoundError(modelId, scored),
    };
  } catch (error) {
    // Graceful degradation: if we can't fetch models, skip validation
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Model validation skipped — could not fetch model list', {
      error: errorMessage,
      modelId,
    });
    return { valid: true };
  }
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Format a user-friendly error message for model not found.
 */
export function formatModelNotFoundError(
  modelId: string,
  suggestions: ModelSuggestion[],
  context?: { reason?: string; modelName?: string }
): string {
  const lines: string[] = [];

  if (context?.reason === 'no_image_output') {
    lines.push(
      `Model "${modelId}" (${context.modelName}) does not support image output.`
    );
    lines.push('Use openrouter_search_models to find image-capable models.');
  } else {
    lines.push(`Model "${modelId}" not found on OpenRouter.`);

    if (suggestions.length > 0) {
      lines.push('');
      lines.push('Did you mean one of these?');
      for (const s of suggestions) {
        const name = s.name ? ` (${s.name})` : '';
        lines.push(`  - ${s.id}${name}`);
      }
    }

    lines.push('');
    lines.push(
      'Use openrouter_list_models or openrouter_search_models to discover available models.'
    );
  }

  return lines.join('\n');
}
