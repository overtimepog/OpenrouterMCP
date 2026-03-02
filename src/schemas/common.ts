/**
 * Common Zod schemas and validation utilities for the OpenRouter MCP Server.
 */

import { z, ZodError, ZodIssue } from 'zod';

// ============================================================================
// Reusable Base Schemas
// ============================================================================

/**
 * Schema for a non-empty string
 */
export const nonEmptyString = z.string().min(1, 'String cannot be empty');

/**
 * Schema for positive integers
 */
export const positiveInteger = z.number().int().positive();

/**
 * Schema for non-negative numbers (including zero)
 */
export const nonNegativeNumber = z.number().min(0);

/**
 * Schema for temperature parameter (0 to 2)
 */
export const temperatureSchema = z.number().min(0).max(2);

/**
 * Schema for max tokens parameter
 */
export const maxTokensSchema = positiveInteger;

// ============================================================================
// Content Part Schemas
// ============================================================================

/**
 * Schema for a single content part (text or image_url)
 */
export const contentPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('image_url'),
    image_url: z.object({
      url: z.string(),
      detail: z.string().optional(),
    }),
  }),
]);

/**
 * Schema for message content — string or array of content parts
 */
export const messageContentSchema = z.union([z.string(), z.array(contentPartSchema)]);

// ============================================================================
// Message Schemas
// ============================================================================

/**
 * Schema for chat message roles
 */
export const messageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

/**
 * Schema for a single chat message
 */
export const messageSchema = z.object({
  role: messageRoleSchema,
  content: messageContentSchema,
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

/**
 * Schema for an array of chat messages
 */
export const messagesArraySchema = z.array(messageSchema).min(1, 'At least one message is required');

// ============================================================================
// Tool Calling Schemas
// ============================================================================

/**
 * Schema for function definition in tool calls
 */
export const functionDefinitionSchema = z.object({
  name: nonEmptyString,
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

/**
 * Schema for a tool definition (OpenAI-compatible)
 */
export const toolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: functionDefinitionSchema,
});

/**
 * Schema for tools array
 */
export const toolsArraySchema = z.array(toolDefinitionSchema);

/**
 * Schema for tool_choice parameter
 */
export const toolChoiceSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  z.literal('required'),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: nonEmptyString,
    }),
  }),
]);

// ============================================================================
// API Response Schemas
// ============================================================================

/**
 * Schema for model pricing information
 */
export const pricingSchema = z.object({
  prompt: z.string().optional(),
  completion: z.string().optional(),
});

/**
 * Schema for model information from OpenRouter API
 */
export const modelSchema = z.object({
  id: nonEmptyString,
  name: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().optional(),
  pricing: pricingSchema.optional(),
  top_provider: z.object({
    max_completion_tokens: z.number().optional(),
    is_moderated: z.boolean().optional(),
  }).optional(),
  architecture: z.object({
    modality: z.string().optional(),
    tokenizer: z.string().optional(),
    instruct_type: z.string().optional(),
  }).optional(),
});

// ============================================================================
// Error Formatting Utilities
// ============================================================================

/**
 * Format a single Zod issue into a human-readable message
 */
export function formatZodIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

/**
 * Format all Zod errors into a human-readable string
 */
export function formatZodError(error: ZodError): string {
  return error.issues.map(formatZodIssue).join('; ');
}

/**
 * Create a formatted validation error message
 */
export function createValidationErrorMessage(fieldName: string, error: ZodError): string {
  const formattedErrors = formatZodError(error);
  return `Validation failed for ${fieldName}: ${formattedErrors}`;
}

/**
 * Safely parse with Zod and return a result object
 */
export function safeParse<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: formatZodError(result.error) };
}

// ============================================================================
// Type Exports
// ============================================================================

export type ContentPart = z.infer<typeof contentPartSchema>;
export type MessageContent = z.infer<typeof messageContentSchema>;
export type MessageRole = z.infer<typeof messageRoleSchema>;
export type Message = z.infer<typeof messageSchema>;
export type FunctionDefinition = z.infer<typeof functionDefinitionSchema>;
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
export type ToolChoice = z.infer<typeof toolChoiceSchema>;
export type Pricing = z.infer<typeof pricingSchema>;
export type Model = z.infer<typeof modelSchema>;
