#!/usr/bin/env bash
# Bootstrap script for starting the self-improving-mcp server.
#
# This script is invoked by the MCP configuration saved in the repository's
# GitHub Settings (Settings → Copilot → Cloud agent → MCP configuration).
# It runs before copilot-setup-steps.yml, so bun may not be on PATH yet.
# The script installs bun if absent, ensures deps are installed, then starts
# the server.
set -e

# Install Bun if not already available
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

# Install dependencies if node_modules is absent
if [ ! -d "node_modules" ]; then
  bun install --frozen-lockfile
fi

exec bun run src/server.ts
