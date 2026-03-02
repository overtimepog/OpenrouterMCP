/**
 * Main handler for the openrouter_chat tool.
 * Routes requests to streaming or non-streaming handlers
 * and manages session integration.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { validateModelId } from '../../utils/modelValidation.js';
import { ToolResponse } from '../../server/OpenRouterServer.js';
import { SessionManager } from '../../session/SessionManager.js';
import { SessionMessage } from '../../session/types.js';
import { CostTracker } from '../../cost/CostTracker.js';
import { ChatInput, ChatResponse, ChatMessage, ContentPart } from './schema.js';
import { handleNonStreamingChat, toSessionMessages } from './nonStreaming.js';
import { handleStreamingChat } from './streaming.js';

// ============================================================================
// Types
// ============================================================================

export interface ChatHandlerConfig {
  client: OpenRouterClient;
  sessionManager: SessionManager;
  costTracker?: CostTracker;
  logger: Logger;
}

// ============================================================================
// Input Normalization
// ============================================================================

/**
 * Normalize simplified input (role/message params) into the messages array.
 * Mutates input.messages in place so downstream code can use it uniformly.
 */
export function normalizeMessages(input: ChatInput): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // If both message and messages are provided, prepend role to existing messages and append message
  if (input.message !== undefined && input.messages && input.messages.length > 0) {
    if (input.role) {
      messages.push({ role: 'system', content: input.role });
    }
    messages.push(...input.messages);
    messages.push({ role: 'user', content: input.message });
    return messages;
  }

  // If only message is provided, construct messages from role + message
  if (input.message !== undefined) {
    if (input.role) {
      messages.push({ role: 'system', content: input.role });
    }
    messages.push({ role: 'user', content: input.message });
    return messages;
  }

  // If only messages is provided, optionally prepend role as system message
  if (input.messages && input.messages.length > 0) {
    if (input.role) {
      messages.push({ role: 'system', content: input.role });
    }
    messages.push(...input.messages);
    return messages;
  }

  return messages;
}

/**
 * Check if any messages contain image content parts
 */
export function hasImageContent(messages: ChatMessage[]): boolean {
  return messages.some((m) => {
    if (Array.isArray(m.content)) {
      return m.content.some((part: ContentPart) => part.type === 'image_url');
    }
    return false;
  });
}

// ============================================================================
// Chat Request Builder
// ============================================================================

/**
 * Build the full message list for the chat request.
 * Includes session history if a session_id is provided.
 */
export function buildMessageList(
  input: ChatInput,
  sessionManager: SessionManager,
  sessionId: string,
  logger: Logger
): SessionMessage[] {
  const newMessages = toSessionMessages(input.messages);

  // If this is a new session or no session_id provided,
  // just use the input messages
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    // This shouldn't happen since we create/get session before calling this
    logger.warn('Session not found when building message list', { sessionId });
    return newMessages;
  }

  // Add new messages to session and get the combined list
  for (const msg of newMessages) {
    const result = sessionManager.addMessage(sessionId, msg);

    if (result.warning) {
      logger.warn('Context limit warning', {
        sessionId,
        warning: result.warning,
        truncated: result.truncated,
        messagesRemoved: result.messagesRemoved,
        tokensRemoved: result.tokensRemoved,
      });
    }
  }

  // Return the full message history from session
  return sessionManager.getMessages(sessionId);
}

/**
 * Get or create a session for the chat request
 */
export function getOrCreateSession(
  input: ChatInput,
  sessionManager: SessionManager,
  logger: Logger
): string {
  // If session_id provided, try to use existing session
  if (input.session_id) {
    const existingSession = sessionManager.getSession(input.session_id);

    if (existingSession) {
      logger.debug('Continuing existing session', {
        sessionId: input.session_id,
        messageCount: existingSession.messages.length,
      });
      return input.session_id;
    }

    // Session not found or expired, log warning
    logger.warn('Session not found, creating new session', {
      requestedSessionId: input.session_id,
    });
  }

  // Create new session
  const newSessionId = sessionManager.createSession(input.model);

  logger.debug('Created new session', {
    sessionId: newSessionId,
    model: input.model,
  });

  return newSessionId;
}

