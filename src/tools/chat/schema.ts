/**
 * Zod schema for the openrouter_chat tool.
 * Defines input validation for chat completion requests.
 */

import { z } from 'zod';

/**
 * Schema for chat message roles
 */
export const MessageRoleEnum = z.enum(['system', 'user', 'assistant', 'tool']);

/**
 * Schema for a single chat message
 */
export const ChatMessageSchema = z.object({
  role: MessageRoleEnum,
  content: z.string(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Schema for function definition in tool calls
 */
export const FunctionDefinitionSchema = z.object({
  name: z.string().min(1, 'Function name is required'),
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

/**
 * Schema for a tool definition (OpenAI-compatible)
 */
export const ToolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: FunctionDefinitionSchema,
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

/**
 * Schema for tool_choice parameter
 */
export const ToolChoiceSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  z.literal('required'),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string().min(1),
    }),
  }),
]);

export type ToolChoice = z.infer<typeof ToolChoiceSchema>;

/**
 * Schema for response_format parameter
 */
export const ResponseFormatSchema = z.object({
  type: z.enum(['text', 'json_object']),
});

export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

/**
 * Input schema for the chat tool
 */
export const ChatInputSchema = z.object({
  /** Model ID to use for the chat completion (required) */
  model: z
    .string()
    .min(1, 'Model ID is required')
    .describe('The model ID to use for the chat completion (e.g., "openai/gpt-4")'),

  /** Array of messages for the conversation (required) */
  messages: z
    .array(ChatMessageSchema)
    .min(1, 'At least one message is required')
    .describe('Array of messages in the conversation'),

  /** Optional session ID to continue an existing session */
  session_id: z
    .string()
    .optional()
    .describe('Session ID to continue an existing conversation'),

  /** Whether to stream the response (default: true) */
  stream: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to stream the response (default: true)'),

  /** Temperature for response randomness (0-2) */
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional()
    .describe('Temperature for response randomness (0-2)'),

  /** Maximum tokens to generate */
  max_tokens: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of tokens to generate'),

  /** Array of tool definitions for function calling */
  tools: z
    .array(ToolDefinitionSchema)
    .optional()
    .describe('Array of OpenAI-compatible function definitions'),

  /** Tool choice parameter */
  tool_choice: ToolChoiceSchema
    .optional()
    .describe('How to select which tool to call (auto, none, required, or specific function)'),

  /** Response format specification */
  response_format: ResponseFormatSchema
    .optional()
    .describe('Structured output format specification'),
});

export type ChatInput = z.infer<typeof ChatInputSchema>;

/**
 * Tool call structure in the response
 */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Usage statistics in the response
 */
export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Rate limit status in the response
 */
export interface ChatRateLimitStatus {
  requestsRemaining?: number;
  requestsLimit?: number;
  tokensRemaining?: number;
  tokensLimit?: number;
  isApproachingLimit: boolean;
}

/**
 * Response structure for the chat tool
 */
export interface ChatResponse {
  /** The text content of the response */
  content: string | null;

  /** Tool calls requested by the model (if any) */
  tool_calls?: ChatToolCall[];

  /** Token usage statistics */
  usage?: ChatUsage;

  /** Session ID for continuing the conversation */
  session_id: string;

  /** Rate limit status */
  rate_limit_status?: ChatRateLimitStatus;

  /** Finish reason from the model */
  finish_reason?: string | null;

  /** Model ID used */
  model: string;
}

/**
 * Streaming chunk structure
 */
export interface StreamingChunk {
  /** Chunk index */
  index: number;

  /** Delta content for this chunk */
  delta: {
    content?: string;
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

  /** Finish reason (only in final chunk) */
  finish_reason?: string | null;
}

export default ChatInputSchema;
