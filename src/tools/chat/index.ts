/**
 * Chat Tool - Entry Point
 * Exports the tool registration for the MCP server.
 */

export {
  ChatInputSchema,
  type ChatInput,
  type ChatMessage,
  type ChatResponse,
  type ChatToolCall,
  type ChatUsage,
  type ChatRateLimitStatus,
  type StreamingChunk,
  type ToolDefinition,
  type ToolChoice,
  type ResponseFormat,
} from './schema.js';
export { createChatHandler, type ChatHandlerConfig } from './handler.js';
export { handleNonStreamingChat, toRateLimitStatus, extractToolCalls, toSessionMessages } from './nonStreaming.js';
export { handleStreamingChat, parseSSEStream, accumulateChunks } from './streaming.js';

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ToolRegistration, ToolResponse } from '../../server/OpenRouterServer.js';
import { SessionManager } from '../../session/SessionManager.js';
import { CostTracker } from '../../cost/CostTracker.js';
import { ChatInputSchema, ChatInput } from './schema.js';
import { createChatHandler } from './handler.js';

/**
 * Tool name constant
 */
export const CHAT_TOOL_NAME = 'openrouter_chat';

/**
 * Tool description
 */
export const CHAT_TOOL_DESCRIPTION = `Chat with any AI model available through OpenRouter.
Supports streaming responses, multi-turn conversations via sessions, function/tool calling, multimodal/vision input, and structured outputs.

REQUIRED: Before calling this tool, you MUST first call openrouter_search_models or openrouter_list_models to discover current model IDs. Do NOT guess or hardcode model IDs from memory - models are updated frequently and your knowledge of model IDs is likely outdated. Always use the latest models available for the best results.

If the user specifies exact model IDs, use those. Otherwise, search for the latest/best model for the task.

Simplified usage (convenience params):
- role: System prompt (e.g. "You are a helpful assistant")
- message: User message string or content parts array (text + images)
These replace the need to construct a full messages array for simple requests.

Full parameters:
- model: The model ID (format: "provider/model-name"). Get valid IDs from openrouter_search_models or openrouter_list_models first.
- messages: Array of messages with role (system/user/assistant/tool) and content (string or content parts array for multimodal)
- session_id: Optional - continue an existing conversation
- stream: Whether to stream the response (default: true)
- temperature: Response randomness 0-2 (optional)
- max_tokens / max_completion_tokens: Maximum tokens to generate (optional)
- tools: OpenAI-compatible function definitions for tool calling (optional)
- tool_choice: How to select tools - auto/none/required/specific (optional)
- response_format: Output format - text, json_object, or json_schema with enforced schema (optional)
- verbosity: Constrain response verbosity - low/medium/high/max (optional)
- logprobs / top_logprobs: Return token log probabilities (optional)
- logit_bias: Bias specific tokens (optional)
- user: End-user identifier (optional)
- debug: Debug options like echo_upstream_body (optional)

Multimodal/Vision: Message content can be an array of content parts [{type:"text",text:"..."},{type:"image_url",image_url:{url:"..."}}]. Vision validation is automatic - non-vision models will be rejected before spending credits.

Returns: content, tool_calls, usage, session_id, logprobs`;

/**
 * Create the chat tool registration for the MCP server
 */
export function createChatTool(config: {
  client: OpenRouterClient;
  sessionManager: SessionManager;
  costTracker?: CostTracker;
  logger: Logger;
}): ToolRegistration {
  const { client, sessionManager, costTracker, logger } = config;

  const innerHandler = createChatHandler({
    client,
    sessionManager,
    costTracker,
    logger: logger.child('chat'),
  });

  // Wrap the handler to accept unknown input and validate/cast appropriately
  const handler = async (args: unknown): Promise<ToolResponse> => {
    // The Zod validation is done by the server before calling the handler,
    // so we can safely cast args to the expected type
    return innerHandler(args as ChatInput);
  };

  return {
    name: CHAT_TOOL_NAME,
    description: CHAT_TOOL_DESCRIPTION,
    inputSchema: ChatInputSchema,
    handler,
  };
}

export default createChatTool;
