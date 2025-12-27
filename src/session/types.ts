/**
 * Type definitions for session management.
 */

import { Message } from '../schemas/common.js';

/**
 * Represents a tool call made by an AI model
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Extended message type that includes optional tool calls
 */
export interface SessionMessage extends Message {
  tool_calls?: ToolCall[];
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  created_at: Date;
  last_accessed: Date;
  model: string;
}

/**
 * Represents a conversation session
 */
export interface Session {
  id: string;
  metadata: SessionMetadata;
  messages: SessionMessage[];
  tokenCount: number;
}

/**
 * Summary of a session for listing purposes
 */
export interface SessionSummary {
  id: string;
  model: string;
  messageCount: number;
  tokenCount: number;
  created_at: Date;
  last_accessed: Date;
}

/**
 * Context limits for different models
 */
export interface ContextLimit {
  maxTokens: number;
  warningThreshold: number; // Typically 0.8 (80%)
}

/**
 * Result of adding a message that may trigger truncation
 */
export interface AddMessageResult {
  truncated: boolean;
  messagesRemoved: number;
  tokensRemoved: number;
  warning?: string;
}

/**
 * Configuration for the session manager
 */
export interface SessionManagerConfig {
  /** Session timeout in milliseconds (default: 30 minutes) */
  sessionTimeoutMs?: number;
  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;
  /** Default context limit for unknown models */
  defaultContextLimit?: number;
  /** Warning threshold as a fraction (default: 0.8) */
  warningThreshold?: number;
}
