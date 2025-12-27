/**
 * Chat Tool Tests
 * Tests: Non-streaming, streaming, session continuation, tool calling,
 * token limit enforcement, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterClient, ChatCompletionResponse } from '../../src/api/OpenRouterClient.js';
import { Logger } from '../../src/utils/logger.js';
import { SessionManager } from '../../src/session/SessionManager.js';
import { createChatHandler, getOrCreateSession, buildMessageList } from '../../src/tools/chat/handler.js';
import { handleNonStreamingChat, extractToolCalls, toRateLimitStatus } from '../../src/tools/chat/nonStreaming.js';
import { accumulateChunks, parseSSEStream } from '../../src/tools/chat/streaming.js';
import { ChatInputSchema, ChatInput, StreamingChunk } from '../../src/tools/chat/schema.js';
import { RateLimitInfo } from '../../src/api/RateLimitManager.js';

// ============================================================================
// Test Utilities
// ============================================================================

// Create a silent logger for tests
const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'test' });
};

// Mock successful non-streaming response
const mockNonStreamingResponse: ChatCompletionResponse = {
  id: 'chatcmpl-123',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 8,
    total_tokens: 18,
  },
};

// Mock tool calling response
const mockToolCallResponse: ChatCompletionResponse = {
  id: 'chatcmpl-456',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "San Francisco", "unit": "celsius"}',
            },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: {
    prompt_tokens: 20,
    completion_tokens: 15,
    total_tokens: 35,
  },
};

// Helper to create a mock ReadableStream for SSE testing
function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// ============================================================================
// Test 1: Non-streaming Chat Completion
// ============================================================================

describe('Non-streaming Chat Completion', () => {
  let mockClient: OpenRouterClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionTimeoutMs: 30 * 60 * 1000,
    });

    mockClient = {
      createChatCompletion: vi.fn().mockResolvedValue({
        data: mockNonStreamingResponse,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;
  });

  it('should return complete response with usage statistics', async () => {
    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    };

    const result = await handler(input);

    // Should not be an error
    expect(result.isError).toBeFalsy();

    // Should have text content
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]?.type).toBe('text');

    // Should have structured content
    expect(result.structuredContent).toBeDefined();
    const structured = result.structuredContent as {
      content: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      session_id: string;
    };

    expect(structured.content).toBe('Hello! How can I help you today?');
    expect(structured.usage).toBeDefined();
    expect(structured.usage.prompt_tokens).toBe(10);
    expect(structured.usage.completion_tokens).toBe(8);
    expect(structured.usage.total_tokens).toBe(18);
    expect(structured.session_id).toBeDefined();
  });

  it('should create a new session when none provided', async () => {
    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    };

    const result = await handler(input);
    const structured = result.structuredContent as { session_id: string };

    // Should have a session ID
    expect(structured.session_id).toBeDefined();
    expect(structured.session_id.length).toBeGreaterThan(0);

    // Session should exist in manager
    const session = sessionManager.getSession(structured.session_id);
    expect(session).not.toBeNull();
  });
});

// ============================================================================
// Test 2: Streaming Response with Delta Chunks
// ============================================================================

describe('Streaming Response with Delta Chunks', () => {
  it('should parse SSE chunks correctly', async () => {
    const sseData = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":" there"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"!"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const stream = createMockSSEStream(sseData);
    const chunks: StreamingChunk[] = [];
    const logger = createTestLogger();

    for await (const chunk of parseSSEStream(stream, logger)) {
      if (chunk.choices?.[0]) {
        chunks.push({
          index: chunk.choices[0].index,
          delta: {
            content: chunk.choices[0].delta.content,
            tool_calls: chunk.choices[0].delta.tool_calls,
          },
          finish_reason: chunk.choices[0].finish_reason ?? undefined,
        });
      }
    }

    expect(chunks.length).toBe(4);

    // Accumulate chunks
    const { content, finishReason } = accumulateChunks(chunks);

    expect(content).toBe('Hello there!');
    expect(finishReason).toBe('stop');
  });

  it('should handle [DONE] termination signal', async () => {
    const sseData = [
      'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n\n',
      'data: [DONE]\n\n',
      // Data after [DONE] should be ignored
      'data: {"id":"2","choices":[{"index":0,"delta":{"content":" extra"}}]}\n\n',
    ];

    const stream = createMockSSEStream(sseData);
    const chunks: StreamingChunk[] = [];
    const logger = createTestLogger();

    for await (const chunk of parseSSEStream(stream, logger)) {
      if (chunk.choices?.[0]) {
        chunks.push({
          index: chunk.choices[0].index,
          delta: { content: chunk.choices[0].delta.content },
        });
      }
    }

    // Only one chunk should be processed (before [DONE])
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.delta.content).toBe('Hi');
  });

  it('should accumulate delta content correctly', () => {
    const chunks: StreamingChunk[] = [
      { index: 0, delta: { content: 'The ' } },
      { index: 0, delta: { content: 'quick ' } },
      { index: 0, delta: { content: 'brown ' } },
      { index: 0, delta: { content: 'fox' } },
      { index: 0, delta: {}, finish_reason: 'stop' },
    ];

    const { content, finishReason } = accumulateChunks(chunks);

    expect(content).toBe('The quick brown fox');
    expect(finishReason).toBe('stop');
  });
});

// ============================================================================
// Test 3: Session Continuation with History
// ============================================================================

describe('Session Continuation with History', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionTimeoutMs: 30 * 60 * 1000,
    });
  });

  it('should continue existing session when session_id provided', () => {
    const logger = createTestLogger();

    // Create initial session
    const sessionId = sessionManager.createSession('openai/gpt-4');
    sessionManager.addMessage(sessionId, { role: 'user', content: 'First message' });
    sessionManager.addMessage(sessionId, { role: 'assistant', content: 'First response' });

    // Input with session_id
    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Second message' }],
      session_id: sessionId,
    };

    // Get the session
    const returnedSessionId = getOrCreateSession(input, sessionManager, logger);

    expect(returnedSessionId).toBe(sessionId);

    // Build message list should include history
    const messages = buildMessageList(input, sessionManager, returnedSessionId, logger);

    expect(messages.length).toBe(3); // First user, first assistant, second user
    expect(messages[0]?.content).toBe('First message');
    expect(messages[1]?.content).toBe('First response');
    expect(messages[2]?.content).toBe('Second message');
  });

  it('should create new session when session_id not found', () => {
    const logger = createTestLogger();

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      session_id: 'nonexistent-session-id',
    };

    const sessionId = getOrCreateSession(input, sessionManager, logger);

    // Should be a new session ID (not the one we provided)
    expect(sessionId).not.toBe('nonexistent-session-id');

    // New session should exist
    const session = sessionManager.getSession(sessionId);
    expect(session).not.toBeNull();
  });

  it('should update session with assistant response', async () => {
    const sessionId = sessionManager.createSession('openai/gpt-4');

    const mockClient = {
      createChatCompletion: vi.fn().mockResolvedValue({
        data: mockNonStreamingResponse,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      session_id: sessionId,
      stream: false,
    };

    await handler(input);

    // Check session now has both user and assistant messages
    const messages = sessionManager.getMessages(sessionId);

    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('Hello!');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toBe('Hello! How can I help you today?');
  });
});

// ============================================================================
// Test 4: Tool Calling Returns Structured Data
// ============================================================================

describe('Tool Calling Returns Structured Data', () => {
  it('should extract tool calls from response', () => {
    const toolCalls = extractToolCalls(mockToolCallResponse);

    expect(toolCalls).toBeDefined();
    expect(toolCalls?.length).toBe(1);

    const tc = toolCalls?.[0];
    expect(tc?.id).toBe('call_abc123');
    expect(tc?.type).toBe('function');
    expect(tc?.function.name).toBe('get_weather');
    expect(tc?.function.arguments).toBe('{"location": "San Francisco", "unit": "celsius"}');
  });

  it('should return tool calls without executing them', async () => {
    const mockClient = {
      createChatCompletion: vi.fn().mockResolvedValue({
        data: mockToolCallResponse,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const sessionManager = new SessionManager();
    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
      stream: false,
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
              },
            },
          },
        },
      ],
    };

    const result = await handler(input);
    const structured = result.structuredContent as {
      tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
      content: string | null;
    };

    // Should have tool calls
    expect(structured.tool_calls).toBeDefined();
    expect(structured.tool_calls.length).toBe(1);
    expect(structured.tool_calls[0]?.function.name).toBe('get_weather');

    // Content should be null when tool calls are present
    expect(structured.content).toBeNull();
  });

  it('should accumulate tool calls in streaming response', () => {
    const chunks: StreamingChunk[] = [
      {
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, id: 'call_1', type: 'function', function: { name: 'get_' } },
          ],
        },
      },
      {
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, function: { name: 'weather', arguments: '{"loc' } },
          ],
        },
      },
      {
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, function: { arguments: 'ation":"NYC"}' } },
          ],
        },
      },
      { index: 0, delta: {}, finish_reason: 'tool_calls' },
    ];

    const { toolCalls, finishReason } = accumulateChunks(chunks);

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]?.id).toBe('call_1');
    expect(toolCalls[0]?.function.name).toBe('get_weather');
    expect(toolCalls[0]?.function.arguments).toBe('{"location":"NYC"}');
    expect(finishReason).toBe('tool_calls');
  });
});

// ============================================================================
// Test 5: Token Limit Enforcement
// ============================================================================

describe('Token Limit Enforcement', () => {
  it('should warn when approaching context limit', () => {
    const sessionManager = new SessionManager({
      defaultContextLimit: 100, // Very small limit for testing
      warningThreshold: 0.8,
    });

    const sessionId = sessionManager.createSession('test-model');

    // Add messages until we approach the limit
    for (let i = 0; i < 5; i++) {
      const result = sessionManager.addMessage(sessionId, {
        role: 'user',
        content: 'This is a test message that takes some tokens.',
      });

      if (result.warning) {
        // We should get a warning before truncation
        expect(result.warning).toContain('Context usage at');
        break;
      }
    }
  });

  it('should truncate oldest messages when limit exceeded', () => {
    const sessionManager = new SessionManager({
      defaultContextLimit: 50, // Very small limit for testing
      warningThreshold: 0.8,
    });

    const sessionId = sessionManager.createSession('test-model');

    // Add a system message (should be preserved)
    sessionManager.addMessage(sessionId, {
      role: 'system',
      content: 'You are helpful.',
    });

    // Add several user/assistant messages to exceed limit
    for (let i = 0; i < 10; i++) {
      sessionManager.addMessage(sessionId, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: This is content that uses tokens.`,
      });
    }

    const messages = sessionManager.getMessages(sessionId);

    // System message should be preserved (first message)
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toBe('You are helpful.');

    // Some messages should have been removed
    expect(messages.length).toBeLessThan(11);
  });
});

// ============================================================================
// Test 6: Error Handling for Invalid Model
// ============================================================================

describe('Error Handling', () => {
  it('should handle invalid model error gracefully', async () => {
    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new Error('MODEL_NOT_FOUND: Model "invalid/model" not found')
      ),
    } as unknown as OpenRouterClient;

    const sessionManager = new SessionManager();
    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'invalid/model',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    };

    const result = await handler(input);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid model');
    expect(result.content[0]?.text).toContain('invalid/model');
  });

  it('should handle authentication errors', async () => {
    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new Error('AUTH: 401 Unauthorized')
      ),
    } as unknown as OpenRouterClient;

    const sessionManager = new SessionManager();
    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    };

    const result = await handler(input);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Authentication failed');
  });

  it('should handle rate limit errors', async () => {
    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new Error('RATE_LIMIT: 429 Too Many Requests')
      ),
    } as unknown as OpenRouterClient;

    const sessionManager = new SessionManager();
    const handler = createChatHandler({
      client: mockClient,
      sessionManager,
      logger: createTestLogger(),
    });

    const input: ChatInput = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    };

    const result = await handler(input);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Rate limit exceeded');
  });
});

// ============================================================================
// Test 7: Rate Limit Status Conversion
// ============================================================================

describe('Rate Limit Status', () => {
  it('should convert rate limit info to chat status', () => {
    const rateLimitInfo: RateLimitInfo = {
      requestsLimit: 100,
      requestsRemaining: 50,
      tokensLimit: 10000,
      tokensRemaining: 8000,
      isApproachingRequestLimit: false,
      isApproachingTokenLimit: false,
      percentRequestsRemaining: 50,
      percentTokensRemaining: 80,
    };

    const status = toRateLimitStatus(rateLimitInfo);

    expect(status).toBeDefined();
    expect(status?.requestsLimit).toBe(100);
    expect(status?.requestsRemaining).toBe(50);
    expect(status?.tokensLimit).toBe(10000);
    expect(status?.tokensRemaining).toBe(8000);
    expect(status?.isApproachingLimit).toBe(false);
  });

  it('should indicate approaching limit', () => {
    const rateLimitInfo: RateLimitInfo = {
      requestsLimit: 100,
      requestsRemaining: 5,
      isApproachingRequestLimit: true,
      isApproachingTokenLimit: false,
      percentRequestsRemaining: 5,
    };

    const status = toRateLimitStatus(rateLimitInfo);

    expect(status?.isApproachingLimit).toBe(true);
  });

  it('should return undefined for null rate limits', () => {
    const status = toRateLimitStatus(null);
    expect(status).toBeUndefined();
  });
});

// ============================================================================
// Test 8: Schema Validation
// ============================================================================

describe('Input Schema Validation', () => {
  it('should require model and messages', () => {
    const result = ChatInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept valid input with required fields only', () => {
    const result = ChatInputSchema.safeParse({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.success).toBe(true);
  });

  it('should accept valid input with all optional fields', () => {
    const result = ChatInputSchema.safeParse({
      model: 'openai/gpt-4',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
      session_id: 'abc-123',
      stream: false,
      temperature: 0.7,
      max_tokens: 1000,
      tools: [
        {
          type: 'function',
          function: {
            name: 'test_func',
            description: 'A test function',
            parameters: { type: 'object' },
          },
        },
      ],
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid temperature', () => {
    const result = ChatInputSchema.safeParse({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 3, // Invalid: max is 2
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty messages array', () => {
    const result = ChatInputSchema.safeParse({
      model: 'openai/gpt-4',
      messages: [],
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid message role', () => {
    const result = ChatInputSchema.safeParse({
      model: 'openai/gpt-4',
      messages: [{ role: 'invalid', content: 'Hello' }],
    });

    expect(result.success).toBe(false);
  });
});
