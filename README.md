<div align="center">

```
   ___                   ____              _
  / _ \ _ __   ___ _ __ |  _ \ ___  _   _| |_ ___ _ __
 | | | | '_ \ / _ \ '_ \| |_) / _ \| | | | __/ _ \ '__|
 | |_| | |_) |  __/ | | |  _ < (_) | |_| | ||  __/ |
  \___/| .__/ \___|_| |_|_| \_\___/ \__,_|\__\___|_|
       |_|                          MCP Plugin for Claude Code
```

**Access 500+ AI models directly from Claude Code.**

GPT-4 &bull; Gemini &bull; Llama &bull; Mistral &bull; Flux &bull; Stable Diffusion &bull; and hundreds more

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-383%20passing-brightgreen?logo=vitest&logoColor=white)](https://vitest.dev)
[![MCP](https://img.shields.io/badge/MCP-Compatible-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48L3N2Zz4=)](https://modelcontextprotocol.io)

[Getting Started](#getting-started) &bull; [Commands](#slash-commands) &bull; [Tools](#mcp-tools) &bull; [Agents](#agents) &bull; [Development](#development)

</div>

---

## Why OpenRouter MCP?

You're in Claude Code. You need a quick answer from GPT-4. Or a Flux image. Or a side-by-side comparison of three models. Normally you'd leave your terminal, open a browser, juggle API keys...

**Not anymore.** This plugin drops the entire OpenRouter catalog into your workflow — chat, generate images, compare models, track costs — without ever leaving Claude Code.

---

## Getting Started

### 1. Get an API Key

Grab one from [openrouter.ai/keys](https://openrouter.ai/keys) and export it:

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

> Add this to your `~/.zshrc` or `~/.bashrc` so it persists.

### 2. Install the Plugin

```bash
claude plugin add /path/to/OpenrouterMCP/dist/index.js
```

That's it. The plugin auto-builds on first session if needed.

<details>
<summary><b>Manual setup (clone & build yourself)</b></summary>

```bash
git clone https://github.com/overtimepog/OpenrouterCC.git
cd OpenrouterCC
bash scripts/setup.sh
```

</details>

---

## What You Get

<table>
<tr>
<td width="50%">

### Chat with Any Model
Send messages to GPT-4, Gemini, Llama, Mistral, or any of 500+ models. Multi-turn conversations with automatic context management.

### Generate Images
Create images with Flux, Stable Diffusion, and Gemini image models. Control aspect ratio, resolution, and save locally.

</td>
<td width="50%">

### Compare Models Side-by-Side
Send the same prompt to multiple models and compare quality, speed, and cost in one shot.

### Track Your Spending
Real-time cost tracking per session, per model, per operation. Know exactly where your credits go.

</td>
</tr>
</table>

---

## Slash Commands

| Command | What It Does |
|:--------|:-------------|
| `/openrouter:models` | Search & filter models by provider, capability, price, context length |
| `/openrouter:or-chat` | Chat with any model — auto-discovers the best match |
| `/openrouter:or-image` | Generate images — finds optimal image models automatically |
| `/openrouter:or-credits` | Check your OpenRouter credit balance |
| `/openrouter:or-costs` | View spending breakdown by model and operation |

---

## Skills (Auto-Activated)

Skills fire automatically when Claude detects a matching intent — no commands needed.

| Skill | Triggers On | What Happens |
|:------|:------------|:-------------|
| **Model Selection** | *"which model for coding?"* | Live search, comparison, cost analysis, recommendation |
| **Image Workflow** | *"generate an image of..."* | Prompt crafting → model discovery → generation → iteration |
| **Cost Monitor** | *"how much am I spending?"* | Balance check, cost breakdown, budget optimization |
| **Multi-Model Compare** | *"compare Claude vs GPT-4"* | Same prompt → N models → side-by-side results + cost |

---

## Agents

Autonomous specialist agents for complex, multi-step tasks:

| Agent | Use Case | What It Does |
|:------|:---------|:-------------|
| **Model Researcher** | *"deep comparison of coding models"* | Searches catalog, runs test prompts, compares pricing & quality, writes reports |
| **Image Specialist** | *"generate a batch of product photos"* | Prompt optimization, model selection, batch generation, iterative refinement |

---

## MCP Tools

Full reference for all tools exposed over the Model Context Protocol.

<details>
<summary><b><code>openrouter_chat</code></b> — Chat with any model</summary>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model` | string | **Yes** | Model ID (e.g. `openai/gpt-4`) |
| `messages` | array | **Yes** | `[{ role, content }]` message array |
| `session_id` | string | No | Continue an existing conversation |
| `stream` | boolean | No | Stream response (default: `true`) |
| `temperature` | number | No | Randomness 0–2 |
| `max_tokens` | number | No | Max tokens to generate |
| `tools` | array | No | OpenAI-compatible function definitions |
| `tool_choice` | string | No | `auto` / `none` / `required` |
| `top_p` | number | No | Nucleus sampling threshold |
| `top_k` | number | No | Top-K sampling |
| `frequency_penalty` | number | No | Frequency penalty (-2 to 2) |
| `presence_penalty` | number | No | Presence penalty (-2 to 2) |
| `reasoning` | object | No | Enable reasoning tokens (`{ effort }`) |
| `provider` | object | No | Provider routing preferences |
| `models` | array | No | Fallback model list for auto-routing |
| `plugins` | array | No | OpenRouter plugins (e.g. web search) |

</details>

<details>
<summary><b><code>openrouter_search_models</code></b> — Search & compare models</summary>

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `provider` | string | Filter by provider (`openai`, `anthropic`, ...) |
| `keyword` | string | Search in model names |
| `min_context_length` | number | Minimum context window |
| `max_context_length` | number | Maximum context window |
| `modality` | string | `text`, `image`, `audio` |
| `min_price` / `max_price` | number | Price range per token |
| `supports_tools` | boolean | Function calling support |
| `supports_streaming` | boolean | Streaming support |
| `supports_temperature` | boolean | Temperature parameter support |
| `sort_by` | string | `price`, `context_length`, `provider` |
| `sort_order` | string | `asc` or `desc` |

</details>

<details>
<summary><b><code>openrouter_list_models</code></b> — List models with filtering</summary>

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `provider` | string | Filter by provider |
| `keyword` | string | Search in model names |
| `min_context_length` | number | Minimum context window |
| `max_context_length` | number | Maximum context window |
| `modality` | string | Filter by modality |
| `min_price` / `max_price` | number | Price range |

</details>

<details>
<summary><b><code>openrouter_generate_image</code></b> — Generate images</summary>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model` | string | **Yes** | Image model ID |
| `prompt` | string | **Yes** | Image description |
| `aspect_ratio` | string | No | `1:1`, `16:9`, `9:16`, etc. |
| `image_size` | string | No | `1K`, `2K`, or `4K` |
| `save_path` | string | No | Local save path (`.png`, `.jpg`, `.webp`) |

</details>

<details>
<summary><b><code>openrouter_get_credits</code></b> — Check balance & usage</summary>

No parameters. Returns credit limit, remaining balance, total usage, and daily/weekly/monthly breakdowns.

</details>

<details>
<summary><b><code>openrouter_get_cost_summary</code></b> — Cost breakdown</summary>

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `session_id` | string | Costs for a specific session |
| `recent_only` | boolean | Only show recent entries |

</details>

<details>
<summary><b><code>openrouter_get_generation</code></b> — Generation stats</summary>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `generation_id` | string | **Yes** | The generation ID to look up |

Returns tokens, cost, latency, model, and provider info.

</details>

<details>
<summary><b><code>openrouter_get_model_endpoints</code></b> — Provider endpoints</summary>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model_slug` | string | **Yes** | Model slug (e.g. `openai/gpt-4`) |

Returns all available providers with latency, uptime, pricing, and capabilities.

</details>

---

## Project Structure

```
OpenrouterMCP/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── commands/                    # Slash commands
│   ├── models.md
│   ├── or-chat.md
│   ├── or-image.md
│   ├── or-credits.md
│   └── or-costs.md
├── skills/                      # Auto-activated skills
│   ├── model-selection/
│   ├── image-workflow/
│   ├── cost-monitor/
│   └── multi-model-compare/
├── agents/                      # Specialist agents
│   ├── model-researcher.md
│   └── image-specialist.md
├── hooks/
│   └── hooks.json               # Auto-build on session start
├── scripts/
│   ├── setup.sh
│   └── session-start.sh
└── src/                         # MCP server (TypeScript)
    ├── index.ts                 # Entry point
    ├── server/                  # Server setup
    ├── api/                     # OpenRouter client, caching, rate limits
    ├── session/                 # Multi-turn conversation management
    ├── cost/                    # Cost tracking
    ├── schemas/                 # Shared Zod schemas
    ├── tools/                   # Tool implementations
    │   ├── chat/
    │   ├── searchModels/
    │   ├── listModels/
    │   ├── imageGeneration/
    │   ├── credits/
    │   ├── costSummary/
    │   ├── generation/
    │   └── modelEndpoints/
    └── utils/                   # Logger, model validation
```

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Build
npm test             # Run all 383 tests
npm run dev          # Watch mode
```

---

## Troubleshooting

<details>
<summary><b>"OPENROUTER_API_KEY environment variable is required"</b></summary>

Add to your shell profile and restart your terminal:
```bash
echo 'export OPENROUTER_API_KEY=sk-or-v1-your-key' >> ~/.zshrc
source ~/.zshrc
```

</details>

<details>
<summary><b>"Invalid API key provided"</b></summary>

Verify your key is correct and active at [openrouter.ai/keys](https://openrouter.ai/keys).

</details>

<details>
<summary><b>"Model not found"</b></summary>

Use `/openrouter:models` to search for current models. IDs follow the format `provider/model-name`. The plugin always searches live — never hardcode model IDs.

</details>

<details>
<summary><b>"Rate limit exceeded"</b></summary>

The server warns before you hit limits. Consider upgrading your OpenRouter plan or spacing out requests.

</details>

<details>
<summary><b>Tools not showing up</b></summary>

1. Verify `OPENROUTER_API_KEY` is set: `echo $OPENROUTER_API_KEY`
2. Check plugin status: `claude plugin list`
3. Restart Claude Code
4. Run `bash scripts/setup.sh` if the build is missing

</details>

---

<div align="center">

**[OpenRouter Docs](https://openrouter.ai/docs)** &bull; **[API Reference](https://openrouter.ai/docs/api-reference)** &bull; **[MCP Spec](https://modelcontextprotocol.io)** &bull; **[Get API Key](https://openrouter.ai/keys)**

MIT License

</div>
