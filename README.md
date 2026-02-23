# OpenRouter MCP Plugin for Claude Code

A Claude Code plugin that provides access to 500+ AI models through [OpenRouter](https://openrouter.ai)'s unified API. Chat with any model, generate images, compare outputs, track costs, and more — all from within Claude Code.

## Features

- **500+ AI Models** — Access GPT-4, Claude, Gemini, Llama, Mistral, and hundreds more
- **Slash Commands** — Quick access: `/openrouter:models`, `/openrouter:or-chat`, `/openrouter:or-image`, `/openrouter:or-credits`, `/openrouter:or-costs`
- **Smart Skills** — Auto-activated workflows for model selection, image generation, cost monitoring, and multi-model comparison
- **Specialist Agents** — Deep model research and image generation agents that work autonomously
- **Multi-turn Conversations** — Session management with automatic context handling
- **Image Generation** — Generate images with Flux, Stable Diffusion, Gemini models
- **Tool/Function Calling** — Full support for OpenAI-compatible function calling
- **Streaming Responses** — Real-time streaming for chat completions
- **Cost Tracking** — Monitor API usage and costs per session
- **Rate Limit Management** — Automatic rate limit handling with warnings
- **Always-Fresh Model Discovery** — All commands and skills search for current models live, never hardcode IDs

## Quick Start

### Prerequisites

- Node.js 20.x or later
- Claude Code CLI
- OpenRouter API key ([Get one here](https://openrouter.ai/keys))

### Install as Claude Code Plugin

```bash
# Set your API key (add to your shell profile for persistence)
export OPENROUTER_API_KEY=sk-or-v1-your-api-key-here

# Install the plugin
claude plugin add /path/to/OpenrouterMCP/dist/index.js
```

The plugin auto-builds on first session if needed. No manual build step required.

### Manual Setup (Optional)

```bash
git clone https://github.com/overtime/OpenrouterMCP.git
cd OpenrouterMCP
bash scripts/setup.sh
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/openrouter:models` | Search and filter models by provider, capability, price, context length |
| `/openrouter:or-chat` | Chat with any model — searches for the best model first |
| `/openrouter:or-image` | Generate images — finds the best image model automatically |
| `/openrouter:or-credits` | Check your OpenRouter credit balance |
| `/openrouter:or-costs` | View spending breakdown by model and operation |

## Skills (Auto-Activated)

Skills activate automatically when Claude detects a relevant task:

| Skill | Triggers On | What It Does |
|-------|-------------|--------------|
| **Model Selection** | "which model for X?", "best model for coding" | Guided recommendation with live search, comparison, and cost analysis |
| **Image Workflow** | "generate an image", "create a picture" | End-to-end: prompt crafting, model discovery, generation, iteration |
| **Cost Monitor** | "how much am I spending?", "check costs" | Credits check, cost breakdown, budget optimization advice |
| **Multi-Model Compare** | "compare models", "which model is better" | Same prompt to N models, side-by-side output and cost comparison |

## Agents

Specialist agents for complex autonomous tasks:

| Agent | When to Use | Capabilities |
|-------|-------------|--------------|
| **Model Researcher** | "do a deep comparison of coding models" | Searches catalog, runs test prompts, compares pricing/quality, produces reports |
| **Image Specialist** | "generate a batch of product photos" | Prompt optimization, model selection, batch generation, iterative refinement |

## Available MCP Tools

### `openrouter_list_models`

List all available AI models with optional filtering.

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | string | Filter by provider (e.g., "openai", "anthropic") |
| `keyword` | string | Search in model names |
| `min_context_length` | number | Minimum context window size |
| `max_context_length` | number | Maximum context window size |
| `modality` | string | Filter by modality (text, image, audio) |
| `min_price` | number | Minimum price per token |
| `max_price` | number | Maximum price per token |

### `openrouter_search_models`

Search and compare models with advanced filtering and sorting.

All parameters from `list_models`, plus:

| Parameter | Type | Description |
|-----------|------|-------------|
| `supports_tools` | boolean | Filter by function calling support |
| `supports_streaming` | boolean | Filter by streaming support |
| `supports_temperature` | boolean | Filter by temperature parameter support |
| `sort_by` | string | Sort by: "price", "context_length", "provider" |
| `sort_order` | string | "asc" or "desc" |

### `openrouter_chat`

Chat with any AI model through OpenRouter.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID (e.g., "openai/gpt-4") |
| `messages` | array | Yes | Array of message objects with `role` and `content` |
| `session_id` | string | No | Continue an existing conversation |
| `stream` | boolean | No | Stream response (default: true) |
| `temperature` | number | No | Response randomness (0-2) |
| `max_tokens` | number | No | Maximum tokens to generate |
| `tools` | array | No | OpenAI-compatible function definitions |
| `tool_choice` | string | No | How to select tools (auto/none/required) |
| `top_p` | number | No | Nucleus sampling threshold |
| `top_k` | number | No | Top-K sampling |
| `frequency_penalty` | number | No | Frequency penalty (-2 to 2) |
| `presence_penalty` | number | No | Presence penalty (-2 to 2) |
| `reasoning` | object | No | Enable reasoning tokens (`{ effort }`) |
| `provider` | object | No | Provider routing preferences |
| `models` | array | No | Fallback model list for auto-routing |
| `plugins` | array | No | OpenRouter plugins (e.g., web search) |

### `openrouter_generate_image`

Generate images using AI models.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Image model ID |
| `prompt` | string | Yes | Image description |
| `aspect_ratio` | string | No | Aspect ratio (1:1, 16:9, 9:16, etc.) |
| `image_size` | string | No | Resolution: 1K, 2K, or 4K |
| `save_path` | string | No | Save image to local path (.png, .jpg, .webp) |

### `openrouter_get_credits`

Check your OpenRouter account balance. Returns total credits, usage, available balance, and usage percentage.

### `openrouter_get_cost_summary`

Get API cost breakdown by model and operation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Get costs for a specific session |
| `recent_only` | boolean | Only show recent entries |

### `openrouter_get_generation`

Get detailed stats for a specific generation by ID. Returns tokens, cost, latency, model, and provider info.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `generation_id` | string | Yes | The generation ID to look up |

### `openrouter_get_model_endpoints`

Get all available providers/endpoints for a model with latency, uptime, pricing, and capability details.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model_slug` | string | Yes | Model slug (e.g., "openai/gpt-4") |

## Plugin Structure

```
OpenrouterMCP/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── .mcp.json                 # MCP server configuration
├── commands/                 # Slash commands
│   ├── models.md             # /openrouter:models
│   ├── or-chat.md            # /openrouter:or-chat
│   ├── or-image.md           # /openrouter:or-image
│   ├── or-credits.md         # /openrouter:or-credits
│   └── or-costs.md           # /openrouter:or-costs
├── skills/                   # Auto-activated skills
│   ├── model-selection/
│   ├── image-workflow/
│   ├── cost-monitor/
│   └── multi-model-compare/
├── agents/                   # Specialist agents
│   ├── model-researcher.md
│   └── image-specialist.md
├── hooks/
│   └── hooks.json            # Auto-build on session start
├── scripts/
│   ├── setup.sh              # Manual setup script
│   └── session-start.sh      # Session start hook
└── src/                      # MCP server source (TypeScript)
    ├── index.ts
    ├── server/
    ├── api/
    ├── session/
    ├── cost/
    ├── tools/
    │   ├── listModels/
    │   ├── searchModels/
    │   ├── chat/
    │   ├── imageGeneration/
    │   ├── credits/
    │   ├── costSummary/
    │   ├── generation/
    │   └── modelEndpoints/
    └── utils/
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests (300 tests)
npm test

# Watch mode
npm run dev
```

## Troubleshooting

### "OPENROUTER_API_KEY environment variable is required"

Set the API key in your shell profile:
```bash
export OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
```

### "Invalid API key provided"

Verify your API key is correct and active at [OpenRouter Keys](https://openrouter.ai/keys).

### "Model not found"

Use `/openrouter:models` or ask Claude to search for models. Model IDs follow the format `provider/model-name`. The plugin always searches for current models — don't hardcode IDs.

### "Rate limit exceeded"

The server warns when approaching limits. Consider upgrading your OpenRouter account or reducing request frequency.

### Tools not showing up

1. Verify `OPENROUTER_API_KEY` is set in your environment
2. Check that the plugin is enabled: `claude plugin list`
3. Restart Claude Code after installing the plugin
4. Run `bash scripts/setup.sh` if the build is missing

## License

MIT

## Links

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [OpenRouter API Reference](https://openrouter.ai/docs/api-reference)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Get an OpenRouter API Key](https://openrouter.ai/keys)
