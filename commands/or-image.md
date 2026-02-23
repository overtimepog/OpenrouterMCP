---
name: or-image
description: Generate an image using AI models through OpenRouter
arguments:
  - name: prompt
    description: Description of the image to generate
    required: true
user_facing: true
---

Generate an image from a text description using OpenRouter.

**CRITICAL: ALWAYS search for the best image generation model first. Never hardcode model IDs.**

## Instructions

1. Parse `$ARGUMENTS` as the image prompt.

2. If the prompt mentions aspect ratio preferences, map them:
   - "portrait" → aspect_ratio "2:3" or "9:16"
   - "landscape" → aspect_ratio "3:2" or "16:9"
   - "square" → aspect_ratio "1:1"
   - "widescreen" → aspect_ratio "16:9" or "21:9"

3. **Always search for the best image model first**:
   - Call `mcp__openrouter__openrouter_search_models` with keyword "image generation" or "image"
   - Look for models that support image output (check capabilities)
   - If the user mentions a preference (e.g. "flux", "gemini"), include that in the search
   - Pick the best/latest available image generation model from results
   - Consider quality vs speed based on user needs

4. Call `mcp__openrouter__openrouter_generate_image` with:
   - `model`: the model ID found from search (never a hardcoded value)
   - `prompt`: the user's description
   - `aspect_ratio`: if detected from step 2
   - `save_path`: suggest saving to current working directory if appropriate

5. Display the result and offer to iterate on the prompt if the user wants changes.

## Arguments
- `$ARGUMENTS` contains the image description prompt
