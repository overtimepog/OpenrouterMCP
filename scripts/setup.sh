#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== OpenRouter MCP Plugin Setup ==="

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed. Please install Node.js >= 20.0.0"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
echo "Node.js version: $NODE_VERSION"

# Check API key
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo ""
  echo "WARNING: OPENROUTER_API_KEY is not set."
  echo "Set it in your shell profile:"
  echo "  export OPENROUTER_API_KEY=sk-or-v1-your-key-here"
  echo ""
  echo "The plugin will not work without a valid API key."
  echo ""
fi

# Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# Build
echo "Building TypeScript..."
npm run build

# Verify
if [ -f "$PROJECT_DIR/dist/index.js" ]; then
  echo ""
  echo "Setup complete! dist/index.js is ready."
  echo "The plugin will auto-start when Claude Code loads."
else
  echo "ERROR: Build failed - dist/index.js not found"
  exit 1
fi
