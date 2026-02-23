---
name: or-chat
description: Chat with any AI model available through OpenRouter
arguments:
  - name: message
    description: Your message to send, optionally prefixed with model name like "gpt-4o: hello"
    required: true
user_facing: true
---

Send a message to an AI model via OpenRouter.

**CRITICAL: ALWAYS search for models first. Never hardcode or assume a model ID.**

## Instructions

1. Parse `$ARGUMENTS`:
   - If format is `model-hint: message` (e.g. "gpt-4o: explain quantum computing"), extract the hint and message separately
   - If no model hint, infer the best model category from the task (e.g. "coding" → search for coding models, "creative writing" → search for writing models)

2. **Always search for the best model first**:
   - Call `mcp__openrouter__openrouter_search_models` with relevant keywords based on the task or hint
   - Consider the task type: coding tasks need tool support, creative tasks need high quality, simple tasks can use cheaper models
   - Sort by relevance — prefer capable, recent models
   - Pick the top result that fits the task

3. Call `mcp__openrouter__openrouter_chat` with:
   - `model`: the model ID found from search (never a hardcoded value)
   - `messages`: `[{"role": "user", "content": "<the message>"}]`
   - `stream`: true

4. Display the response, noting which model was used and the session_id for follow-up.

5. Tell the user they can continue the conversation by providing the session_id.

## Arguments
- `$ARGUMENTS` contains the message (and optionally a model hint prefix like "gpt-4o: message")
