---
name: or-credits
description: Check your OpenRouter account credit balance
arguments: []
user_facing: true
---

Check the current OpenRouter credit balance.

## Instructions

1. Call `mcp__openrouter__openrouter_get_credits` (no parameters needed).

2. Display the results clearly:
   - Available balance
   - Total credits purchased
   - Total usage
   - Usage percentage

3. If balance is low (below $1 or above 90% usage), warn the user.

## Arguments
No arguments needed.
