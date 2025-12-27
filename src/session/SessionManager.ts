/**
 * Session Manager for conversation tracking and context management.
 * Provides in-memory storage for multi-turn conversations with automatic
 * session expiry and token-based context limit enforcement.
 */

import { randomUUID } from 'crypto';
import {
  Session,
  SessionMessage,
  SessionSummary,
  SessionManagerConfig,
  AddMessageResult,
  ContextLimit,
} from './types.js';
import { TokenCounter } from './TokenCounter.js';
import {
  getContextLimitConfig,
  isApproachingLimit,
  exceedsLimit,
  getContextUsagePercent,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_WARNING_THRESHOLD,
} from './ContextLimits.js';
import { Logger, logger as defaultLogger } from '../utils/logger.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<SessionManagerConfig> = {
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 5 * 60 * 1000,  // 5 minutes
  defaultContextLimit: DEFAULT_CONTEXT_LIMIT,
  warningThreshold: DEFAULT_WARNING_THRESHOLD,
};

export class SessionManager {
  private readonly sessions: Map<string, Session> = new Map();
  private readonly config: Required<SessionManagerConfig>;
  private readonly tokenCounter: TokenCounter;
  private readonly logger: Logger;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: SessionManagerConfig = {},
    logger?: Logger
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenCounter = new TokenCounter();
    this.logger = logger ?? defaultLogger.child('session');
  }

  /**
   * Generate a unique session ID using UUID v4
   */
  private generateSessionId(): string {
    return randomUUID();
  }

  /**
   * Create a new session for a given model
   */
  createSession(model: string): string {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: Session = {
      id: sessionId,
      metadata: {
        created_at: now,
        last_accessed: now,
        model,
      },
      messages: [],
      tokenCount: 0,
    };

    this.sessions.set(sessionId, session);

    this.logger.info('Session created', {
      sessionId,
      model,
    });

    return sessionId;
  }

  /**
   * Get a session by ID
   * Returns null if session doesn't exist or has expired
   */
  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const timeSinceAccess = now.getTime() - session.metadata.last_accessed.getTime();

    if (timeSinceAccess > this.config.sessionTimeoutMs) {
      this.logger.info('Session expired during access', {
        sessionId,
        inactiveMs: timeSinceAccess,
      });
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last accessed time
    session.metadata.last_accessed = now;

    return session;
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionSummary[] {
    const summaries: SessionSummary[] = [];
    const now = new Date();

    for (const session of this.sessions.values()) {
      const timeSinceAccess = now.getTime() - session.metadata.last_accessed.getTime();

      // Skip expired sessions
      if (timeSinceAccess > this.config.sessionTimeoutMs) {
        continue;
      }

      summaries.push({
        id: session.id,
        model: session.metadata.model,
        messageCount: session.messages.length,
        tokenCount: session.tokenCount,
        created_at: session.metadata.created_at,
        last_accessed: session.metadata.last_accessed,
      });
    }

    return summaries;
  }

  /**
   * Clear (delete) a session
   */
  clearSession(sessionId: string): boolean {
    const existed = this.sessions.has(sessionId);

    if (existed) {
      this.sessions.delete(sessionId);
      this.logger.info('Session cleared', { sessionId });
    }

    return existed;
  }

  /**
   * Expire all inactive sessions
   * Returns the number of sessions expired
   */
  expireSessions(): number {
    const now = new Date();
    let expiredCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceAccess = now.getTime() - session.metadata.last_accessed.getTime();

      if (timeSinceAccess > this.config.sessionTimeoutMs) {
        this.sessions.delete(sessionId);
        expiredCount++;

        this.logger.info('Session expired', {
          sessionId,
          model: session.metadata.model,
          messageCount: session.messages.length,
          inactiveMs: timeSinceAccess,
        });
      }
    }

    if (expiredCount > 0) {
      this.logger.info('Session cleanup completed', {
        expiredCount,
        remainingSessions: this.sessions.size,
      });
    }

    return expiredCount;
  }

  /**
   * Get the context limit for a session's model
   * Uses the configured default for unknown models
   */
  private getSessionContextLimit(model: string): ContextLimit {
    return getContextLimitConfig(
      model,
      this.config.warningThreshold,
      this.config.defaultContextLimit
    );
  }

  /**
   * Add a message to a session with context limit enforcement
   */
  addMessage(sessionId: string, message: SessionMessage): AddMessageResult {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const contextLimit = this.getSessionContextLimit(session.metadata.model);

    // Calculate tokens for new message
    const messageTokens = this.tokenCounter.estimateMessageTokens(message);

    // Add the message
    session.messages.push(message);
    session.tokenCount += messageTokens;

    // Check if we need to truncate
    const result = this.enforceContextLimit(session, contextLimit);

    // Check for warning threshold
    if (isApproachingLimit(session.tokenCount, contextLimit) && !result.truncated) {
      const usagePercent = getContextUsagePercent(session.tokenCount, contextLimit);
      result.warning = `Context usage at ${usagePercent.toFixed(1)}% (${session.tokenCount}/${contextLimit.maxTokens} tokens)`;

      this.logger.warn('Approaching context limit', {
        sessionId,
        model: session.metadata.model,
        tokenCount: session.tokenCount,
        maxTokens: contextLimit.maxTokens,
        usagePercent,
      });
    }

    return result;
  }

  /**
   * Get all messages from a session
   */
  getMessages(sessionId: string): SessionMessage[] {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return [...session.messages];
  }

  /**
   * Get the token count for a session
   */
  getTokenCount(sessionId: string): number {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session.tokenCount;
  }

  /**
   * Enforce context limit by truncating oldest messages
   * Preserves system messages during truncation
   */
  private enforceContextLimit(
    session: Session,
    contextLimit: ContextLimit
  ): AddMessageResult {
    const result: AddMessageResult = {
      truncated: false,
      messagesRemoved: 0,
      tokensRemoved: 0,
    };

    if (!exceedsLimit(session.tokenCount, contextLimit)) {
      return result;
    }

    result.truncated = true;

    // Find system message(s) to preserve
    const systemMessages: SessionMessage[] = [];
    const nonSystemMessages: SessionMessage[] = [];

    for (const message of session.messages) {
      if (message.role === 'system') {
        systemMessages.push(message);
      } else {
        nonSystemMessages.push(message);
      }
    }

    // Calculate tokens for system messages
    let systemTokens = 0;
    for (const msg of systemMessages) {
      systemTokens += this.tokenCounter.estimateMessageTokens(msg);
    }

    // Target token count (leave some buffer)
    const targetTokens = Math.floor(contextLimit.maxTokens * 0.9);
    const availableTokens = targetTokens - systemTokens;

    // Remove oldest non-system messages until we're under the limit
    const keptMessages: SessionMessage[] = [];
    let keptTokens = systemTokens;

    // Work backwards from newest to oldest to keep most recent messages
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      if (msg) {
        const msgTokens = this.tokenCounter.estimateMessageTokens(msg);

        if (keptTokens + msgTokens <= availableTokens) {
          keptMessages.unshift(msg);
          keptTokens += msgTokens;
        } else {
          result.messagesRemoved++;
          result.tokensRemoved += msgTokens;
        }
      }
    }

    // Reconstruct messages with system messages first
    session.messages = [...systemMessages, ...keptMessages];
    session.tokenCount = keptTokens;

    if (result.messagesRemoved > 0) {
      const usagePercent = getContextUsagePercent(session.tokenCount, contextLimit);
      result.warning = `Truncated ${result.messagesRemoved} messages (${result.tokensRemoved} tokens) to fit context limit. Current usage: ${usagePercent.toFixed(1)}%`;

      this.logger.warn('Context limit enforced - messages truncated', {
        sessionId: session.id,
        model: session.metadata.model,
        messagesRemoved: result.messagesRemoved,
        tokensRemoved: result.tokensRemoved,
        remainingMessages: session.messages.length,
        remainingTokens: session.tokenCount,
      });
    }

    return result;
  }

  /**
   * Start the periodic cleanup worker
   */
  startCleanupWorker(): void {
    if (this.cleanupIntervalId) {
      this.logger.warn('Cleanup worker already running');
      return;
    }

    this.cleanupIntervalId = setInterval(() => {
      this.expireSessions();
    }, this.config.cleanupIntervalMs);

    this.logger.info('Session cleanup worker started', {
      intervalMs: this.config.cleanupIntervalMs,
      timeoutMs: this.config.sessionTimeoutMs,
    });
  }

  /**
   * Stop the periodic cleanup worker
   */
  stopCleanupWorker(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      this.logger.info('Session cleanup worker stopped');
    }
  }

  /**
   * Check if cleanup worker is running
   */
  isCleanupWorkerRunning(): boolean {
    return this.cleanupIntervalId !== null;
  }

  /**
   * Get the total number of active sessions
   */
  getActiveSessionCount(): number {
    // Trigger expiry check and return accurate count
    this.expireSessions();
    return this.sessions.size;
  }

  /**
   * Clear all sessions (useful for testing or shutdown)
   */
  clearAllSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.logger.info('All sessions cleared', { count });
  }

  /**
   * Get the token counter instance
   */
  getTokenCounter(): TokenCounter {
    return this.tokenCounter;
  }

  /**
   * Recalculate the token count for a session
   * Useful if messages have been modified externally
   */
  recalculateTokenCount(sessionId: string): number {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.tokenCount = this.tokenCounter.estimateMessagesTokens(session.messages);
    return session.tokenCount;
  }

  /**
   * Get the configuration for this session manager
   */
  getConfig(): Required<SessionManagerConfig> {
    return { ...this.config };
  }
}

// Export a singleton instance for convenience
export const sessionManager = new SessionManager();

export default SessionManager;
