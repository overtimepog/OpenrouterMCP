/**
 * Handler for the openrouter_generate_image tool.
 * Generates images using OpenRouter's chat/completions endpoint with modalities.
 */

import { OpenRouterClient, ImageGenerationRequest, ContentPart } from '../../api/OpenRouterClient.js';
import { Logger } from '../../utils/logger.js';
import { ApiError } from '../../api/errors.js';
import { CostTracker } from '../../cost/CostTracker.js';
import {
  ImageGenerationInput,
  ImageGenerationResponse,
  GeneratedImageInfo,
} from './schema.js';

export interface ImageGenerationHandlerDeps {
  client: OpenRouterClient;
  costTracker?: CostTracker;
  logger: Logger;
}

/**
 * Extract image URLs from the content array.
 * OpenRouter returns images in message.content as an array of content parts.
 * Each image is: { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
 */
function extractImagesFromContent(content: ContentPart[] | string | null | undefined): string[] {
  if (!content || typeof content === 'string') {
    return [];
  }

  const imageUrls: string[] = [];

  for (const part of content) {
    if (part.type === 'image_url' && part.image_url?.url) {
      imageUrls.push(part.image_url.url);
    }
  }

  return imageUrls;
}

/**
 * Extract text content from the content array.
 */
function extractTextFromContent(content: ContentPart[] | string | null | undefined): string | undefined {
  if (!content) {
    return undefined;
  }

  if (typeof content === 'string') {
    return content;
  }

  const textParts: string[] = [];

  for (const part of content) {
    if (part.type === 'text' && part.text) {
      textParts.push(part.text);
    }
  }

  return textParts.length > 0 ? textParts.join('\n') : undefined;
}

/**
 * Parse MIME type from a base64 data URL.
 */
function parseMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match && match[1] ? match[1] : 'image/png';
}

/**
 * Check if a URL is a base64 data URL.
 */
function isBase64DataUrl(url: string): boolean {
  return url.startsWith('data:') && url.includes('base64');
}

/**
 * Format the text response for display.
 */
function formatTextResponse(response: ImageGenerationResponse): string {
  const lines: string[] = [];

  lines.push(`## Image Generation Complete`);
  lines.push('');
  lines.push(`**Model:** ${response.model}`);
  lines.push(`**Prompt:** ${response.prompt}`);
  lines.push(`**Images Generated:** ${response.count}`);

  if (response.parameters.aspect_ratio) {
    lines.push(`**Aspect Ratio:** ${response.parameters.aspect_ratio}`);
  }
  if (response.parameters.image_size) {
    lines.push(`**Resolution:** ${response.parameters.image_size}`);
  }

  if (response.text_response) {
    lines.push('');
    lines.push(`**Model Response:** ${response.text_response}`);
  }

  lines.push('');
  lines.push('### Generated Images');
  lines.push('');

  for (const image of response.images) {
    lines.push(`**Image ${image.index + 1}:**`);
    lines.push(`- Format: ${image.mime_type}`);
    lines.push(`- Type: ${image.is_base64 ? 'Base64 Data URL' : 'URL'}`);
    // Truncate the data URL for display
    const displayUrl = image.data_url.length > 100
      ? `${image.data_url.substring(0, 100)}...`
      : image.data_url;
    lines.push(`- Data: ${displayUrl}`);
    lines.push('');
  }

  if (response.usage) {
    lines.push('### Token Usage');
    lines.push(`- Prompt tokens: ${response.usage.prompt_tokens}`);
    lines.push(`- Completion tokens: ${response.usage.completion_tokens}`);
    lines.push(`- Total tokens: ${response.usage.total_tokens}`);
  }

  return lines.join('\n');
}

/**
 * Handle image generation request.
 */
export async function handleImageGeneration(
  input: ImageGenerationInput,
  deps: ImageGenerationHandlerDeps
): Promise<{
  textResponse: string;
  structuredResponse: ImageGenerationResponse;
}> {
  const { client, costTracker, logger } = deps;

  logger.debug('Processing image generation request', {
    model: input.model,
    promptLength: input.prompt.length,
    aspectRatio: input.aspect_ratio,
    imageSize: input.image_size,
  });

  // Build the image generation request
  const imageConfig: ImageGenerationRequest['image_config'] = {};
  if (input.aspect_ratio) {
    imageConfig.aspect_ratio = input.aspect_ratio;
  }
  if (input.image_size) {
    imageConfig.image_size = input.image_size;
  }

  try {
    // Build request with correct content format (array of content parts)
    const request: ImageGenerationRequest = {
      model: input.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: input.prompt,
            },
          ],
        },
      ],
      modalities: ['text', 'image'], // Order matters: text first, then image
    };

    if (Object.keys(imageConfig).length > 0) {
      request.image_config = imageConfig;
    }

    const apiResponse = await client.createImageGeneration(request);

    const data = apiResponse.data;

    // Extract images from response content array
    const images: GeneratedImageInfo[] = [];
    let textContent: string | undefined;

    if (data.choices && data.choices.length > 0 && data.choices[0]) {
      const message = data.choices[0].message;

      // Extract text content from content array
      textContent = extractTextFromContent(message.content);

      // Extract images from content array (images are ContentPart objects with type: "image_url")
      const imageUrls = extractImagesFromContent(message.content);
      imageUrls.forEach((imageUrl, index) => {
        images.push({
          index,
          data_url: imageUrl,
          mime_type: parseMimeType(imageUrl),
          is_base64: isBase64DataUrl(imageUrl),
        });
      });
    }

    // Build response
    const response: ImageGenerationResponse = {
      images,
      model: input.model,
      prompt: input.prompt,
      text_response: textContent,
      count: images.length,
      parameters: {
        aspect_ratio: input.aspect_ratio,
        image_size: input.image_size,
      },
      usage: data.usage,
    };

    logger.info('Image generation completed', {
      model: input.model,
      imageCount: images.length,
    });

    // Record cost if cost tracker is available and usage data exists
    if (costTracker && data.usage) {
      costTracker.recordCost({
        model: input.model,
        operation: 'image',
        usage: {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
          cost: (data.usage as { cost?: number }).cost,
        },
      });
    }

    return {
      textResponse: formatTextResponse(response),
      structuredResponse: response,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      logger.error('API error during image generation', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error during image generation', {
      error: errorMessage,
    });
    throw error;
  }
}

export default handleImageGeneration;
