#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== OpenRouter MCP Plugin Setup ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed. Please install Node.js >= 20.0.0"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
echo "Node.js version: $NODE_VERSION"

# --- API Key Setup ---
detect_shell_profile() {
  local shell_name
  shell_name="$(basename "${SHELL:-/bin/bash}")"
  case "$shell_name" in
    zsh)
      echo "${HOME}/.zshrc"
      ;;
    bash)
      if [ -f "${HOME}/.bash_profile" ]; then
        echo "${HOME}/.bash_profile"
      else
        echo "${HOME}/.bashrc"
      fi
      ;;
    fish)
      echo "${HOME}/.config/fish/config.fish"
      ;;
    *)
      echo "${HOME}/.profile"
      ;;
  esac
}

setup_api_key() {
  echo ""
  echo "--- OpenRouter API Key ---"

  # If already set in environment, offer to keep it
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    local masked="${OPENROUTER_API_KEY:0:10}...${OPENROUTER_API_KEY: -4}"
    echo "API key found in environment: $masked"
    read -rp "Keep this key? [Y/n] " keep_key
    if [[ "$(echo "$keep_key" | tr '[:upper:]' '[:lower:]')" != "n" ]]; then
      echo "Keeping existing key."
      return 0
    fi
  fi

  # Prompt for key
  echo ""
  echo "Get your API key at: https://openrouter.ai/keys"
  echo ""
  while true; do
    read -rp "Enter your OpenRouter API key: " api_key

    # Allow empty to skip (with warning)
    if [ -z "$api_key" ]; then
      echo ""
      echo "WARNING: No API key provided. The plugin will not work without one."
      echo "You can set it later: export OPENROUTER_API_KEY=sk-or-v1-your-key"
      return 1
    fi

    # Basic format validation
    if [[ "$api_key" != sk-or-* ]]; then
      echo "That doesn't look like an OpenRouter key (expected sk-or-...)."
      read -rp "Use it anyway? [y/N] " use_anyway
      if [[ "$(echo "$use_anyway" | tr '[:upper:]' '[:lower:]')" != "y" ]]; then
        continue
      fi
    fi

    break
  done

  export OPENROUTER_API_KEY="$api_key"

  # Persist to shell profile
  local profile
  profile="$(detect_shell_profile)"
  echo ""
  echo "To persist your key across terminal sessions, it needs to be added"
  echo "to your shell profile: $profile"
  read -rp "Add to $profile? [Y/n] " add_profile

  if [[ "$(echo "$add_profile" | tr '[:upper:]' '[:lower:]')" != "n" ]]; then
    # Remove any existing OPENROUTER_API_KEY export to avoid duplicates
    if [ -f "$profile" ] && grep -q 'export OPENROUTER_API_KEY=' "$profile" 2>/dev/null; then
      # Use a temp file for portable sed in-place editing
      local tmpfile
      tmpfile="$(mktemp)"
      grep -v 'export OPENROUTER_API_KEY=' "$profile" > "$tmpfile"
      mv "$tmpfile" "$profile"
      echo "Replaced existing key in $profile"
    else
      echo "Adding key to $profile"
    fi

    echo "" >> "$profile"
    echo "# OpenRouter API key (added by OpenRouter MCP plugin setup)" >> "$profile"
    echo "export OPENROUTER_API_KEY=\"$api_key\"" >> "$profile"
    echo "Key saved to $profile"
  else
    echo ""
    echo "Skipped. Add this to your shell profile manually:"
    echo "  export OPENROUTER_API_KEY=\"$api_key\""
  fi

  return 0
}

setup_api_key

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# Build
echo "Building TypeScript..."
npm run build

# Verify build
if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
  echo "ERROR: Build failed - dist/index.js not found"
  exit 1
fi

# --- Done ---
echo ""
echo "=== Setup Complete ==="
echo ""
echo "  dist/index.js is ready."
if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  echo "  API key is configured."
else
  echo "  WARNING: No API key set. The plugin will not work until you set one."
fi
echo ""
echo "  The plugin will auto-start when Claude Code loads."
echo ""
