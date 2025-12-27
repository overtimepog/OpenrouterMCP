/**
 * Non-streaming handler for the openrouter_chat tool.
 * Handles chat completion requests without streaming.
 */

import { OpenRouterClient, ChatCompletionResponse } from '../../api/OpenRouterClient.js';
import { RateLimitInfo } from '../../api/RateLimitManager.js';
import { Logger } from '../../utils/logger.js';
import { SessionManager } from '../../session/SessionManager.js';
import { SessionMessage } from '../../session/types.js';
import { ChatInput, ChatResponse, ChatToolCall, ChatRateLimitStatus } from './schema.js';

// ============================================================================
// Types
// ============================================================================

export interface NonStreamingHandlerConfig {
  client: OpenRouterClient;
  sessionManager: SessionManager;
  logger: Logger;
}

export interface NonStreamingResult {
  response: ChatResponse;
  rawResponse: ChatCompletionResponse;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert rate limit info to chat rate limit status
 */
export function toRateLimitStatus(rateLimits: RateLimitInfo | null): ChatRateLimitStatus | undefined {
  if (!rateLimits) {
    return undefined;
  }

  return {
    requestsRemaining: rateLimits.requestsRemaining,
    requestsLimit: rateLimits.requestsLimit,
    tokensRemaining: rateLimits.tokensRemaining,
    tokensLimit: rateLimits.tokensLimit,
    isApproachingLimit: rateLimits.isApproachingRequestLimit || rateLimits.isApproachingTokenLimit,
  };
}

/**
 * Extract tool calls from the response
 */
export function extractToolCalls(response: ChatCompletionResponse): ChatToolCall[] | undefined {
  const choice = response.choices[0];
  if (!choice?.message.tool_calls || choice.message.tool_calls.length === 0) {
    return undefined;
  }

  return choice.message.tool_calls.map((tc) => ({
    id: tc.id,
    type: tc.type as 'function',
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }));
}

/**
 * Convert ChatInput messages to SessionMessage format
 */
export function toSessionMessages(messages: ChatInput['messages']): SessionMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    name: msg.name,
    tool_call_id: msg.tool_call_id,
  }));
}

// ============================================================================
// Non-Streaming Handler
// ============================================================================

/**
 * Handle non-streaming chat completion request
 */
export async function handleNonStreamingChat(
  input: ChatInput,
  config: NonStreamingHandlerConfig,
  sessionId: string,
  fullMessages: SessionMessage[]
): Promise<NonStreamingResult> {
  const { client, sessionManager, logger } = config;

  logger.debug('Processing non-streaming chat request', {
    model: input.model,
    messageCount: fullMessages.length,
    sessionId,
  });

  // Build request body
  const requestBody = {
    model: input.model,
    messages: fullMessages.map((m) => ({
      role: m.role,
      content: m.content,
      name: m.name,
      tool_call_id: m.tool_call_id,
    })),
    stream: false,
    ...(input.temperature !== undefined && { temperature: input.temperature }),
    ...(input.max_tokens !== undefined && { max_tokens: input.max_tokens }),
    ...(input.tools && { tools: input.tools }),
    ...(input.tool_choice && { tool_choice: input.tool_choice }),
    ...(input.response_format && { response_format: input.response_format }),
  };

  // Make the API call
  const apiResponse = await client.createChatCompletion(requestBody);
  const rawResponse = apiResponse.data;

  logger.debug('Received non-streaming response', {
    model: input.model,
    finishReason: rawResponse.choices[0]?.finish_reason,
    hasToolCalls: Boolean(rawResponse.choices[0]?.message.tool_calls),
  });

  // Extract response content
  const choice = rawResponse.choices[0];
  const content = choice?.message.content ?? null;
  const toolCalls = extractToolCalls(rawResponse);
  const finishReason = choice?.finish_reason ?? null;

  // Add assistant response to session
  if (content || toolCalls) {
    const assistantMessage: SessionMessage = {
      role: 'assistant',
      content: content ?? '',
    };

    if (toolCalls && toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls;
    }

    sessionManager.addMessage(sessionId, assistantMessage);
  }

  // Build response
  const response: ChatResponse = {
    content,
    tool_calls: toolCalls,
    usage: rawResponse.usage,
    session_id: sessionId,
    rate_limit_status: toRateLimitStatus(apiResponse.rateLimits),
    finish_reason: finishReason,
    model: input.model,
  };

  return {
    response,
    rawResponse,
  };
}

export default handleNonStreamingChat;
