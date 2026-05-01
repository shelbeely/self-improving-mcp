#!/usr/bin/env bash
# Bootstrap script for starting the self-improving-mcp server.
#
# This script is invoked by the MCP configuration saved in the repository's
# GitHub Settings (Settings → Copilot → Cloud agent → MCP configuration).
# It may run before copilot-setup-steps.yml, so bun may not be on PATH yet.
# The script installs bun if absent, ensures deps are installed, then starts
# the server.
#
# IMPORTANT: stdout is the MCP JSON-RPC channel. All setup output MUST go to
# stderr only, otherwise the MCP client will receive non-JSON data and fail
# the protocol handshake.
set -e

# Always run from the repository root regardless of where the script is invoked.
cd "$(dirname "$0")/.."

# Ensure bun's default install location is on PATH (covers curl-based installs).
export PATH="$HOME/.bun/bin:$PATH"

# Install Bun if not already available (all output → stderr).
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash >&2
fi

# Install dependencies if node_modules is absent (all output → stderr).
if [ ! -d "node_modules" ]; then
  bun install --frozen-lockfile >&2
fi

exec bun run src/server.ts
