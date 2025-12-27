# Tech Stack

## Language & Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language (94%+ of codebase) |
| Node.js | 20.x LTS | Runtime environment |
| ES Modules | ESM | Module system |

## Core Dependencies

| Package | Purpose |
|---------|---------|
| @modelcontextprotocol/sdk | Official MCP SDK for server implementation |
| zod | Runtime type validation and schema definition |
| typescript | TypeScript compiler |

## API Integration

| Technology | Purpose |
|------------|---------|
| OpenRouter API | Unified access to 500+ AI models |
| Native fetch | HTTP client for API requests |
| Server-Sent Events | Streaming response handling |

## Transport Layer

| Transport | Status | Use Case |
|-----------|--------|----------|
| stdio | Primary | Claude Code, Cursor, CLI clients |
| HTTP/SSE | Optional | Web-based MCP clients |

## Configuration

| Method | Purpose |
|--------|---------|
| `OPENROUTER_API_KEY` | Environment variable for API authentication |
| MCP client config | Server registration in client settings |

## Build & Development

| Tool | Purpose |
|------|---------|
| npm | Package manager |
| tsc | TypeScript compilation |
| tsx | Development execution with hot reload |
| ESLint | Code linting |
| Prettier | Code formatting |

## Testing

| Tool | Purpose |
|------|---------|
| Vitest | Unit and integration testing |
| MCP Inspector | Manual MCP server testing |

## Distribution

| Method | Command | Purpose |
|--------|---------|---------|
| npm registry | `npx @openrouter/mcp-server` | Primary distribution |
| GitHub | Source repository | Source access, issues, contributions |

## Project Structure

```
openrouter-mcp-server/
├── src/
│   ├── index.ts           # Entry point, server initialization
│   ├── server.ts          # MCP server setup and tool registration
│   ├── tools/             # Tool implementations
│   │   ├── models.ts      # Model listing and search
│   │   ├── chat.ts        # Chat completions
│   │   ├── vision.ts      # Image analysis
│   │   ├── documents.ts   # PDF/document handling
│   │   ├── generation.ts  # Image generation
│   │   └── tracking.ts    # Cost and logging
│   ├── api/
│   │   └── openrouter.ts  # OpenRouter API client
│   ├── types/
│   │   └── index.ts       # Shared type definitions
│   └── utils/
│       ├── streaming.ts   # SSE handling utilities
│       └── validation.ts  # Input validation helpers
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## State Management

| Approach | Scope | Purpose |
|----------|-------|---------|
| In-memory | Session | Cost tracking, operation logs, conversation context |
| File-based | Future | Persistent state across sessions |

## Security Considerations

| Concern | Approach |
|---------|----------|
| API Key Storage | Environment variable, never in code |
| Input Validation | Zod schemas for all tool inputs |
| Error Handling | Sanitized error messages, no key leakage |
| Transport Security | HTTPS for API calls, local stdio for MCP |

## Performance Targets

| Metric | Target |
|--------|--------|
| Cold start | < 500ms |
| Tool response (non-streaming) | < 100ms overhead |
| Memory footprint | < 50MB base |
| Streaming latency | Near-zero added latency |
