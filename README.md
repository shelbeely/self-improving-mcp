# self-improving-mcp

A **self-improving MCP server** for GitHub Copilot cloud agent sessions.

This repository contains a [Model Context Protocol](https://modelcontextprotocol.io/) server
that gives Copilot structured, read-only access to this same repository — so Copilot can
understand, test, and safely improve the server over time.

---

## Quick Start

```bash
# Install dependencies (requires Bun ≥ 1.0)
bun install

# Type-check
bun run typecheck

# Run tests
bun test

# Start the MCP server (stdio transport)
bun run dev
```

---

## Available Tools

| Tool | Description |
|---|---|
| `list_files` | List repo files, filter by extension or subdirectory |
| `read_file` | Read a text file (≤128 KB, allowed extensions only) |
| `analyze_repo` | Summary: file counts by extension, directories, total size |
| `search_files` | Full-text search across text files (case-insensitive) |
| `validate_typescript` | Run `tsc --noEmit` and return any type errors |
| `run_tests` | Run `bun test` and return results |
| `check_dependencies` | Verify all declared deps are installed |
| `diagnose_server` | Health-check: required files, valid configs, source count |
| `suggest_improvements` | Static analysis: TODOs, test gaps, docs gaps |

---

## Connecting to Copilot

Add the following to your Copilot/VS Code MCP configuration:

```json
{
  "mcpServers": {
    "self-improving-mcp": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/self-improving-mcp/src/server.ts"]
    }
  }
}
```

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for:
- How the server works
- Safety boundaries (what the server can and cannot do)
- Full tools reference
- The self-improvement loop explained

---

## Self-Improvement Loop

The server **never** writes files or runs git commands.
All code changes are made by Copilot through normal file edits, validated afterward.

**Workflow:**
1. Copilot calls `analyze_repo` + `diagnose_server` to orient itself.
2. Calls `suggest_improvements` for automated ideas.
3. Establishes a baseline with `validate_typescript` + `run_tests`.
4. Makes changes using Copilot's built-in file editing.
5. Validates again — reverts if anything breaks.
6. Opens a focused PR.

See [`.github/agents/self-improver.md`](.github/agents/self-improver.md) for the
full custom agent profile.

---

## Development

```bash
bun run validate   # typecheck + test (full pre-PR check)
bun run build      # emit JS to dist/
bun run start      # run compiled server with Node.js
```

---

## Safety

- No arbitrary shell execution
- No file writes, deletes, or git operations via MCP
- Files are read through a path-traversal-safe helper
- `tsc` and `bun test` run with a hard 2-minute timeout and 64 KB output cap