// ============================================================================
// Response Formatter
// ============================================================================

/**
 * Format the chat response as human-readable text
 */
function formatTextResponse(response: ChatResponse): string {
  const lines: string[] = [];

  lines.push(`Model: ${response.model}`);
  lines.push(`Session: ${response.session_id}`);

  if (response.finish_reason) {
    lines.push(`Finish Reason: ${response.finish_reason}`);
  }

  if (response.native_finish_reason) {
    lines.push(`Native Finish Reason: ${response.native_finish_reason}`);
  }

  lines.push('');

  // Reasoning
  if (response.reasoning) {
    lines.push('--- Reasoning ---');
    lines.push(response.reasoning);
    lines.push('');
  }

  // Content
  if (response.content) {
    lines.push('--- Response ---');
    lines.push(response.content);
    lines.push('');
  }

  // Annotations (e.g., URL citations)
  if (response.annotations && response.annotations.length > 0) {
    lines.push('--- Citations ---');
    for (const ann of response.annotations) {
      if (ann.url_citation) {
        lines.push(`  [${ann.url_citation.title}](${ann.url_citation.url})`);
      }
    }
    lines.push('');
  }

  // Tool calls
  if (response.tool_calls && response.tool_calls.length > 0) {
    lines.push('--- Tool Calls ---');
    for (const tc of response.tool_calls) {
      lines.push(`Function: ${tc.function.name}`);
      lines.push(`  ID: ${tc.id}`);
      lines.push(`  Arguments: ${tc.function.arguments}`);
      lines.push('');
    }
  }

  // Logprobs
  if (response.logprobs && response.logprobs.length > 0) {
    lines.push('--- Logprobs ---');
    lines.push(`  Tokens with logprobs: ${response.logprobs.length}`);
    lines.push('');
  }

  // Usage
  if (response.usage) {
    lines.push('--- Token Usage ---');
    lines.push(`  Prompt: ${response.usage.prompt_tokens}`);
    lines.push(`  Completion: ${response.usage.completion_tokens}`);
    lines.push(`  Total: ${response.usage.total_tokens}`);
    lines.push('');
  }

  // Rate limit status
  if (response.rate_limit_status?.isApproachingLimit) {
    lines.push('--- Rate Limit Warning ---');
    if (response.rate_limit_status.requestsRemaining !== undefined) {
      lines.push(`  Requests remaining: ${response.rate_limit_status.requestsRemaining}/${response.rate_limit_status.requestsLimit}`);
    }
    if (response.rate_limit_status.tokensRemaining !== undefined) {
      lines.push(`  Tokens remaining: ${response.rate_limit_status.tokensRemaining}/${response.rate_limit_status.tokensLimit}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Create the chat handler
 */
export function createChatHandler(config: ChatHandlerConfig) {
  const { client, sessionManager, costTracker, logger } = config;

  return async (input: ChatInput): Promise<ToolResponse> => {
    // Normalize simplified input (role/message) into messages array
    const normalizedMessages = normalizeMessages(input);
    // Replace input.messages with the normalized version for downstream use
    (input as Record<string, unknown>).messages = normalizedMessages;

    logger.debug('Executing chat tool', {
      model: input.model,
      messageCount: normalizedMessages.length,
      stream: input.stream,
      hasSessionId: Boolean(input.session_id),
      hasTools: Boolean(input.tools?.length),
    });

    // Pre-flight model validation (uses cached model list)
    let validatedModel: { valid: boolean; model?: import('../../api/OpenRouterClient.js').OpenRouterModel; error?: string } | undefined;
    try {
      validatedModel = await validateModelId(input.model, client, logger);
      if (!validatedModel.valid) {
        return {
          content: [{ type: 'text', text: validatedModel.error! }],
          isError: true,
        };
      }
    } catch (validationError) {
      // Graceful degradation — if validation itself errors, continue to API call
      logger.warn('Model validation error, proceeding anyway', {
        error: validationError instanceof Error ? validationError.message : 'Unknown',
      });
    }

    // Pre-flight vision validation
    if (hasImageContent(normalizedMessages)) {
      const modelData = validatedModel?.model;
      if (modelData) {
        const inputModalities = modelData.architecture?.input_modalities ?? [];
        if (!inputModalities.includes('image')) {
          return {
            content: [{
              type: 'text',
              text: `Model "${input.model}" does not support image/vision input.\nUse openrouter_search_models with supports_vision: true to find vision-capable models.`,
            }],
            isError: true,
          };
        }
      }
    }

    try {
      // Get or create session
      const sessionId = getOrCreateSession(input, sessionManager, logger);

      // Build full message list with session history
      const fullMessages = buildMessageList(input, sessionManager, sessionId, logger);

      logger.debug('Built message list', {
        sessionId,
        totalMessages: fullMessages.length,
      });

      let response: ChatResponse;

      // Route to appropriate handler
      if (input.stream === false) {
        // Non-streaming request
        const result = await handleNonStreamingChat(input, {
          client,
          sessionManager,
          logger: logger.child('non-streaming'),
        }, sessionId, fullMessages);

        response = result.response;
      } else {
        // Streaming request (default)
        const result = await handleStreamingChat(input, {
          client,
          sessionManager,
          logger: logger.child('streaming'),
        }, sessionId, fullMessages);

        response = result.response;
      }

      // Record cost if cost tracker is available and usage data exists
      if (costTracker && response.usage) {
        costTracker.recordCost({
          sessionId,
          model: input.model,
          operation: 'chat',
          usage: {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
            cost: (response.usage as { cost?: number }).cost,
          },
        });
      }

      // Format text response
      const textResponse = formatTextResponse(response);

      return {
        content: [{ type: 'text', text: textResponse }],
        structuredContent: response,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if this is an ApiError with a specific code
      const isApiError = error && typeof error === 'object' && 'code' in error;
      const errorCode = isApiError ? (error as { code: string }).code : '';

      logger.error('Chat tool failed', {
        error: errorMessage,
        code: errorCode,
        model: input.model,
      });

      // Check for specific error types using error codes (more precise than string matching)
      let userFriendlyMessage = `Error during chat completion: ${errorMessage}`;

      // Check for model not found - check error code first, then message
      if (errorCode === 'MODEL_NOT_FOUND' || errorMessage.includes('MODEL_NOT_FOUND')) {
        userFriendlyMessage = `Invalid model: "${input.model}" not found. Use openrouter_list_models to see available models.`;
      }
      // Check for auth errors - check error codes and messages
      else if (
        errorCode === 'AUTH_MISSING_KEY' ||
        errorCode === 'AUTH_INVALID_KEY' ||
        errorCode === 'AUTH_EXPIRED_KEY' ||
        errorMessage.includes('AUTH_MISSING_KEY') ||
        errorMessage.includes('AUTH_INVALID_KEY') ||
        errorMessage.includes('Invalid API key') ||
        errorMessage.includes('401')
      ) {
        userFriendlyMessage = `Authentication failed. Please check your OPENROUTER_API_KEY. (${errorMessage})`;
      }
      // Check for rate limit errors
      else if (errorCode.includes('RATE_LIMIT') || errorMessage.includes('RATE_LIMIT') || errorMessage.includes('429')) {
        userFriendlyMessage = 'Rate limit exceeded. Please wait before making more requests.';
      }

      return {
        content: [
          {
            type: 'text',
            text: userFriendlyMessage,
          },
        ],
        isError: true,
      };
    }
  };
}

export default createChatHandler;
