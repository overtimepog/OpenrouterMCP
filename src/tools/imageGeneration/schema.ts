/**
 * Zod schema for the openrouter_generate_image tool.
 * Defines input validation for image generation requests.
 *
 * OpenRouter uses the /chat/completions endpoint with modalities: ["image", "text"]
 * for image generation with models like Gemini, Flux, etc.
 */

import { z } from 'zod';

/**
 * Supported aspect ratios for image generation (Gemini models)
 * Maps to actual pixel dimensions:
 * - 1:1 → 1024×1024 (default)
 * - 2:3 → 832×1248
 * - 3:2 → 1248×832
 * - 3:4 → 864×1184
 * - 4:3 → 1184×864
 * - 4:5 → 896×1152
 * - 5:4 → 1152×896
 * - 9:16 → 768×1344
 * - 16:9 → 1344×768
 * - 21:9 → 1536×672
 */
export const AspectRatioEnum = z.enum([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
]);

export type AspectRatio = z.infer<typeof AspectRatioEnum>;

/**
 * Image size/resolution options (Gemini models only)
 */
export const ImageSizeEnum = z.enum(['1K', '2K', '4K']);

export type ImageSize = z.infer<typeof ImageSizeEnum>;

/**
 * Input schema for the image generation tool
 */
export const ImageGenerationInputSchema = z.object({
  /** Model ID for image generation (required) */
  model: z
    .string()
    .min(1, 'Model ID is required')
    .describe(
      'The model ID to use for image generation. Use openrouter_search_models to find current image-capable models. ' +
      'Common providers: google (Gemini image models), black-forest-labs (Flux models), openai (GPT image models). ' +
      'Always use the EXACT model ID specified by the user or discovered via search.'
    ),

  /** Text prompt describing the image to generate (required) */
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(4000, 'Prompt must be 4000 characters or less')
    .describe('A detailed text description of the desired image'),

  /** Aspect ratio for the generated image (optional, Gemini models) */
  aspect_ratio: AspectRatioEnum
    .optional()
    .describe(
      'Aspect ratio for generated image. Supported: "1:1" (default), "2:3", "3:2", ' +
      '"3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9". Primarily for Gemini models.'
    ),

  /** Image size/resolution (optional, Gemini models only) */
  image_size: ImageSizeEnum
    .optional()
    .describe('Resolution of generated image: "1K" (default), "2K", or "4K". Gemini models only.'),

  /** Optional path to save the generated image(s) */
  save_path: z
    .string()
    .optional()
    .describe(
      'Optional file path to save the generated image. If multiple images are generated, ' +
      'they will be saved with numbered suffixes (e.g., "image_1.png", "image_2.png"). ' +
      'The directory must exist. Supports .png, .jpg, .jpeg, .webp extensions.'
    ),
});

export type ImageGenerationInput = z.infer<typeof ImageGenerationInputSchema>;

/**
 * Single generated image in response
 */
export interface GeneratedImageInfo {
  /** Index of this image (0-based) */
  index: number;

  /** Base64 data URL of the generated image (data:image/png;base64,...) */
  data_url: string;

  /** MIME type of the image */
  mime_type: string;

  /** Whether the URL is base64 encoded */
  is_base64: boolean;

  /** Path where the image was saved (if save_path was provided) */
  saved_to?: string;
}

/**
 * Response structure for the image generation tool
 */
export interface ImageGenerationResponse {
  /** Array of generated images */
  images: GeneratedImageInfo[];

  /** Model used for generation */
  model: string;

  /** Original prompt */
  prompt: string;

  /** Text response from the model (if any) */
  text_response?: string;

  /** Total number of images generated */
  count: number;

  /** Generation parameters used */
  parameters: {
    aspect_ratio?: string;
    image_size?: string;
  };

  /** Token usage (if available) */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export default ImageGenerationInputSchema;
