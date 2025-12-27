# OpenRouter MCP Server

A Model Context Protocol (MCP) server that provides access to 500+ AI models through [OpenRouter](https://openrouter.ai)'s unified API. Use any AI model from OpenAI, Anthropic, Google, Meta, Mistral, and more through a single integration.

## Features

- **500+ AI Models** - Access GPT-4, Claude, Gemini, Llama, Mistral, and hundreds more
- **Multi-turn Conversations** - Session management with automatic context handling
- **Image Generation** - Generate images with Gemini, Flux, Stable Diffusion models
- **Tool/Function Calling** - Full support for OpenAI-compatible function calling
- **Streaming Responses** - Real-time streaming for chat completions
- **Cost Tracking** - Monitor API usage and costs per session
- **Rate Limit Management** - Automatic rate limit handling with warnings
- **Model Search** - Filter and sort models by capabilities, pricing, and provider

## Quick Start

### Prerequisites

- Node.js 20.x or later
- OpenRouter API key ([Get one here](https://openrouter.ai/keys))

### Installation

```bash
npm install -g openrouter-mcp-server
```

Or run directly with npx:

```bash
npx openrouter-mcp-server
```

### Environment Setup

Set your OpenRouter API key:

```bash
# Linux/macOS
export OPENROUTER_API_KEY=sk-or-v1-your-api-key-here

# Windows (Command Prompt)
set OPENROUTER_API_KEY=sk-or-v1-your-api-key-here

# Windows (PowerShell)
$env:OPENROUTER_API_KEY="sk-or-v1-your-api-key-here"
```

## Claude Code Configuration

To use this MCP server with Claude Code, add it to your MCP settings configuration.

### Configuration File Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

### Configuration

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "npx",
      "args": ["openrouter-mcp-server"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-api-key-here"
      }
    }
  }
}
```

**Alternative using node directly (if you cloned the repo):**

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "node",
      "args": ["/path/to/openrouter-mcp-server/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-api-key-here"
      }
    }
  }
}
```

### Verify Configuration

After adding the configuration:

1. Restart Claude Code
2. The OpenRouter tools should now be available
3. Try asking Claude to "list available OpenRouter models"

## Available Tools

### 1. `openrouter_list_models`

List all available AI models with optional filtering.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | string | Filter by provider (e.g., "openai", "anthropic") |
| `keyword` | string | Search in model names |
| `min_context_length` | number | Minimum context window size |
| `max_context_length` | number | Maximum context window size |
| `modality` | string | Filter by modality (text, image, audio) |
| `min_price` | number | Minimum price per token |
| `max_price` | number | Maximum price per token |

**Example:**
```
List all Anthropic models with at least 100k context
```

### 2. `openrouter_search_models`

Search and compare models with advanced filtering and sorting.

**Parameters:**
All parameters from `list_models`, plus:
| Parameter | Type | Description |
|-----------|------|-------------|
| `supports_tools` | boolean | Filter by function calling support |
| `supports_streaming` | boolean | Filter by streaming support |
| `sort_by` | string | Sort by: "price", "context_length", "provider" |
| `sort_order` | string | "asc" or "desc" |

**Example:**
```
Find the cheapest models that support function calling, sorted by price
```

### 3. `openrouter_chat`

Chat with any AI model through OpenRouter.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID (e.g., "openai/gpt-4", "anthropic/claude-3-opus") |
| `messages` | array | Yes | Array of message objects with `role` and `content` |
| `session_id` | string | No | Continue an existing conversation |
| `stream` | boolean | No | Stream response (default: true) |
| `temperature` | number | No | Response randomness (0-2) |
| `max_tokens` | number | No | Maximum tokens to generate |
| `tools` | array | No | OpenAI-compatible function definitions |
| `tool_choice` | string | No | How to select tools (auto/none/required) |

**Example:**
```
Use Claude 3 Opus to explain quantum computing
```

