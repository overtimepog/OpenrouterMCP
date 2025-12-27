# Product Roadmap

## Phase 1 - Core

1. [x] MCP Server Foundation — Set up TypeScript MCP server with stdio transport, environment variable configuration for API key, and basic error handling `S`
2. [x] OpenRouter API Client — Create typed HTTP client for OpenRouter API with authentication, request/response handling, and rate limit awareness `S`
3. [x] List Models Tool — Implement tool to fetch and return all available OpenRouter models with metadata (pricing, context length, capabilities) `S`
4. [x] Search Models Tool — Add filtering and search functionality for models by name, provider, capability, and price range `S`
5. [x] Basic Chat Tool — Implement single-turn chat completion with any specified model, returning the full response `M`
6. [x] Streaming Chat Tool — Add streaming support for chat completions with proper SSE handling and incremental response delivery `M`
7. [x] Tool Calling Support — Enable function/tool calling for models that support it, with proper schema handling and response parsing `M`
8. [x] Conversation Context — Support multi-turn conversations with message history management within a session `S`
9. [x] Image Generation Tool — Generate images using Gemini, Flux, and other image-capable models with aspect ratio and resolution options `M`

## Phase 2 - Multimodal

10. [ ] Vision Input Support — Accept base64 or URL images in chat requests and route to vision-capable models with proper content formatting `M`
11. [ ] Image Analysis Tool — Dedicated tool for image analysis tasks (describe, extract text, identify objects) with model auto-selection `S`
12. [ ] PDF Upload Support — Handle PDF file inputs, convert to appropriate format, and send to document-capable models `M`
13. [ ] Document Q&A Tool — Enable question-answering over uploaded documents with context extraction and response generation `M`
14. [ ] Multi-file Support — Handle multiple images or documents in a single request for comparative analysis or batch processing `S`

## Phase 3 - Extended
16. [ ] Session Cost Tracking — Track API costs per session with running totals, per-request breakdown, and cost estimation for pending requests `M`
17. [ ] Cost Summary Tool — Provide tool to retrieve current session costs with breakdown by model and operation type `XS`
18. [ ] Operation Logging — Implement structured logging for all operations with timestamps, request/response summaries, and error details `S`
19. [ ] Log Retrieval Tool — Add tool to retrieve operation logs for the current session with filtering by operation type or time range `S`
20. [ ] HTTP Transport Option — Add optional HTTP/SSE transport as alternative to stdio for web-based MCP clients `M`

## Future Enhancements

21. [ ] File-based Persistence — Save session state, costs, and logs to local files for cross-session continuity `M`
22. [ ] Model Favorites — Allow users to mark favorite models for quick access and personalized recommendations `S`
23. [ ] Response Caching — Cache responses for identical requests to reduce costs and latency for repeated queries `M`
24. [ ] Batch Operations — Support batch requests for processing multiple prompts efficiently `L`
25. [ ] Model Comparison Tool — Send same prompt to multiple models and return comparative results `M`

> Notes
> - Order items by technical dependencies and product architecture
> - Each item represents an end-to-end functional and testable feature
> - Phase 1 establishes core functionality required for all subsequent features
> - Phase 2 builds on chat infrastructure to add multimodal capabilities
> - Phase 3 adds value-added features that enhance but don't block core usage
> - Future enhancements are stretch goals for post-v1.0 development
