#!/usr/bin/env bash
# Bootstrap script for starting the self-improving-mcp server.
#
# Copilot evaluates .github/mcp.json before copilot-setup-steps.yml runs,
# so bun may not be on PATH yet. This script installs bun if absent,
# ensures deps are installed, then starts the server.
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
