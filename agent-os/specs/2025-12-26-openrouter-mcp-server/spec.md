# Specification: OpenRouter MCP Server - Core Implementation (Phase 1)

## Goal
Build an MCP server that provides AI assistants access to OpenRouter's unified API, enabling MCP-compatible clients to interact with 500+ AI models through standardized tools with streaming chat, model discovery, and tool calling support.

## User Stories
- As an AI assistant user, I want to query available AI models with filters so that I can find the best model for my specific task requirements
- As a developer using MCP clients, I want to chat with any OpenRouter model using a unified interface so that I can leverage multiple AI providers without integration complexity

## Specific Requirements

**MCP Server Foundation**
- Use TypeScript with Node.js 20.x runtime
- Implement stdio transport using `@modelcontextprotocol/sdk` for MCP compliance
- Configure via environment variable `OPENROUTER_API_KEY` for authentication
- Package for npm distribution with npx execution support (`npx openrouter-mcp-server`)
- Follow class-based server pattern similar to Perplexity MCP server architecture
- Use Zod schemas for input validation on all tool parameters

**OpenRouter API Client**
- Base URL: `https://openrouter.ai/api/v1`
- Authentication via `Authorization: Bearer {API_KEY}` header
- Include `HTTP-Referer` header for request attribution
- Parse and surface rate limit headers (`x-ratelimit-limit-*`, `x-ratelimit-remaining-*`, `x-ratelimit-reset-*`)
- Implement server-side throttling to prevent rate limit exhaustion
- Cache model list responses at edge for performance optimization

**List Models Tool (openrouter_list_models)**
- Fetch all models from `GET /api/v1/models` endpoint
- Return comprehensive metadata: id, name, context_length, pricing, provider, capabilities
- Support filter parameters: provider (string), keyword (string for name search), min/max context length (numbers), modality (text/vision/audio), price range (min/max per token)
- Return filtered results as structured JSON array
- Do not paginate; return all matching models in single response

**Search Models Tool (openrouter_search_models)**
- Extend List Models with advanced filtering capabilities
- Filter by supported parameters: temperature support, tools/function calling support, streaming support
- Include latency hints for model prioritization (if available from API)
- Return structured comparison data with side-by-side model attributes
- Support sorting by price, context length, or provider

**Chat Tool (openrouter_chat)**
- Single unified tool with `stream` parameter (boolean, default: true)
- Call `POST /api/v1/chat/completions` endpoint
- Required parameters: model (string), messages (array of {role, content} objects)
- Optional parameters: temperature, max_tokens, tools array, tool_choice, response_format
- Implement session IDs for multi-turn conversation tracking
- Enforce token-based context limits per session (not message count)
- For streaming: return Server-Sent Events chunks with delta content
- For non-streaming: return complete response with usage statistics

**Tool Calling Support**
- Accept `tools` parameter as array of OpenAI-compatible function definitions
- Pass tools to OpenRouter with `tool_choice` parameter (auto/none/required/specific)
- Return `tool_calls` array in response when model requests tool execution
- Do NOT auto-execute tools; return structured tool call data for client handling
- Include `id`, `type`, `function.name`, and `function.arguments` in tool call responses

**Session Management**
- Generate unique session IDs for conversation tracking
- Store conversation history in-memory (no file persistence in Phase 1)
- Implement token counting for context limit enforcement
- Support session operations: create new, continue existing, list active, expire/clear
- Define session expiry policy (e.g., 30-minute inactivity timeout)

**Error Handling and Logging**
- Surface OpenRouter error messages with clear error codes
- Implement structured error logging for observability (JSON format)
- Do NOT implement automatic retries (client responsibility)
- Return MCP-protocol compliant error responses
- Log rate limit warnings when approaching limits

## Visual Design
Not applicable - this is a backend/API project with no UI components.

## Existing Code to Leverage

**Perplexity MCP Server Design Patterns**
- Class-based `PerplexityServer` pattern for server lifecycle management
- Tool registration using `server.registerTool()` with Zod schemas for validation
- Environment variable configuration via `dotenv` package
- Stdio transport setup via `@modelcontextprotocol/sdk`
- Error handling patterns for API errors, invalid requests, and process signals

**MCP TypeScript SDK (v1.x)**
- Use `registerTool` method with `inputSchema` (Zod), `outputSchema`, and async handler
- Return responses with `content` array (text) and `structuredContent` (machine-readable)
- Leverage built-in stdio transport for local process integrations
- Follow response format: `{ content: [{type: 'text', text: '...'}], structuredContent: {...} }`

**OpenRouter API Compatibility**
- OpenAI-compatible request/response schemas for chat completions
- Standard tool/function calling format matching OpenAI specification
- SSE streaming format with `data: {...}` chunks ending in `data: [DONE]`
- Rate limit header format: `x-ratelimit-*` prefixed headers

**Image Generation Tool (openrouter_generate_image)**
- Generate images using models that support image output (Gemini, Flux, etc.)
- Call `POST /api/v1/chat/completions` with `modalities: ["image", "text"]`
- Required parameters: model (string), prompt (string)
- Optional parameters: aspect_ratio (1:1, 16:9, 9:16, etc.), image_size (1K, 2K, 4K - Gemini only)
- Return generated images as base64 data URLs with metadata
- Support multiple image generation models: Gemini, Flux, Stable Diffusion variants

## Out of Scope
- Cost tracking and usage analytics (Phase 3)
- Multimodal inputs including images and PDFs (Phase 2)
- HTTP transport - only stdio in Phase 1 (Phase 3)
- File-based persistence for sessions or configuration (Future)
- Server-side automatic retries for failed API calls
- Automatic tool execution by the server
- OAuth or complex authentication flows
- Web UI or dashboard for server management
- Model fine-tuning or custom model hosting
