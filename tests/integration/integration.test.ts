/**
 * Integration Tests for OpenRouter MCP Server
 * Tests: Full flow, multi-turn conversations, tool calling, rate limit handling,
 * error propagation, session expiry, concurrent requests, and graceful shutdown
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenRouterServer } from '../../src/server/OpenRouterServer.js';
import { OpenRouterClient, OpenRouterModel, ChatCompletionResponse } from '../../src/api/OpenRouterClient.js';
import { SessionManager } from '../../src/session/SessionManager.js';
import { createListModelsHandler } from '../../src/tools/listModels/handler.js';
import { createSearchModelsHandler } from '../../src/tools/searchModels/handler.js';
import { createChatHandler } from '../../src/tools/chat/handler.js';
import { Logger } from '../../src/utils/logger.js';
import { ApiError, RateLimitError, AuthError, ErrorCode } from '../../src/api/errors.js';

// ============================================================================
// Test Utilities
// ============================================================================

const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'integration-test' });
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
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
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
];

const mockChatResponse: ChatCompletionResponse = {
  id: 'chatcmpl-integration-test',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! I am ready to help you.',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 15,
    completion_tokens: 10,
    total_tokens: 25,
  },
};

// ============================================================================
// Test 1: Full Flow - List Models -> Select Model -> Chat
// ============================================================================

describe('Integration: Full Flow (List Models -> Select Model -> Chat)', () => {
  let mockClient: OpenRouterClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({ sessionTimeoutMs: 30 * 60 * 1000 });

    mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
      createChatCompletion: vi.fn().mockResolvedValue({
        data: mockChatResponse,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;
  });

  afterEach(() => {
    sessionManager.clearAllSessions();
  });

  it('should complete full flow: list models, select model, start chat', async () => {
    const logger = createTestLogger();

    // Step 1: List all available models
    const listHandler = createListModelsHandler({ client: mockClient, logger });
    const listResult = await listHandler({});

    expect(listResult.isError).toBeFalsy();
    const listStructured = listResult.structuredContent as { models: Array<{ id: string }> };
    expect(listStructured.models.length).toBe(3);

    // Step 2: Search for models with specific capabilities (tools support)
    const searchHandler = createSearchModelsHandler({ client: mockClient, logger });
    const searchResult = await searchHandler({ supports_tools: true, sort_by: 'price', sort_order: 'asc' });

    expect(searchResult.isError).toBeFalsy();
    const searchStructured = searchResult.structuredContent as { models: Array<{ id: string }> };
    expect(searchStructured.models.length).toBeGreaterThan(0);

    // Step 3: Select a model (GPT-4) and start a chat
    const selectedModel = 'openai/gpt-4';
    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    const chatResult = await chatHandler({
      model: selectedModel,
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    expect(chatResult.isError).toBeFalsy();
    const chatStructured = chatResult.structuredContent as { content: string; session_id: string };
    expect(chatStructured.content).toBe('Hello! I am ready to help you.');
    expect(chatStructured.session_id).toBeDefined();

    // Verify the session was created
    const session = sessionManager.getSession(chatStructured.session_id);
    expect(session).not.toBeNull();
    expect(session?.metadata.model).toBe(selectedModel);
  });

  it('should handle the complete workflow with different model selection', async () => {
    const logger = createTestLogger();

    // List models first
    const listHandler = createListModelsHandler({ client: mockClient, logger });
    const listResult = await listHandler({ provider: 'anthropic' });

    const listStructured = listResult.structuredContent as { models: Array<{ id: string }> };
    expect(listStructured.models.some(m => m.id === 'anthropic/claude-3-opus')).toBe(true);

    // Chat with Claude
    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });
    const chatResult = await chatHandler({
      model: 'anthropic/claude-3-opus',
      messages: [{ role: 'user', content: 'Hello Claude!' }],
      stream: false,
    });

    expect(chatResult.isError).toBeFalsy();
    const chatStructured = chatResult.structuredContent as { session_id: string };

    const session = sessionManager.getSession(chatStructured.session_id);
    expect(session?.metadata.model).toBe('anthropic/claude-3-opus');
  });
});

// ============================================================================
// Test 2: Multi-turn Conversation Across Sessions
// ============================================================================

describe('Integration: Multi-turn Conversation Across Sessions', () => {
  let mockClient: OpenRouterClient;
  let sessionManager: SessionManager;
  let turnCount: number;

  beforeEach(() => {
    turnCount = 0;
    sessionManager = new SessionManager({ sessionTimeoutMs: 30 * 60 * 1000 });

    mockClient = {
      createChatCompletion: vi.fn().mockImplementation(async () => {
        turnCount++;
        return {
          data: {
            id: `chatcmpl-turn-${turnCount}`,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: `This is response ${turnCount} in our conversation.`,
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 10 * turnCount, completion_tokens: 8, total_tokens: 10 * turnCount + 8 },
          },
          rateLimits: null,
          throttleStatus: { isThrottled: false },
          cached: false,
        };
      }),
    } as unknown as OpenRouterClient;
  });

  afterEach(() => {
    sessionManager.clearAllSessions();
  });

  it('should maintain conversation context across multiple turns', async () => {
    const logger = createTestLogger();
    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    // Turn 1: Start conversation
    const turn1 = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello, my name is Alice.' }],
      stream: false,
    });

    expect(turn1.isError).toBeFalsy();
    const turn1Structured = turn1.structuredContent as { session_id: string; content: string };
    const sessionId = turn1Structured.session_id;
    expect(turn1Structured.content).toContain('response 1');

    // Turn 2: Continue conversation with session_id
    const turn2 = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'What is my name?' }],
      session_id: sessionId,
      stream: false,
    });

    expect(turn2.isError).toBeFalsy();
    const turn2Structured = turn2.structuredContent as { session_id: string; content: string };
    expect(turn2Structured.session_id).toBe(sessionId);
    expect(turn2Structured.content).toContain('response 2');

    // Turn 3: Continue further
    const turn3 = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Tell me a joke.' }],
      session_id: sessionId,
      stream: false,
    });

    expect(turn3.isError).toBeFalsy();

    // Verify session contains all messages
    const messages = sessionManager.getMessages(sessionId);
    expect(messages.length).toBe(6); // 3 user + 3 assistant messages

    // Verify message order
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[2]?.role).toBe('user');
  });

  it('should handle parallel sessions independently', async () => {
    const logger = createTestLogger();
    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    // Create session 1
    const session1Turn1 = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Session 1: Message 1' }],
      stream: false,
    });
    const session1Id = (session1Turn1.structuredContent as { session_id: string }).session_id;

    // Create session 2
    const session2Turn1 = await chatHandler({
      model: 'anthropic/claude-3-opus',
      messages: [{ role: 'user', content: 'Session 2: Message 1' }],
      stream: false,
    });
    const session2Id = (session2Turn1.structuredContent as { session_id: string }).session_id;

    // Sessions should be different
    expect(session1Id).not.toBe(session2Id);

    // Continue session 1
    await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Session 1: Message 2' }],
      session_id: session1Id,
      stream: false,
    });

    // Verify sessions are independent
    const session1Messages = sessionManager.getMessages(session1Id);
    const session2Messages = sessionManager.getMessages(session2Id);

    expect(session1Messages.length).toBe(4); // 2 user + 2 assistant
    expect(session2Messages.length).toBe(2); // 1 user + 1 assistant

    // Verify session metadata
    const session1 = sessionManager.getSession(session1Id);
    const session2 = sessionManager.getSession(session2Id);
    expect(session1?.metadata.model).toBe('openai/gpt-4');
    expect(session2?.metadata.model).toBe('anthropic/claude-3-opus');
  });
});

// ============================================================================
// Test 3: Tool Calling Flow End-to-End
// ============================================================================

describe('Integration: Tool Calling Flow End-to-End', () => {
  let mockClient: OpenRouterClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({ sessionTimeoutMs: 30 * 60 * 1000 });
  });

  afterEach(() => {
    sessionManager.clearAllSessions();
  });

  it('should handle tool calling response and allow follow-up with tool result', async () => {
    const logger = createTestLogger();
    let callCount = 0;

    mockClient = {
      createChatCompletion: vi.fn().mockImplementation(async (request) => {
        callCount++;

        if (callCount === 1) {
          // First call: return tool call
          return {
            data: {
              id: 'chatcmpl-tool-1',
              choices: [{
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{
                    id: 'call_weather_123',
                    type: 'function',
                    function: {
                      name: 'get_weather',
                      arguments: '{"location":"San Francisco","unit":"celsius"}',
                    },
                  }],
                },
                finish_reason: 'tool_calls',
              }],
              usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
            },
            rateLimits: null,
            throttleStatus: { isThrottled: false },
            cached: false,
          };
        } else {
          // Second call: return final response using tool result
          return {
            data: {
              id: 'chatcmpl-tool-2',
              choices: [{
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'The weather in San Francisco is 18 degrees Celsius and sunny.',
                },
                finish_reason: 'stop',
              }],
              usage: { prompt_tokens: 40, completion_tokens: 15, total_tokens: 55 },
            },
            rateLimits: null,
            throttleStatus: { isThrottled: false },
            cached: false,
          };
        }
      }),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    // First message: Ask about weather with tools defined
    const result1 = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
      stream: false,
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'The city name' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['location'],
          },
        },
      }],
    });

    expect(result1.isError).toBeFalsy();
    const result1Structured = result1.structuredContent as {
      tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
      session_id: string;
    };

    // Verify tool call was returned
    expect(result1Structured.tool_calls).toBeDefined();
    expect(result1Structured.tool_calls.length).toBe(1);
    expect(result1Structured.tool_calls[0]?.function.name).toBe('get_weather');

    const sessionId = result1Structured.session_id;

    // Simulate client handling the tool call and sending result back
    const result2 = await chatHandler({
      model: 'openai/gpt-4',
      messages: [
        { role: 'tool', content: '{"temperature": 18, "condition": "sunny"}', name: 'get_weather', tool_call_id: 'call_weather_123' },
      ],
      session_id: sessionId,
      stream: false,
    });

    expect(result2.isError).toBeFalsy();
    const result2Structured = result2.structuredContent as { content: string };
    expect(result2Structured.content).toContain('18 degrees Celsius');
    expect(result2Structured.content).toContain('sunny');
  });
});

// ============================================================================
// Test 4: Rate Limit Handling Under Load
// ============================================================================

describe('Integration: Rate Limit Handling Under Load', () => {
  let mockClient: OpenRouterClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({ sessionTimeoutMs: 30 * 60 * 1000 });
  });

  afterEach(() => {
    sessionManager.clearAllSessions();
  });

  it('should handle rate limit errors gracefully', async () => {
    const logger = createTestLogger();

    mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new RateLimitError('Rate limit exceeded. Please slow down.', {
          limitType: 'requests',
          limit: 100,
          remaining: 0,
          retryAfter: 60,
        })
      ),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    const result = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Rate limit exceeded');
  });

  it('should handle approaching rate limits in response metadata', async () => {
    const logger = createTestLogger();

    mockClient = {
      createChatCompletion: vi.fn().mockResolvedValue({
        data: mockChatResponse,
        rateLimits: {
          requestsLimit: 100,
          requestsRemaining: 5,
          tokensLimit: 10000,
          tokensRemaining: 9000,
          isApproachingRequestLimit: true,
          isApproachingTokenLimit: false,
          percentRequestsRemaining: 5,
          percentTokensRemaining: 90,
        },
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    const result = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { rate_limit_status?: { isApproachingLimit: boolean } };

    // The response should include rate limit status
    expect(structured.rate_limit_status).toBeDefined();
    expect(structured.rate_limit_status?.isApproachingLimit).toBe(true);
  });
});

// ============================================================================
// Test 5: Error Propagation from API to MCP Response
// ============================================================================

describe('Integration: Error Propagation from API to MCP Response', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({ sessionTimeoutMs: 30 * 60 * 1000 });
  });

  afterEach(() => {
    sessionManager.clearAllSessions();
  });

  it('should propagate authentication errors correctly', async () => {
    const logger = createTestLogger();

    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new AuthError('Invalid API key provided', ErrorCode.AUTH_INVALID_KEY, 401)
      ),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    const result = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid API key');
  });

  it('should propagate model not found errors correctly', async () => {
    const logger = createTestLogger();

    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new ApiError({
          code: ErrorCode.MODEL_NOT_FOUND,
          message: 'Model "nonexistent/model" not found',
          statusCode: 404,
        })
      ),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    const result = await chatHandler({
      model: 'nonexistent/model',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid model');
  });

  it('should propagate network errors correctly', async () => {
    const logger = createTestLogger();

    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(
        new ApiError({
          code: ErrorCode.API_NETWORK_ERROR,
          message: 'Network error: Connection refused',
        })
      ),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    const result = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('error');
  });

  it('should propagate validation errors from list models', async () => {
    const logger = createTestLogger();

    const mockClient = {
      listModels: vi.fn().mockRejectedValue(
        new ApiError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid filter parameters',
          statusCode: 400,
        })
      ),
    } as unknown as OpenRouterClient;

    const listHandler = createListModelsHandler({ client: mockClient, logger });

    const result = await listHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Error');
  });
});

// ============================================================================
// Test 6: Session Expiry During Conversation
// ============================================================================

describe('Integration: Session Expiry During Conversation', () => {
  it('should handle session expiry gracefully', () => {
    vi.useFakeTimers();

    try {
      const sessionManager = new SessionManager({
        sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes for testing
      });

      // Create a session
      const sessionId = sessionManager.createSession('openai/gpt-4');
      sessionManager.addMessage(sessionId, { role: 'user', content: 'Hello!' });

      // Session should exist
      expect(sessionManager.getSession(sessionId)).not.toBeNull();

      // Advance time past expiry
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Session should be expired
      expect(sessionManager.getSession(sessionId)).toBeNull();

      // Trying to add message should fail
      expect(() => {
        sessionManager.addMessage(sessionId, { role: 'user', content: 'Still there?' });
      }).toThrow('Session not found');

      sessionManager.clearAllSessions();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should create new session when expired session is referenced', async () => {
    vi.useFakeTimers();

    try {
      const sessionManager = new SessionManager({
        sessionTimeoutMs: 5 * 60 * 1000,
      });
      const logger = createTestLogger();

      const mockClient = {
        createChatCompletion: vi.fn().mockResolvedValue({
          data: mockChatResponse,
          rateLimits: null,
          throttleStatus: { isThrottled: false },
          cached: false,
        }),
      } as unknown as OpenRouterClient;

      const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

      // Create initial session
      const result1 = await chatHandler({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }],
        stream: false,
      });

      const originalSessionId = (result1.structuredContent as { session_id: string }).session_id;

      // Advance time past expiry
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Try to continue with expired session
      const result2 = await chatHandler({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Are you still there?' }],
        session_id: originalSessionId,
        stream: false,
      });

      const newSessionId = (result2.structuredContent as { session_id: string }).session_id;

      // Should have created a new session
      expect(newSessionId).not.toBe(originalSessionId);

      sessionManager.clearAllSessions();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================================
// Test 7: Concurrent Requests Handling
// ============================================================================

describe('Integration: Concurrent Requests Handling', () => {
  let mockClient: OpenRouterClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({ sessionTimeoutMs: 30 * 60 * 1000 });

    let requestCount = 0;
    mockClient = {
      listModels: vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate network delay
        return {
          data: mockModels,
          rateLimits: null,
          throttleStatus: { isThrottled: false },
          cached: false,
        };
      }),
      createChatCompletion: vi.fn().mockImplementation(async () => {
        requestCount++;
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate network delay
        return {
          data: {
            ...mockChatResponse,
            id: `chatcmpl-concurrent-${requestCount}`,
          },
          rateLimits: null,
          throttleStatus: { isThrottled: false },
          cached: false,
        };
      }),
    } as unknown as OpenRouterClient;
  });

  afterEach(() => {
    sessionManager.clearAllSessions();
  });

  it('should handle multiple concurrent list models requests', async () => {
    const logger = createTestLogger();
    const listHandler = createListModelsHandler({ client: mockClient, logger });

    // Fire multiple requests concurrently
    const requests = [
      listHandler({}),
      listHandler({ provider: 'openai' }),
      listHandler({ provider: 'anthropic' }),
    ];

    const results = await Promise.all(requests);

    // All requests should succeed
    expect(results.every(r => !r.isError)).toBe(true);

    // Verify each returned appropriate data
    const allModels = (results[0]!.structuredContent as { models: unknown[] }).models;
    const openaiModels = (results[1]!.structuredContent as { models: unknown[] }).models;
    const anthropicModels = (results[2]!.structuredContent as { models: unknown[] }).models;

    expect(allModels.length).toBe(3);
    expect(openaiModels.length).toBe(2); // GPT-4 and GPT-4 Turbo
    expect(anthropicModels.length).toBe(1); // Claude 3 Opus
  });

  it('should handle concurrent chat requests creating independent sessions', async () => {
    const logger = createTestLogger();
    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });

    // Fire multiple chat requests concurrently
    const requests = [
      chatHandler({ model: 'openai/gpt-4', messages: [{ role: 'user', content: 'Hello 1' }], stream: false }),
      chatHandler({ model: 'openai/gpt-4', messages: [{ role: 'user', content: 'Hello 2' }], stream: false }),
      chatHandler({ model: 'openai/gpt-4', messages: [{ role: 'user', content: 'Hello 3' }], stream: false }),
    ];

    const results = await Promise.all(requests);

    // All requests should succeed
    expect(results.every(r => !r.isError)).toBe(true);

    // Each should have a unique session ID
    const sessionIds = results.map(r => (r.structuredContent as { session_id: string }).session_id);
    const uniqueIds = new Set(sessionIds);

    expect(uniqueIds.size).toBe(3);
  });
});

// ============================================================================
// Test 8: Graceful Shutdown with Active Sessions
// ============================================================================

describe('Integration: Graceful Shutdown with Active Sessions', () => {
  it('should cleanup sessions when shutdown is initiated', () => {
    const sessionManager = new SessionManager({
      sessionTimeoutMs: 30 * 60 * 1000,
      cleanupIntervalMs: 1000,
    });

    // Create multiple sessions
    const session1 = sessionManager.createSession('openai/gpt-4');
    const session2 = sessionManager.createSession('anthropic/claude-3-opus');

    // Add messages to sessions
    sessionManager.addMessage(session1, { role: 'user', content: 'Hello!' });
    sessionManager.addMessage(session2, { role: 'user', content: 'Hi there!' });

    // Verify sessions exist
    expect(sessionManager.listSessions().length).toBe(2);

    // Simulate shutdown: stop cleanup worker and clear sessions
    sessionManager.stopCleanupWorker();
    sessionManager.clearAllSessions();

    // Verify all sessions are cleared
    expect(sessionManager.listSessions().length).toBe(0);
    expect(sessionManager.getSession(session1)).toBeNull();
    expect(sessionManager.getSession(session2)).toBeNull();
  });

  it('should handle server stop without errors', async () => {
    const server = new OpenRouterServer({
      apiKey: 'test-api-key',
      logger: createTestLogger(),
    });

    // Register a tool
    const { z } = await import('zod');
    server.registerTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({}),
      handler: async () => ({ content: [{ type: 'text' as const, text: 'OK' }] }),
    });

    // Stop without starting (should not throw)
    await expect(server.stop()).resolves.not.toThrow();
    expect(server.isServerRunning()).toBe(false);
  });
});

// ============================================================================
// MCP Protocol Compliance Tests
// ============================================================================

describe('Integration: MCP Protocol Compliance', () => {
  it('should return properly formatted MCP response for list models', async () => {
    const logger = createTestLogger();

    const mockClient = {
      listModels: vi.fn().mockResolvedValue({
        data: mockModels,
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      }),
    } as unknown as OpenRouterClient;

    const listHandler = createListModelsHandler({ client: mockClient, logger });
    const result = await listHandler({});

    // Verify MCP response structure
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('text');

    // Verify structured content exists
    expect(result).toHaveProperty('structuredContent');

    // Verify isError is not set for success
    expect(result.isError).toBeFalsy();
  });

  it('should return MCP-compliant error response', async () => {
    const logger = createTestLogger();
    const sessionManager = new SessionManager();

    const mockClient = {
      createChatCompletion: vi.fn().mockRejectedValue(new Error('Test error')),
    } as unknown as OpenRouterClient;

    const chatHandler = createChatHandler({ client: mockClient, sessionManager, logger });
    const result = await chatHandler({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    });

    // Verify MCP error response structure
    expect(result.isError).toBe(true);
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]?.type).toBe('text');
    expect(typeof result.content[0]?.text).toBe('string');

    sessionManager.clearAllSessions();
  });

  it('should provide valid tool schema for registration', () => {
    const server = new OpenRouterServer({
      apiKey: 'test-api-key',
      logger: createTestLogger(),
    });

    // Get registered tools
    const tools = server.getRegisteredTools();

    // Initially should be empty
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(0);

    // Register a tool and verify
    const { z } = require('zod');
    server.registerTool({
      name: 'test_tool',
      description: 'Test tool description',
      inputSchema: z.object({
        param1: z.string().describe('A string parameter'),
        param2: z.number().optional().describe('An optional number'),
      }),
      handler: async () => ({ content: [{ type: 'text' as const, text: 'OK' }] }),
    });

    expect(server.getRegisteredTools()).toContain('test_tool');
  });
});
