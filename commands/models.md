---
name: models
description: Search and filter OpenRouter's 500+ AI models by provider, capability, price, and more
arguments:
  - name: query
    description: Search query - provider name, model keyword, or capability (e.g. "anthropic", "vision", "cheap coding")
    required: false
user_facing: true
---

Search OpenRouter models matching the user's query.

## Instructions

1. Parse the user's query to determine filters:
   - Provider names (e.g. "anthropic", "openai", "google") → use `provider` filter
   - Keywords (e.g. "vision", "coding", "chat") → use `keyword` filter
   - Price preferences ("cheap", "free", "budget") → use `max_price` filter
   - Context needs ("long context", "200k") → use `min_context_length` filter
   - Capability needs ("tool use", "streaming") → use `supports_tools`/`supports_streaming`

2. Call `mcp__openrouter__openrouter_search_models` with appropriate filters. If the query is vague, use `mcp__openrouter__openrouter_list_models` with a keyword filter instead.

3. Present results in a clean table:
   | Model | Provider | Context | Price (prompt/completion) | Capabilities |

4. If no query provided, show the top 20 most popular models.

## Arguments
- `$ARGUMENTS` contains the user's search query (may be empty)