### 4. `openrouter_generate_image`

Generate images using AI models.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Image model ID |
| `prompt` | string | Yes | Image description |
| `aspect_ratio` | string | No | Aspect ratio (1:1, 16:9, 9:16, etc.) |
| `image_size` | string | No | Resolution: 1K, 2K, or 4K |

**Supported Models:**
- `google/gemini-2.5-flash-image-preview` - Supports aspect_ratio and image_size
- `black-forest-labs/flux.2-pro`
- `black-forest-labs/flux.2-flex`
- `black-forest-labs/flux-schnell`

**Example:**
```
Generate a 16:9 image of a sunset over mountains using Gemini
```

### 5. `openrouter_get_credits`

Check your OpenRouter account balance.

**Returns:**
- Total credits purchased
- Total credits used
- Available balance
- Usage percentage

**Example:**
```
Check my OpenRouter credit balance
```

### 6. `openrouter_get_cost_summary`

Get a summary of API costs for tracking usage.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Get costs for a specific session |
| `recent_only` | boolean | Only show recent entries |

**Returns:**
- Total cost in credits
- Token usage breakdown
- Request count
- Cost breakdown by model
- Cost breakdown by operation type

**Example:**
```
How much did my image generation session cost?
```

## Popular Model IDs

### Chat Models
| Model | ID | Context |
|-------|-----|---------|
| GPT-4 Turbo | `openai/gpt-4-turbo` | 128K |
| GPT-4o | `openai/gpt-4o` | 128K |
| Claude 3 Opus | `anthropic/claude-3-opus` | 200K |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | 200K |
| Gemini Pro | `google/gemini-pro` | 32K |
| Llama 3 70B | `meta-llama/llama-3-70b-instruct` | 8K |
| Mistral Large | `mistralai/mistral-large` | 32K |

### Image Generation Models
| Model | ID |
|-------|-----|
| Gemini Image | `google/gemini-2.5-flash-image-preview` |
| Flux Pro | `black-forest-labs/flux.2-pro` |
| Flux Schnell | `black-forest-labs/flux-schnell` |

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/overtime/openrouter-mcp-server.git
cd openrouter-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Project Structure

```
src/
├── index.ts              # Main entry point
├── server/               # MCP server implementation
├── api/                  # OpenRouter API client
├── session/              # Session management
├── cost/                 # Cost tracking
├── tools/                # MCP tools
│   ├── listModels/       # List models tool
│   ├── searchModels/     # Search models tool
│   ├── chat/             # Chat tool
│   ├── imageGeneration/  # Image generation tool
│   ├── credits/          # Get credits tool
│   └── costSummary/      # Cost summary tool
└── utils/                # Utilities (logger, etc.)
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test files
npm run test:foundation
npm run test:api
npm run test:session
```

### Building

```bash
# Build the project
npm run build

# Build in watch mode
npm run dev
```

## Troubleshooting

### "OPENROUTER_API_KEY environment variable is required"

Make sure you've set the API key in your environment or in the MCP configuration's `env` section.

### "Invalid API key provided"

Verify your API key is correct and active at [OpenRouter Keys](https://openrouter.ai/keys).

### "Model not found"

Use `openrouter_list_models` or `openrouter_search_models` to find valid model IDs. Model IDs follow the format `provider/model-name`.

### "Rate limit exceeded"

OpenRouter has rate limits based on your account tier. The server will warn you when approaching limits. Consider:
- Upgrading your OpenRouter account
- Reducing request frequency
- Using caching for repeated queries

### Claude Code doesn't show the tools

1. Verify the configuration file path is correct for your OS
2. Check the JSON syntax is valid
3. Restart Claude Code after configuration changes
4. Check Claude Code logs for any error messages

## License

MIT

## Links

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [OpenRouter API Reference](https://openrouter.ai/docs/api-reference)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Get an OpenRouter API Key](https://openrouter.ai/keys)
