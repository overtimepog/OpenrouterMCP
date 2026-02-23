#!/usr/bin/env bash
# SessionStart hook - auto-builds if dist/index.js is missing
# Output from this script is added as context Claude can see

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
  echo "OpenRouter MCP plugin: dist/index.js not found, building..."
  cd "$PROJECT_DIR" && npm install --silent && npm run build --silent 2>&1
  if [ -f "$PROJECT_DIR/dist/index.js" ]; then
    echo "OpenRouter MCP plugin: Build complete."
  else
    echo "OpenRouter MCP plugin: Build FAILED. Run 'bash scripts/setup.sh' manually."
  fi
fi
