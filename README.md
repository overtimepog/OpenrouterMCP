<div align="center">

# ⚡ OpenRouter MCP

### Every AI model. One terminal. Zero context switching.

<p>
<code>GPT-4</code> &nbsp;
<code>Claude</code> &nbsp;
<code>Gemini</code> &nbsp;
<code>Llama</code> &nbsp;
<code>Mistral</code> &nbsp;
<code>Flux</code> &nbsp;
<code>+300 more</code>
</p>

<br>

<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
<a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node 20+"></a>
<a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/typescript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
<a href="https://vitest.dev"><img src="https://img.shields.io/badge/tests-383_passing-brightgreen?style=flat-square" alt="Tests"></a>
<a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8B5CF6?style=flat-square" alt="MCP Compatible"></a>

<br><br>

[**Getting Started**](#-getting-started) · [**Features**](#-features) · [**Commands**](#-slash-commands) · [**Tools**](#-mcp-tools) · [**Development**](#-development)

</div>

<br>

## The Problem

You're deep in Claude Code. You need a quick GPT-4 opinion. Or a Flux-generated image. Or a side-by-side shootout across three models. That means: leave the terminal, open a browser, find the right API, copy-paste keys, lose your flow...

## The Fix

Add it to your MCP config and go:

```json
{
  "openrouter": {
    "command": "npx",
    "args": ["-y", "openrouter-mcp-server"],
    "env": {
      "OPENROUTER_API_KEY": "sk-or-v1-your-key-here"
    }
  }
}
```

Now every model on OpenRouter is one tool call away. Chat, image gen, model search, cost tracking — all inline.

---

## ⚡ Getting Started

**Step 1** — Get an API key from [openrouter.ai/keys](https://openrouter.ai/keys)

**Step 2** — Add to your MCP config (`~/.claude/settings.json` or your app's MCP settings):

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "npx",
      "args": ["-y", "openrouter-mcp-server"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-key-here"
      }
    }
  }
}
```

Done. The server starts automatically when your MCP client connects.

<details>
<summary>Alternative: Install as Claude Code plugin</summary>
<br>

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here   # add to ~/.zshrc to persist
claude plugin add /path/to/OpenrouterMCP/dist/index.js
```

</details>

<details>
<summary>Alternative: Clone & build from source</summary>
<br>

```bash
git clone https://github.com/overtimepog/OpenrouterMCP.git
cd OpenrouterMCP
bash scripts/setup.sh
```

</details>

---

## 🎯 Features

<table>
<tr>
<td align="center" width="25%">
<br>
<img src="https://img.shields.io/badge/-Chat-4ade80?style=for-the-badge&logo=chatbot&logoColor=white" alt="Chat">
<br><br>
<b>Multi-Model Chat</b>
<br>
<sub>Talk to any of 300+ models with multi-turn context, streaming, and tool calling</sub>
<br><br>
</td>
<td align="center" width="25%">
<br>
<img src="https://img.shields.io/badge/-Images-f472b6?style=for-the-badge&logo=image&logoColor=white" alt="Images">
<br><br>
<b>Image Generation</b>
<br>
<sub>Flux, Stable Diffusion, Gemini — control ratio, resolution, save locally</sub>
<br><br>
</td>
<td align="center" width="25%">
<br>
<img src="https://img.shields.io/badge/-Compare-60a5fa?style=for-the-badge&logo=scale&logoColor=white" alt="Compare">
<br><br>
<b>Model Comparison</b>
<br>
<sub>Same prompt to N models, side-by-side quality, speed, and cost</sub>
<br><br>
</td>
<td align="center" width="25%">
<br>
<img src="https://img.shields.io/badge/-Costs-fbbf24?style=for-the-badge&logo=dollar&logoColor=white" alt="Costs">
<br><br>
<b>Cost Tracking</b>
<br>
<sub>Real-time spend per session, per model, per operation</sub>
<br><br>
</td>
</tr>
</table>

---

## 🔧 Slash Commands

```
/openrouter:models      Search & filter by provider, capability, price, context length
/openrouter:or-chat     Chat with any model — auto-discovers the best match
/openrouter:or-image    Generate images — picks optimal model automatically
/openrouter:or-credits  Check your credit balance
/openrouter:or-costs    Spending breakdown by model and operation
```

---

## 🧠 Skills (Auto-Activated)

> Skills fire automatically when Claude detects a matching intent — no slash commands needed.

| | Skill | Trigger Example | What Happens |
|:--|:------|:----------------|:-------------|
| 🎯 | **Model Selection** | *"which model for coding?"* | Live search → comparison → cost analysis → recommendation |
| 🎨 | **Image Workflow** | *"generate an image of..."* | Prompt crafting → model discovery → generation → iteration |
| 💰 | **Cost Monitor** | *"how much am I spending?"* | Balance check → cost breakdown → budget optimization |
| ⚖️ | **Multi-Model Compare** | *"compare Claude vs GPT-4"* | Same prompt → N models → side-by-side results + cost |

---

## 🤖 Agents

Specialist agents that work autonomously on complex, multi-step tasks:

<table>
<tr>
<td width="50%">

**🔬 Model Researcher**

> *"do a deep comparison of coding models"*

Searches the full catalog, runs test prompts, benchmarks pricing vs quality, and writes a structured report.

</td>
<td width="50%">

**🖼️ Image Specialist**

> *"generate a batch of product photos"*

Optimizes prompts, selects ideal models, handles batch generation, and iterates on results.

