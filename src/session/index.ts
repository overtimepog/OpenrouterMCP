/**
 * Session management module exports.
 */

export { SessionManager, sessionManager } from './SessionManager.js';
export { TokenCounter, tokenCounter } from './TokenCounter.js';
export {
  getModelContextLimit,
  getContextLimitConfig,
  isApproachingLimit,
  exceedsLimit,
  getRemainingTokens,
  getContextUsagePercent,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_WARNING_THRESHOLD,
} from './ContextLimits.js';
export type {
  Session,
  SessionMessage,
  SessionMetadata,
  SessionSummary,
  SessionManagerConfig,
  AddMessageResult,
  ContextLimit,
  ToolCall,
} from './types.js';
