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
| `read_file` | Read a text file with optional line-range (≤128 KB after slicing) |
| `analyze_repo` | Summary: file counts by extension, directories, total size |
| `search_files` | Full-text search across text files (case-insensitive) |
| `validate_typescript` | Run `tsc --noEmit` and return any type errors |
| `run_tests` | Run `bun test` and return results |
| `check_dependencies` | Verify all declared deps are installed |
| `diagnose_server` | Health-check: required files, valid configs, source count |
| `suggest_improvements` | Static analysis: flagged comments, test gaps, docs gaps |
| `store_memory` | Persist a key/value pair to `.github/agent-memory.json` |
| `read_memory` | Read one or all entries from the agent memory store |
| `write_file` | Create or overwrite a file in the local repo clone; supports dry-run |
| `edit_file` | Find-and-replace exactly one occurrence within a file |
| `delete_file` | Delete a file (blocklist protects critical files); supports dry-run |
| `get_tool_list` | Return a formatted table of all registered tools and descriptions |
| `list_tool_usage_examples` | Return `@example` JSDoc snippets from `src/tools/*.ts`, grouped by tool |

---

## Connecting to Copilot

### Copilot cloud agent (GitHub Settings)

MCP configuration for Copilot cloud agent is entered in **GitHub repository Settings**,
not via a file in the repo.

1. Go to **Settings → Copilot → Cloud agent** in this repository.
2. Paste the following JSON into the **MCP configuration** section:

```json
{
  "mcpServers": {
    "self-improving-mcp": {
      "type": "stdio",
      "command": "bash",
      "args": [".github/start-mcp.sh"],
      "tools": ["*"]
    }
  }
}
```

3. Click **Save MCP configuration**.

> **Note:** `.github/start-mcp.sh` bootstraps Bun and starts the server.
> The GitHub and Playwright MCP servers are enabled by default; no extra
> config is needed for those.

### VS Code / local

Add the following to your VS Code MCP settings:

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

This server works **alongside** the GitHub MCP server (enabled by default in
Copilot cloud agent sessions). Each handles a distinct concern:

- **This server** — local filesystem: read, write, validate, remember.
- **GitHub MCP server** — remote operations: issues, PRs, commits, code search.

**Workflow:**
1. Call `read_memory` first — restore context from the previous session.
2. Call `analyze_repo` + `diagnose_server` to orient.
3. Call `suggest_improvements` (and GitHub MCP for open issues/PRs).
4. Establish a baseline with `validate_typescript` + `run_tests`.
5. Make changes with `write_file` / `edit_file` / `delete_file`.
6. Validate again — revert via `write_file`/`edit_file` if anything breaks.
7. Call `store_memory` with `last_branch`, `last_change_summary`, `test_status`.
8. Use the GitHub MCP server (`report_progress` / `create_pull_request`) to ship.

See [`docs/architecture.md`](docs/architecture.md) for the full loop diagram.

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
- File writes, edits and deletes are scoped to the repo clone
- A blocklist prevents deleting `package.json`, `tsconfig.json`, `src/server.ts`
- Writes are blocked into `node_modules`, `.git`, `dist`
- Files are read through a path-traversal-safe helper
- `tsc` and `bun test` run with a hard 2-minute timeout and 64 KB output cap
- Git operations always go through the GitHub MCP server, never via MCP shell commands