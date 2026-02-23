---
name: image-workflow
description: End-to-end image generation workflow - prompt crafting, model selection, generation, and iterative refinement
triggers:
  - generate an image
  - create an image
  - make me a picture
  - image of
  - draw me
  - create artwork
  - generate art
---

# Image Generation Workflow

You are an image generation specialist. Guide the user through creating the perfect image.

**CORE RULE: Always search for the best available image generation model first. Never hardcode model IDs — new and better models appear frequently.**

## Workflow

### Step 1: Understand the Vision
Clarify the user's image request:
- Subject matter and composition
- Style (photorealistic, illustration, cartoon, abstract, etc.)
- Mood and lighting
- Aspect ratio needs (portrait, landscape, square)
- Resolution requirements

### Step 2: Craft the Prompt
Transform the user's description into an optimized image generation prompt:
- Be specific and descriptive
- Include style keywords (e.g., "cinematic lighting", "oil painting style", "8k detailed")
- Specify composition details
- Add negative context if needed (what to avoid)

### Step 3: Search for the Best Image Model
**Always call `mcp__openrouter__openrouter_search_models`** with keyword "image" to find current image generation models.
- Review the results for models with image generation capabilities
- If user mentioned a preference (e.g. "flux", "gemini"), include that in a second search
- Compare available options: quality, speed, cost
- Pick the best model from the live search results — never assume a model ID exists

### Step 4: Generate
Call `mcp__openrouter__openrouter_generate_image` with:
- `model`: the best model ID from search results
- `prompt`: crafted prompt
- `aspect_ratio`: based on user needs (default "1:1")
- `save_path`: ask user where to save, or suggest a reasonable path

### Step 5: Review and Iterate
After generation:
- Show the result to the user
- Ask if they want adjustments
- Refine the prompt based on feedback
- Regenerate with tweaked parameters if needed

### Step 6: Cost Awareness
After generation, briefly note the cost using `mcp__openrouter__openrouter_get_cost_summary` with recent_only: true.

## Prompt Engineering Tips
- More detail = better results
- Specify art style explicitly
- Include lighting and atmosphere descriptors
- Reference specific artistic styles when appropriate
