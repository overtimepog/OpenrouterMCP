/**
 * Streaming handler for the openrouter_chat tool.
 * Handles chat completion requests with SSE streaming.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { RateLimitInfo } from '../../api/RateLimitManager.js';
import { Logger } from '../../utils/logger.js';
import { SessionManager } from '../../session/SessionManager.js';
import { SessionMessage } from '../../session/types.js';
import { ChatInput, ChatResponse, ChatToolCall, StreamingChunk } from './schema.js';
import { toRateLimitStatus } from './nonStreaming.js';

// ============================================================================
// Types
// ============================================================================

export interface StreamingHandlerConfig {
  client: OpenRouterClient;
  sessionManager: SessionManager;
  logger: Logger;
}

export interface StreamingResult {
  response: ChatResponse;
  chunks: StreamingChunk[];
}

/**
 * Structure of SSE streaming response from OpenRouter
 */
interface SSEChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
    native_finish_reason?: string;
    annotations?: Array<{ type: string; url_citation?: { url: string; title: string; content?: string } }>;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// SSE Parser
// ============================================================================

/**
 * Parse SSE data chunks from a ReadableStream
 * Handles the `data: {...}` format and `data: [DONE]` termination
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  logger: Logger
): AsyncGenerator<SSEChunk, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        logger.debug('SSE stream ended');
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines
        if (!trimmedLine) {
          continue;
        }

        // Check for data prefix
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6); // Remove 'data: ' prefix

          // Check for termination signal
          if (data === '[DONE]') {
            logger.debug('Received SSE [DONE] signal');
            return;
          }

          // Parse JSON data
          try {
            const parsed = JSON.parse(data) as SSEChunk;
            yield parsed;
          } catch (parseError) {
            logger.warn('Failed to parse SSE chunk', {
              data,
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
            });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Accumulate streaming chunks into a complete response
 */
