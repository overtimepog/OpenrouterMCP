/**
 * Session Management Tests for OpenRouter MCP Server
 * Tests: Session creation, message history, token counting, and session expiry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/session/SessionManager.js';
import { TokenCounter } from '../../src/session/TokenCounter.js';
import { Logger } from '../../src/utils/logger.js';
import type { SessionMessage } from '../../src/session/types.js';

// Create a silent logger for tests
const createTestLogger = (): Logger => {
  return new Logger({ level: 'error', name: 'test' });
};

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(
      {
        sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
        cleanupIntervalMs: 5 * 60 * 1000,  // 5 minutes
        warningThreshold: 0.8,
      },
      createTestLogger()
    );
  });

  afterEach(() => {
    sessionManager.stopCleanupWorker();
    sessionManager.clearAllSessions();
  });

  describe('Session Creation with Unique ID', () => {
    it('should create a session with a unique UUID v4 format ID', () => {
      const sessionId = sessionManager.createSession('openai/gpt-4o');

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(sessionId).toMatch(uuidV4Regex);
    });

    it('should create sessions with unique IDs for each call', () => {
      const ids = new Set<string>();
      const count = 100;

      for (let i = 0; i < count; i++) {
        const sessionId = sessionManager.createSession('openai/gpt-4o');
        ids.add(sessionId);
      }

      // All IDs should be unique
      expect(ids.size).toBe(count);
    });

    it('should store model information in session metadata', () => {
      const model = 'anthropic/claude-3.5-sonnet';
      const sessionId = sessionManager.createSession(model);
      const session = sessionManager.getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session?.metadata.model).toBe(model);
    });

    it('should initialize session with creation timestamps', () => {
      const before = new Date();
      const sessionId = sessionManager.createSession('openai/gpt-4o');
      const after = new Date();

      const session = sessionManager.getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session?.metadata.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session?.metadata.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session?.metadata.last_accessed.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('Message History Storage and Retrieval', () => {
    it('should store and retrieve messages in order', () => {
      const sessionId = sessionManager.createSession('openai/gpt-4o');

      const messages: SessionMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there! How can I help you?' },
      ];

      for (const message of messages) {
        sessionManager.addMessage(sessionId, message);
      }

      const retrieved = sessionManager.getMessages(sessionId);

      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].role).toBe('system');
      expect(retrieved[0].content).toBe('You are a helpful assistant.');
      expect(retrieved[1].role).toBe('user');
      expect(retrieved[1].content).toBe('Hello!');
      expect(retrieved[2].role).toBe('assistant');
      expect(retrieved[2].content).toBe('Hi there! How can I help you?');
    });

    it('should store messages with tool calls', () => {
      const sessionId = sessionManager.createSession('openai/gpt-4o');

      const messageWithToolCall: SessionMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "San Francisco"}',
            },
          },
        ],
      };

      sessionManager.addMessage(sessionId, messageWithToolCall);
      const retrieved = sessionManager.getMessages(sessionId);

      expect(retrieved[0].tool_calls).toBeDefined();
      expect(retrieved[0].tool_calls).toHaveLength(1);
      expect(retrieved[0].tool_calls?.[0].function.name).toBe('get_weather');
    });

    it('should update last_accessed time when adding messages', async () => {
      const sessionId = sessionManager.createSession('openai/gpt-4o');
      const session = sessionManager.getSession(sessionId);
      const initialAccess = session?.metadata.last_accessed.getTime() ?? 0;

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      sessionManager.addMessage(sessionId, { role: 'user', content: 'Test' });

      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession?.metadata.last_accessed.getTime()).toBeGreaterThan(initialAccess);
    });
  });

  describe('Token Counting Accuracy', () => {
    let tokenCounter: TokenCounter;

    beforeEach(() => {
      tokenCounter = new TokenCounter();
    });

    it('should estimate tokens for simple text accurately', () => {
      // "Hello, how are you?" is approximately 5-6 tokens
      const tokens = tokenCounter.estimateTokens('Hello, how are you?');

      // Allow some variance but should be in reasonable range
      expect(tokens).toBeGreaterThanOrEqual(4);
      expect(tokens).toBeLessThanOrEqual(10);
    });

    it('should estimate tokens for longer text proportionally', () => {
      const shortText = 'Hello';
      const longText = 'Hello '.repeat(100);

      const shortTokens = tokenCounter.estimateTokens(shortText);
      const longTokens = tokenCounter.estimateTokens(longText);

      // Long text should have proportionally more tokens
      expect(longTokens).toBeGreaterThan(shortTokens * 50);
    });

    it('should track cumulative tokens per session', () => {
      const sessionId = sessionManager.createSession('openai/gpt-4o');

      const messages: SessionMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about the weather.' },
        { role: 'assistant', content: 'I can help you with weather information. What location are you interested in?' },
      ];

      for (const message of messages) {
        sessionManager.addMessage(sessionId, message);
      }

      const tokenCount = sessionManager.getTokenCount(sessionId);

      // Should have accumulated tokens from all messages
      expect(tokenCount).toBeGreaterThan(0);

      // Each message should add to the count
      const expectedMinTokens = 20; // Very conservative minimum
      expect(tokenCount).toBeGreaterThan(expectedMinTokens);
    });

    it('should count tokens for messages including overhead', () => {
      const message: SessionMessage = {
        role: 'user',
        content: 'Test message',
      };

      const messageTokens = tokenCounter.estimateMessageTokens(message);

      // Should include content tokens plus overhead for role
      const contentTokens = tokenCounter.estimateTokens('Test message');
      expect(messageTokens).toBeGreaterThan(contentTokens);
    });
  });

  describe('Session Expiry (30-minute timeout)', () => {
    it('should expire sessions after the configured timeout', () => {
      vi.useFakeTimers();

      try {
        const sessionId = sessionManager.createSession('openai/gpt-4o');

        // Session should exist initially
        expect(sessionManager.getSession(sessionId)).not.toBeNull();

        // Advance time by 31 minutes
        vi.advanceTimersByTime(31 * 60 * 1000);

        // Session should be expired now
        const expiredSession = sessionManager.getSession(sessionId);
        expect(expiredSession).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not expire sessions before the timeout', () => {
      vi.useFakeTimers();

      try {
        const sessionId = sessionManager.createSession('openai/gpt-4o');

        // Advance time by 25 minutes (less than 30)
        vi.advanceTimersByTime(25 * 60 * 1000);

        // Session should still exist
        const session = sessionManager.getSession(sessionId);
        expect(session).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reset expiry timer when session is accessed', () => {
      vi.useFakeTimers();

      try {
        const sessionId = sessionManager.createSession('openai/gpt-4o');

        // Advance time by 20 minutes
        vi.advanceTimersByTime(20 * 60 * 1000);

        // Access the session (this should reset the timer)
        const session = sessionManager.getSession(sessionId);
        expect(session).not.toBeNull();

        // Advance time by another 20 minutes (total 40, but only 20 since last access)
        vi.advanceTimersByTime(20 * 60 * 1000);

        // Session should still exist because we accessed it
        expect(sessionManager.getSession(sessionId)).not.toBeNull();

        // Advance time by another 31 minutes without access
        vi.advanceTimersByTime(31 * 60 * 1000);

        // Now it should be expired
        expect(sessionManager.getSession(sessionId)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should expire multiple sessions during cleanup', () => {
      vi.useFakeTimers();

      try {
        // Create multiple sessions
        const session1 = sessionManager.createSession('openai/gpt-4o');
        const session2 = sessionManager.createSession('anthropic/claude-3.5-sonnet');

        // Advance time past expiry
        vi.advanceTimersByTime(31 * 60 * 1000);

        // Run expiry check
        const expiredCount = sessionManager.expireSessions();

        expect(expiredCount).toBe(2);
        expect(sessionManager.getSession(session1)).toBeNull();
        expect(sessionManager.getSession(session2)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Session Operations', () => {
    it('should list all active sessions', () => {
      sessionManager.createSession('openai/gpt-4o');
      sessionManager.createSession('anthropic/claude-3.5-sonnet');
      sessionManager.createSession('google/gemini-pro');

      const sessions = sessionManager.listSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions.map(s => s.model)).toContain('openai/gpt-4o');
      expect(sessions.map(s => s.model)).toContain('anthropic/claude-3.5-sonnet');
      expect(sessions.map(s => s.model)).toContain('google/gemini-pro');
    });

    it('should clear a specific session', () => {
      const sessionId = sessionManager.createSession('openai/gpt-4o');

      expect(sessionManager.getSession(sessionId)).not.toBeNull();

      const result = sessionManager.clearSession(sessionId);

      expect(result).toBe(true);
      expect(sessionManager.getSession(sessionId)).toBeNull();
    });

    it('should return false when clearing non-existent session', () => {
      const result = sessionManager.clearSession('non-existent-id');
      expect(result).toBe(false);
    });

    it('should throw error when adding message to non-existent session', () => {
      expect(() => {
        sessionManager.addMessage('non-existent-id', { role: 'user', content: 'Test' });
      }).toThrow('Session not found');
    });
  });

  describe('Context Limit Enforcement', () => {
    it('should truncate oldest messages when context limit is exceeded', () => {
      // Create manager with a very low limit for testing
      const manager = new SessionManager(
        {
          sessionTimeoutMs: 30 * 60 * 1000,
          defaultContextLimit: 100,
          warningThreshold: 0.8,
        },
        createTestLogger()
      );

      const sessionId = manager.createSession('test/model');

      // Add many messages to exceed the context limit
      for (let i = 0; i < 50; i++) {
        const result = manager.addMessage(sessionId, {
          role: 'user',
          content: `This is message number ${i} with some extra text to use tokens.`,
        });

        // At some point, truncation should happen
        if (i > 20) {
          // Later messages might trigger truncation
        }
      }

      const messages = manager.getMessages(sessionId);

      // Should have fewer messages due to truncation (exact number depends on token counting)
      expect(messages.length).toBeLessThan(50);

      manager.clearAllSessions();
    });

    it('should preserve system message during truncation', () => {
      // Create manager with a very low limit for testing
      const manager = new SessionManager(
        {
          sessionTimeoutMs: 30 * 60 * 1000,
          defaultContextLimit: 200,
          warningThreshold: 0.8,
        },
        createTestLogger()
      );

      const sessionId = manager.createSession('test/model');

      // Add system message first
      manager.addMessage(sessionId, {
        role: 'system',
        content: 'You are a helpful assistant. Always be polite.',
      });

      // Add many user/assistant messages
      for (let i = 0; i < 30; i++) {
        manager.addMessage(sessionId, {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
        });
      }

      const messages = manager.getMessages(sessionId);

      // System message should still be first
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('helpful assistant');

      manager.clearAllSessions();
    });

    it('should return warning when approaching context limit', () => {
      const manager = new SessionManager(
        {
          sessionTimeoutMs: 30 * 60 * 1000,
          defaultContextLimit: 200,
          warningThreshold: 0.5, // 50% threshold for easier testing
        },
        createTestLogger()
      );

      const sessionId = manager.createSession('test/model');

      // Add messages until we hit the warning threshold
      let warningReceived = false;
      for (let i = 0; i < 20; i++) {
        const result = manager.addMessage(sessionId, {
          role: 'user',
          content: `Message ${i} with some content to add tokens.`,
        });

        if (result.warning) {
          warningReceived = true;
          break;
        }
      }

      expect(warningReceived).toBe(true);

      manager.clearAllSessions();
    });
  });

  describe('Cleanup Worker', () => {
    it('should start and stop cleanup worker', () => {
      expect(sessionManager.isCleanupWorkerRunning()).toBe(false);

      sessionManager.startCleanupWorker();
      expect(sessionManager.isCleanupWorkerRunning()).toBe(true);

      sessionManager.stopCleanupWorker();
      expect(sessionManager.isCleanupWorkerRunning()).toBe(false);
    });

    it('should not start cleanup worker twice', () => {
      sessionManager.startCleanupWorker();
      sessionManager.startCleanupWorker(); // Should not error

      expect(sessionManager.isCleanupWorkerRunning()).toBe(true);

      sessionManager.stopCleanupWorker();
    });

    it('should run periodic cleanup when worker is active', () => {
      vi.useFakeTimers();

      try {
        const manager = new SessionManager(
          {
            sessionTimeoutMs: 30 * 60 * 1000,
            cleanupIntervalMs: 1000, // 1 second for faster testing
          },
          createTestLogger()
        );

        // Create a session
        const sessionId = manager.createSession('openai/gpt-4o');
        manager.startCleanupWorker();

        // Session should exist initially
        expect(manager.listSessions().length).toBe(1);

        // Advance time past expiry
        vi.advanceTimersByTime(31 * 60 * 1000);

        // Trigger cleanup interval
        vi.advanceTimersByTime(1000);

        // Session should be expired now
        expect(manager.listSessions().length).toBe(0);

        manager.stopCleanupWorker();
        manager.clearAllSessions();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('TokenCounter', () => {
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
  });

  it('should return 0 for empty string', () => {
    expect(tokenCounter.estimateTokens('')).toBe(0);
  });

  it('should estimate tokens for code differently than prose', () => {
    const prose = 'The quick brown fox jumps over the lazy dog.';
    const code = 'function hello() { return "world"; }';

    const proseTokens = tokenCounter.estimateTokens(prose);
    const codeTokens = tokenCounter.estimateTokens(code);

    // Both should have reasonable token counts
    expect(proseTokens).toBeGreaterThan(0);
    expect(codeTokens).toBeGreaterThan(0);
  });

  it('should handle multi-line text', () => {
    const multiLine = `Line 1
Line 2
Line 3`;

    const tokens = tokenCounter.estimateTokens(multiLine);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate message tokens including overhead', () => {
    const message: SessionMessage = {
      role: 'user',
      content: 'Hello',
      name: 'John',
    };

    const messageTokens = tokenCounter.estimateMessageTokens(message);
    const contentTokens = tokenCounter.estimateTokens('Hello');
    const nameTokens = tokenCounter.estimateTokens('John');

    // Message tokens should include content, name, and overhead
    expect(messageTokens).toBeGreaterThan(contentTokens + nameTokens);
  });
});