</td>
</tr>
</table>

---

## 📡 MCP Tools

<details>
<summary><kbd>openrouter_chat</kbd> — Chat with any model</summary>
<br>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model` | string | **Yes** | Model ID (e.g. `openai/gpt-4`) |
| `messages` | array | **Yes** | `[{ role, content }]` message array |
| `session_id` | string | | Continue an existing conversation |
| `stream` | boolean | | Stream response (default: `true`) |
| `temperature` | number | | Randomness 0–2 |
| `max_tokens` | number | | Max tokens to generate |
| `tools` | array | | OpenAI-compatible function definitions |
| `tool_choice` | string | | `auto` / `none` / `required` |
| `top_p` | number | | Nucleus sampling threshold |
| `top_k` | number | | Top-K sampling |
| `frequency_penalty` | number | | Frequency penalty (−2 to 2) |
| `presence_penalty` | number | | Presence penalty (−2 to 2) |
| `reasoning` | object | | Reasoning tokens (`{ effort }`) |
| `provider` | object | | Provider routing preferences |
| `models` | array | | Fallback model list for auto-routing |
| `plugins` | array | | OpenRouter plugins (e.g. web search) |

</details>

<details>
<summary><kbd>openrouter_search_models</kbd> — Advanced model search & compare</summary>
<br>

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `provider` | string | Filter by provider (`openai`, `anthropic`, …) |
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
<summary><kbd>openrouter_list_models</kbd> — List all models with filtering</summary>
<br>

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
<summary><kbd>openrouter_generate_image</kbd> — Generate images</summary>
<br>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model` | string | **Yes** | Image model ID |
| `prompt` | string | **Yes** | Image description |
| `aspect_ratio` | string | | `1:1`, `16:9`, `9:16`, etc. |
| `image_size` | string | | `1K`, `2K`, or `4K` |
| `save_path` | string | | Local save path (`.png`, `.jpg`, `.webp`) |

</details>

<details>
<summary><kbd>openrouter_get_credits</kbd> — Check balance & usage</summary>
<br>

No parameters. Returns credit limit, remaining balance, total usage, and daily/weekly/monthly breakdowns.

</details>

<details>
<summary><kbd>openrouter_get_cost_summary</kbd> — Cost breakdown</summary>
<br>

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `session_id` | string | Costs for a specific session |
| `recent_only` | boolean | Only show recent entries |

</details>

<details>
<summary><kbd>openrouter_get_generation</kbd> — Generation stats</summary>
<br>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `generation_id` | string | **Yes** | The generation ID to look up |

Returns tokens, cost, latency, model, and provider info.

</details>

<details>
<summary><kbd>openrouter_get_model_endpoints</kbd> — Provider endpoints & routing</summary>
<br>

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model_slug` | string | **Yes** | Model slug (e.g. `openai/gpt-4`) |

Returns all available providers with latency, uptime, pricing, and capabilities.

</details>

---

## 📁 Project Structure

```
OpenrouterMCP/
├── commands/               Slash commands (/models, /or-chat, /or-image, ...)
├── skills/                 Auto-activated workflows (model-selection, image, cost, compare)
├── agents/                 Specialist agents (model-researcher, image-specialist)
├── hooks/                  Auto-build on session start
├── scripts/                Setup & session scripts
└── src/                    TypeScript MCP server
    ├── server/             Server bootstrap
    ├── api/                OpenRouter client, cache, rate limits
    ├── session/            Multi-turn conversation management
    ├── cost/               Cost tracking engine
    ├── schemas/            Shared Zod schemas
    ├── tools/              8 tool implementations
    └── utils/              Logger, model validation
```

---

## 🛠 Development

```bash
npm install          # dependencies
npm run build        # compile
npm test             # 383 tests
npm run dev          # watch mode
```

---

## 🔍 Troubleshooting

<details>
<summary><b>OPENROUTER_API_KEY not found</b></summary>
<br>

```bash
echo 'export OPENROUTER_API_KEY=sk-or-v1-your-key' >> ~/.zshrc && source ~/.zshrc
```

</details>

<details>
<summary><b>Invalid API key</b></summary>
<br>

Verify at [openrouter.ai/keys](https://openrouter.ai/keys) that the key is correct and active.

</details>

<details>
<summary><b>Model not found</b></summary>
<br>

Use `/openrouter:models` to search. IDs use the format `provider/model-name`. The plugin always searches live — never hardcode IDs.

</details>

<details>
<summary><b>Rate limit exceeded</b></summary>
<br>

The server warns before you hit limits. Upgrade your OpenRouter plan or space out requests.

</details>

<details>
<summary><b>Tools not showing up</b></summary>
<br>

1. Check key is set: `echo $OPENROUTER_API_KEY`
2. Check plugin: `claude plugin list`
3. Restart Claude Code
4. Rebuild: `bash scripts/setup.sh`

</details>

---

<div align="center">

<a href="https://openrouter.ai/docs"><img src="https://img.shields.io/badge/OpenRouter-Docs-8B5CF6?style=flat-square" alt="Docs"></a>
<a href="https://openrouter.ai/docs/api-reference"><img src="https://img.shields.io/badge/API-Reference-blue?style=flat-square" alt="API"></a>
<a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Spec-green?style=flat-square" alt="MCP"></a>
<a href="https://openrouter.ai/keys"><img src="https://img.shields.io/badge/Get-API_Key-orange?style=flat-square" alt="Key"></a>

<br>

<sub>MIT License · Built for <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a></sub>

</div>
