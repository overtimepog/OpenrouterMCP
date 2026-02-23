---
name: or-costs
description: View OpenRouter spending breakdown by model and operation
arguments:
  - name: session
    description: Optional session ID to filter costs for a specific conversation
    required: false
user_facing: true
---

View a detailed cost breakdown of OpenRouter API usage.

## Instructions

1. Call `mcp__openrouter__openrouter_get_cost_summary` with:
   - `session_id`: from `$ARGUMENTS` if provided
   - `recent_only`: false (show all)

2. Display a summary:
   - Total cost
   - Total tokens used (prompt + completion)
   - Number of requests

3. Show breakdown by model in a table:
   | Model | Cost | Requests | Tokens |

4. Show breakdown by operation type if available.

5. Also call `mcp__openrouter__openrouter_get_credits` to show remaining balance in context.

## Arguments
- `$ARGUMENTS` optionally contains a session ID to filter by