export function accumulateChunks(chunks: StreamingChunk[]): {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
} {
  let content = '';
  const toolCallsMap = new Map<number, {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>();
  let finishReason: string | null = null;

  for (const chunk of chunks) {
    // Accumulate content
    if (chunk.delta.content) {
      content += chunk.delta.content;
    }

    // Accumulate tool calls
    if (chunk.delta.tool_calls) {
      for (const tc of chunk.delta.tool_calls) {
        const existing = toolCallsMap.get(tc.index);

        if (!existing) {
          // Initialize new tool call
          toolCallsMap.set(tc.index, {
            id: tc.id ?? '',
            type: 'function',
            function: {
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            },
          });
        } else {
          // Append to existing tool call
          if (tc.id) {
            existing.id = tc.id;
          }
          if (tc.function?.name) {
            existing.function.name += tc.function.name;
          }
          if (tc.function?.arguments) {
            existing.function.arguments += tc.function.arguments;
          }
        }
      }
    }

    // Capture finish reason
    if (chunk.finish_reason) {
      finishReason = chunk.finish_reason;
    }
  }

  // Convert tool calls map to array
  const toolCalls = Array.from(toolCallsMap.values()).filter(
    (tc) => tc.id && tc.function.name
  );

  return { content, toolCalls, finishReason };
}

// ============================================================================
// Streaming Handler
// ============================================================================

/**
 * Handle streaming chat completion request
 */
export async function handleStreamingChat(
  input: ChatInput,
  config: StreamingHandlerConfig,
  sessionId: string,
  fullMessages: SessionMessage[]
): Promise<StreamingResult> {
  const { client, sessionManager, logger } = config;

  logger.debug('Processing streaming chat request', {
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
    stream: true,
    ...(input.temperature !== undefined && { temperature: input.temperature }),
    ...(input.max_tokens !== undefined && { max_tokens: input.max_tokens }),
    ...(input.tools && { tools: input.tools }),
    ...(input.tool_choice && { tool_choice: input.tool_choice }),
    ...(input.response_format && { response_format: input.response_format }),
    ...(input.top_p !== undefined && { top_p: input.top_p }),
    ...(input.top_k !== undefined && { top_k: input.top_k }),
    ...(input.min_p !== undefined && { min_p: input.min_p }),
    ...(input.top_a !== undefined && { top_a: input.top_a }),
    ...(input.frequency_penalty !== undefined && { frequency_penalty: input.frequency_penalty }),
    ...(input.presence_penalty !== undefined && { presence_penalty: input.presence_penalty }),
    ...(input.repetition_penalty !== undefined && { repetition_penalty: input.repetition_penalty }),
    ...(input.seed !== undefined && { seed: input.seed }),
    ...(input.stop !== undefined && { stop: input.stop }),
    ...(input.parallel_tool_calls !== undefined && { parallel_tool_calls: input.parallel_tool_calls }),
    ...(input.structured_outputs !== undefined && { structured_outputs: input.structured_outputs }),
    ...(input.reasoning && { reasoning: input.reasoning }),
    ...(input.plugins && { plugins: input.plugins }),
    ...(input.provider && { provider: input.provider }),
    ...(input.transforms && { transforms: input.transforms }),
    ...(input.models && { models: input.models }),
    ...(input.route && { route: input.route }),
    ...(input.prediction && { prediction: input.prediction }),
    ...(input.verbosity && { verbosity: input.verbosity }),
    ...(input.logprobs !== undefined && { logprobs: input.logprobs }),
    ...(input.top_logprobs !== undefined && { top_logprobs: input.top_logprobs }),
    ...(input.logit_bias && { logit_bias: input.logit_bias }),
    ...(input.max_completion_tokens !== undefined && { max_completion_tokens: input.max_completion_tokens }),
    ...(input.user && { user: input.user }),
    ...(input.debug && { debug: input.debug }),
  };

  // Make the streaming API call
  const streamResponse = await client.createStreamingChatCompletion(requestBody);
  const rateLimits: RateLimitInfo | null = streamResponse.rateLimits;

  // Collect and process chunks
  const chunks: StreamingChunk[] = [];
  let usage = undefined;
  let reasoningAccumulator = '';
  let nativeFinishReason: string | undefined;
  let annotations: ChatResponse['annotations'] | undefined;

  for await (const sseChunk of parseSSEStream(streamResponse.stream, logger)) {
    const choice = sseChunk.choices?.[0];

    if (choice) {
      const streamingChunk: StreamingChunk = {
        index: choice.index,
        delta: {
          content: choice.delta.content,
          tool_calls: choice.delta.tool_calls,
        },
        finish_reason: choice.finish_reason,
      };

      chunks.push(streamingChunk);

      // Accumulate reasoning tokens
      if (choice.delta.reasoning) {
        reasoningAccumulator += choice.delta.reasoning;
      }

      // Capture native_finish_reason and annotations (typically on final chunk)
      if (choice.native_finish_reason) {
        nativeFinishReason = choice.native_finish_reason;
      }
      if (choice.annotations) {
        annotations = choice.annotations;
      }
    }

    // Capture usage if present (usually in final chunk)
    if (sseChunk.usage) {
      usage = sseChunk.usage;
    }
  }

  logger.debug('Completed streaming response', {
    model: input.model,
    chunkCount: chunks.length,
    sessionId,
  });

  // Accumulate chunks into final response
  const { content, toolCalls, finishReason } = accumulateChunks(chunks);

  // Add assistant response to session
  if (content || toolCalls.length > 0) {
    const assistantMessage: SessionMessage = {
      role: 'assistant',
      content: content,
    };

    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls;
    }

    sessionManager.addMessage(sessionId, assistantMessage);
  }

  // Build response
  const reasoning = reasoningAccumulator || undefined;
  const response: ChatResponse = {
    content: content || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    session_id: sessionId,
    rate_limit_status: toRateLimitStatus(rateLimits),
    finish_reason: finishReason,
    model: input.model,
    ...(reasoning && { reasoning }),
    ...(annotations && { annotations }),
    ...(nativeFinishReason && { native_finish_reason: nativeFinishReason }),
  };

  return {
    response,
    chunks,
  };
}

export default handleStreamingChat;
