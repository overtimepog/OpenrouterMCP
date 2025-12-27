# Spec Requirements: OpenRouter MCP Server - Core Implementation

## Initial Description

Build a Model Context Protocol (MCP) server that provides AI assistants access to OpenRouter's unified API. This server enables MCP-compatible clients (Claude Code, Cursor, etc.) to interact with 500+ AI models from 60+ providers through standardized tools.

**Phase 1 Scope:**
1. MCP Server foundation with TypeScript and stdio transport
2. OpenRouter API client with authentication
3. List Models tool - fetch all available models with metadata
4. Search Models tool - filter by name, provider, capability, price
5. Chat tool with streaming support
6. Tool calling support for compatible models
7. Conversation context management

**Context:**
- Tech stack: TypeScript, Node.js 20.x, MCP SDK
- Distribution: npm package with npx support
- Following design patterns from Perplexity MCP server

## Requirements Discussion

### First Round Questions

**Q1:** Model Listing - Should we paginate model results or return all models? OpenRouter has 500+ models.
**Answer:** List all models but allow the tool to have params to shorten/zoom into results. Include filter parameters in the tool to let users narrow down results.

**Q2:** Search Filter Criteria - What filters should the Search Models tool support beyond name, provider, capabilities, and price?
**Answer:** Based on Perplexity research on best practices, include:
- Context length range (min/max tokens)
- Modality support (text, vision, audio)
- Model prioritization factors (latency hints)
- Supported parameters (temperature, tools, etc.)

**Q3:** Streaming Architecture - Should we have separate tools for streaming vs non-streaming chat, or a unified tool with a stream parameter?
**Answer:** Consolidate into ONE tool with a `stream` parameter. This aligns with MCP's unified architecture, reduces custom code, and supports plug-and-play interoperability. Default `stream: true` for better UX.

**Q4:** Conversation History - How should we handle conversation context limits? Token-based limits or message count?
**Answer:** Implement limits on message history to avoid bloat. Use session IDs to track context across multi-turn conversations. Clear session policies for starting, storing, and expiring sessions. Use token-based limits rather than message count (recommended best practice).

**Q5:** Error Handling & Retries - Should the server implement automatic retries for failed API calls?
**Answer:** Leave retries to clients - don't implement server-side retries. MCP emphasizes monitoring errors via logging. Servers should focus on structured output and error logging for observability. Surface clear error codes and messages.

**Q6:** Tool Execution Model - When a model returns tool calls, should the server auto-execute them or return them for client handling?
**Answer:** Return tool calls for client handling - don't auto-execute. LLM (client) initiates calls, server processes/returns structured output. This preserves context, enables permissioning/scopes, and ensures secure, interoperable tool use.

**Q7:** Rate Limiting - How should the server handle OpenRouter rate limits?
**Answer:** Surface rate limit headers to clients AND implement server-side throttling as best practice. Combine with performance optimizations like caching. Supports monitoring tool usage and preventing overload.

**Q8:** Phase 1 Exclusions - What features should explicitly be left for future phases?
**Answer:**
- Cost tracking (Phase 3)
- Multimodal inputs - images, PDFs (Phase 2)
- Image generation (Phase 3)
- HTTP transport (Phase 3)
- File-based persistence (Future)

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Perplexity MCP Server - Design patterns to follow for MCP server structure
- No specific codebase paths provided for reference

### Follow-up Questions

No follow-up questions were required. All answers provided sufficient detail through Perplexity research on MCP best practices.

## Visual Assets

### Files Provided:
No visual assets provided - this is a backend/API project with no UI components.

### Visual Insights:
Not applicable for this specification.

## Requirements Summary

### Functional Requirements

**List Models Tool:**
- Fetch all available models from OpenRouter API
- Include comprehensive metadata (pricing, context length, capabilities)
- Support filter parameters to narrow results:
  - Provider filter
  - Name/keyword search
  - Context length range
  - Modality (text, vision, audio)
  - Capability filters
  - Price range

**Search Models Tool:**
- Advanced filtering beyond List Models
- Filter by supported parameters (temperature, tools, etc.)
- Latency hints / prioritization factors
- Return structured model comparison data

**Chat Tool:**
- Single unified tool with `stream` parameter
- Default `stream: true` for better UX
- Support multi-turn conversations via session IDs
- Token-based context limits (not message count)
- Session management: create, continue, expire
- Return tool calls for client handling (no auto-execution)

**Tool Calling Support:**
- Detect tool-capable models
- Pass tool definitions to OpenRouter
- Return tool call results in structured format
- Let clients handle tool execution

**Error Handling:**
- Structured error output with clear error codes
- Comprehensive error logging for observability
- No server-side retries (client responsibility)
- Surface OpenRouter error messages clearly

**Rate Limiting:**
- Surface rate limit headers to clients
- Implement server-side throttling
- Response caching for performance optimization
- Usage monitoring capabilities

### Technical Architecture

**Server Foundation:**
- TypeScript implementation
- Node.js 20.x runtime
- MCP SDK for protocol compliance
- stdio transport (Phase 1)

**API Client:**
- OpenRouter API integration
- API key authentication
- Streaming response handling
- Rate limit header parsing

**Distribution:**
- npm package
- npx execution support

### Reusability Opportunities

- Follow Perplexity MCP Server design patterns
- Leverage MCP SDK standard implementations
- Use established TypeScript patterns for API clients

### Scope Boundaries

**In Scope (Phase 1):**
- MCP Server with stdio transport
- OpenRouter API client with authentication
- List Models tool with filtering
- Search Models tool with advanced filters
- Unified Chat tool with streaming
- Tool calling support (return to client)
- Session-based conversation management
- Token-based context limits
- Error logging and structured output
- Rate limit surfacing and throttling
- Response caching

**Out of Scope:**
- Cost tracking and usage analytics (Phase 3)
- Multimodal inputs - images, PDFs (Phase 2)
- Image generation capabilities (Phase 3)
- HTTP transport (Phase 3)
- File-based persistence (Future)
- Server-side automatic retries
- Automatic tool execution

### Technical Considerations

- OpenRouter API rate limits must be respected
- Streaming requires proper SSE/chunked response handling
- Session storage in-memory for Phase 1 (no persistence)
- Token counting needed for context limit enforcement
- MCP SDK compatibility requirements
- Error codes should align with MCP protocol standards
