/**
 * Image Generation Tool for OpenRouter MCP Server.
 * Generates images using models like Gemini, Flux, and Stable Diffusion.
 */

import { OpenRouterClient } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ApiError } from '../../api/errors.js';
import { CostTracker } from '../../cost/CostTracker.js';
import { ImageGenerationInputSchema, ImageGenerationInput } from './schema.js';
import { handleImageGeneration } from './handler.js';

export * from './schema.js';
export * from './handler.js';

export const IMAGE_GENERATION_TOOL_NAME = 'openrouter_generate_image';

export interface CreateImageGenerationToolOptions {
  client: OpenRouterClient;
  costTracker?: CostTracker;
  logger: Logger;
}

import { ToolRegistration } from '../../server/OpenRouterServer.js';

/**
 * Tool definition for MCP server registration.
 */
export type ImageGenerationToolDefinition = ToolRegistration;

/**
 * Create the image generation tool for MCP server registration.
 */
export function createImageGenerationTool(
  options: CreateImageGenerationToolOptions
): ImageGenerationToolDefinition {
  const { client, costTracker, logger } = options;
  const toolLogger = logger.child('image-generation');

  return {
    name: IMAGE_GENERATION_TOOL_NAME,
    description: `Generate images using AI models through OpenRouter.

REQUIRED: Before calling this tool, you MUST first call openrouter_search_models or openrouter_list_models to discover current image generation model IDs. Do NOT guess or hardcode model IDs from memory - models are updated frequently and your knowledge of model IDs is likely outdated. Always use the latest models available.

Parameters:
- model (required): The image generation model ID. Get valid IDs from openrouter_search_models first.
- prompt (required): Text description of the desired image
- aspect_ratio (optional): Image aspect ratio (1:1, 16:9, 9:16, etc.)
- image_size (optional): Resolution (1K, 2K, 4K) - some models only

Returns generated images with metadata including base64 data URLs, MIME types, and token usage.`,
    inputSchema: ImageGenerationInputSchema,
    handler: async (args: unknown) => {
      // The Zod validation is done by the server before calling the handler
      const input = args as ImageGenerationInput;
      try {
        const result = await handleImageGeneration(input, {
          client,
          costTracker,
          logger: toolLogger,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: result.textResponse,
            },
          ],
          structuredContent: result.structuredResponse,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          const mcpError = error.toMcpError();
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error generating image: ${mcpError.message} (Code: ${mcpError.code})`,
              },
            ],
            structuredContent: {
              error: true,
              code: mcpError.code,
              message: mcpError.message,
            },
          };
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error generating image: ${errorMessage}`,
            },
          ],
          structuredContent: {
            error: true,
            message: errorMessage,
          },
        };
      }
    },
  };
}

export default createImageGenerationTool;
