/**
 * Tests for the Image Generation Tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageGenerationInputSchema, AspectRatioEnum, ImageSizeEnum } from '../../src/tools/imageGeneration/schema.js';
import { handleImageGeneration } from '../../src/tools/imageGeneration/handler.js';
import { createImageGenerationTool, IMAGE_GENERATION_TOOL_NAME } from '../../src/tools/imageGeneration/index.js';
import { OpenRouterClient } from '../../src/api/OpenRouterClient.js';
import { ApiError, ErrorCode } from '../../src/api/errors.js';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

// Mock client
const createMockClient = () => ({
  createImageGeneration: vi.fn(),
});

describe('Image Generation Tool', () => {
  describe('Input Schema Validation', () => {
    it('should validate required model field', () => {
      const result = ImageGenerationInputSchema.safeParse({
        prompt: 'A beautiful sunset',
      });
      expect(result.success).toBe(false);
    });

    it('should validate required prompt field', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid minimal input', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'A beautiful sunset over mountains',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.model).toBe('google/gemini-2.5-flash-image-preview');
        expect(result.data.prompt).toBe('A beautiful sunset over mountains');
      }
    });

    it('should accept valid aspect ratio', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'A sunset',
        aspect_ratio: '16:9',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.aspect_ratio).toBe('16:9');
      }
    });

    it('should reject invalid aspect ratio', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'A sunset',
        aspect_ratio: '5:3',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid image size', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'A sunset',
        image_size: '4K',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.image_size).toBe('4K');
      }
    });

    it('should reject invalid image size', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'A sunset',
        image_size: '8K',
      });
      expect(result.success).toBe(false);
    });

    it('should reject prompt longer than 4000 characters', () => {
      const result = ImageGenerationInputSchema.safeParse({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'a'.repeat(4001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid aspect ratios', () => {
      const validRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
      for (const ratio of validRatios) {
        const result = AspectRatioEnum.safeParse(ratio);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid image sizes', () => {
      const validSizes = ['1K', '2K', '4K'];
      for (const size of validSizes) {
        const result = ImageSizeEnum.safeParse(size);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Handler', () => {
    let mockClient: ReturnType<typeof createMockClient>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      mockClient = createMockClient();
      mockLogger = createMockLogger();
    });

    it('should handle successful image generation', async () => {
      // API returns images in message.content array, not in a separate images field
      const mockResponse = {
        data: {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: 'Here is your image',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
                    },
                  },
                ],
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      };

      mockClient.createImageGeneration.mockResolvedValue(mockResponse);

      const result = await handleImageGeneration(
        {
          model: 'google/gemini-2.5-flash-image-preview',
          prompt: 'A beautiful sunset',
        },
        {
          client: mockClient as unknown as OpenRouterClient,
          logger: mockLogger,
        }
      );

      expect(result.structuredResponse.images.length).toBe(1);
      expect(result.structuredResponse.model).toBe('google/gemini-2.5-flash-image-preview');
      expect(result.structuredResponse.prompt).toBe('A beautiful sunset');
      expect(result.structuredResponse.text_response).toBe('Here is your image');
      expect(result.structuredResponse.count).toBe(1);
      expect(result.structuredResponse.images[0].data_url).toContain('data:image/png;base64,');
      expect(result.structuredResponse.images[0].mime_type).toBe('image/png');
      expect(result.structuredResponse.images[0].is_base64).toBe(true);
    });

    it('should handle content as array format', async () => {
      // API returns images in message.content array as image_url content parts
      const mockResponse = {
        data: {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg',
                    },
                  },
                ],
              },
              finish_reason: 'stop',
            },
          ],
        },
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      };

      mockClient.createImageGeneration.mockResolvedValue(mockResponse);

      const result = await handleImageGeneration(
        {
          model: 'black-forest-labs/flux.2-pro',
          prompt: 'A mountain landscape',
        },
        {
          client: mockClient as unknown as OpenRouterClient,
          logger: mockLogger,
        }
      );

      expect(result.structuredResponse.images.length).toBe(1);
      expect(result.structuredResponse.images[0].mime_type).toBe('image/jpeg');
    });

    it('should pass aspect_ratio and image_size to API', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,test',
                    },
                  },
                ],
              },
            },
          ],
        },
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      };

      mockClient.createImageGeneration.mockResolvedValue(mockResponse);

      await handleImageGeneration(
        {
          model: 'google/gemini-2.5-flash-image-preview',
          prompt: 'A sunset',
          aspect_ratio: '16:9',
          image_size: '4K',
        },
        {
          client: mockClient as unknown as OpenRouterClient,
          logger: mockLogger,
        }
      );

      // Request now uses content as array of content parts, and modalities order is ["text", "image"]
      expect(mockClient.createImageGeneration).toHaveBeenCalledWith({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'A sunset' }] }],
        modalities: ['text', 'image'],
        image_config: {
          aspect_ratio: '16:9',
          image_size: '4K',
        },
      });
    });

    it('should handle API errors', async () => {
      const apiError = new ApiError({
        code: ErrorCode.MODEL_NOT_FOUND,
        message: 'Model not found',
      });

      mockClient.createImageGeneration.mockRejectedValue(apiError);

      await expect(
        handleImageGeneration(
          {
            model: 'invalid/model',
            prompt: 'A sunset',
          },
          {
            client: mockClient as unknown as OpenRouterClient,
            logger: mockLogger,
          }
        )
      ).rejects.toThrow(ApiError);
    });

    it('should handle content with only text (no images generated)', async () => {
      // When image generation fails, API might return only text content
      const mockResponse = {
        data: {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: 'Could not generate image',
                  },
                ],
              },
            },
          ],
        },
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      };

      mockClient.createImageGeneration.mockResolvedValue(mockResponse);

      const result = await handleImageGeneration(
        {
          model: 'google/gemini-2.5-flash-image-preview',
          prompt: 'A sunset',
        },
        {
          client: mockClient as unknown as OpenRouterClient,
          logger: mockLogger,
        }
      );

      expect(result.structuredResponse.images.length).toBe(0);
      expect(result.structuredResponse.count).toBe(0);
      expect(result.structuredResponse.text_response).toBe('Could not generate image');
    });

    it('should handle multiple images in content array', async () => {
      // API can return multiple images in the content array
      const mockResponse = {
        data: {
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: [
                  { type: 'text', text: 'Here are your images' },
                  { type: 'image_url', image_url: { url: 'data:image/png;base64,image1' } },
                  { type: 'image_url', image_url: { url: 'data:image/png;base64,image2' } },
                  { type: 'image_url', image_url: { url: 'data:image/png;base64,image3' } },
                ],
              },
            },
          ],
        },
        rateLimits: null,
        throttleStatus: { isThrottled: false },
        cached: false,
      };

      mockClient.createImageGeneration.mockResolvedValue(mockResponse);

      const result = await handleImageGeneration(
        {
          model: 'google/gemini-2.5-flash-image-preview',
          prompt: 'A sunset',
        },
        {
          client: mockClient as unknown as OpenRouterClient,
          logger: mockLogger,
        }
      );

      expect(result.structuredResponse.images.length).toBe(3);
      expect(result.structuredResponse.count).toBe(3);
    });
  });

  describe('Tool Creation', () => {
    it('should create tool with correct name', () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      const tool = createImageGenerationTool({
        client: mockClient as unknown as OpenRouterClient,
        logger: mockLogger,
      });

      expect(tool.name).toBe(IMAGE_GENERATION_TOOL_NAME);
      expect(tool.name).toBe('openrouter_generate_image');
    });

    it('should have description mentioning supported models', () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      const tool = createImageGenerationTool({
        client: mockClient as unknown as OpenRouterClient,
        logger: mockLogger,
      });

      expect(tool.description).toContain('image');
      expect(tool.description).toContain('openrouter_search_models');
      expect(tool.description).toContain('aspect_ratio');
      expect(tool.description).toContain('image_size');
    });

    it('should have input schema', () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      const tool = createImageGenerationTool({
        client: mockClient as unknown as OpenRouterClient,
        logger: mockLogger,
      });

      expect(tool.inputSchema).toBeDefined();
    });

    it('should handle errors gracefully in tool handler', async () => {
      const mockClient = createMockClient();
      const mockLogger = createMockLogger();

      mockClient.createImageGeneration.mockRejectedValue(
        new ApiError({
          code: ErrorCode.AUTH_INVALID_KEY,
          message: 'Invalid API key',
        })
      );

      const tool = createImageGenerationTool({
        client: mockClient as unknown as OpenRouterClient,
        logger: mockLogger,
      });

      const result = await tool.handler({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'A sunset',
      });

      expect(result.content[0].text).toContain('Error generating image');
      expect(result.structuredContent).toHaveProperty('error', true);
    });
  });
});
