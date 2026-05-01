# Architecture

## Overview

`self-improving-mcp` is a read-only MCP (Model Context Protocol) server that gives
GitHub Copilot cloud agent sessions structured access to this repository's own
source code, tests, and configuration.

Its primary purpose is to help Copilot **understand** and **safely improve** itself
over time — without ever letting the server directly modify files, run git commands,
or execute arbitrary shell code.

---

## Process Model

```
Copilot Cloud Agent Session
          │
          │  MCP (stdio)
          ▼
  self-improving-mcp server
          │
   read-only tools only
          │
    ┌─────▼──────┐
    │  Repo FS   │  (reads only — src/, tests/, docs/, config files)
    └────────────┘
```

The server communicates over **stdio** using the standard MCP protocol.
Copilot connects to it via the MCP client built into VS Code / Copilot cloud.

---

## Source Layout

```
src/
  server.ts          — Entry point: creates McpServer, registers tools, starts stdio transport
  tools/
    index.ts         — Aggregates all tool registrations
    files.ts         — list_files, read_file
    analysis.ts      — analyze_repo, search_files
    validation.ts    — validate_typescript, run_tests, check_dependencies
    diagnostics.ts   — diagnose_server, suggest_improvements
    memory.ts        — store_memory, read_memory
    write.ts         — write_file, edit_file, delete_file
    toollist.ts      — get_tool_list, list_tool_usage_examples
  utils/
    fs.ts            — Safe filesystem helpers (REPO_ROOT, safeReadFile, listFilesRecursive)

tests/
  smoke.test.ts            — Server instantiation, tool registration, fs utility tests
  tools/
    files.test.ts          — list_files, read_file tests
    analysis.test.ts       — analyze_repo, search_files tests
    validation.test.ts     — validate_typescript, run_tests, check_dependencies tests
    diagnostics.test.ts    — diagnose_server, suggest_improvements tests
    memory.test.ts         — store_memory, read_memory tests
    write.test.ts          — write_file, edit_file, delete_file tests
    index.test.ts          — tool index registration tests
    toollist.test.ts       — get_tool_list, list_tool_usage_examples tests

docs/
  architecture.md    — This file

.github/
  copilot-instructions.md  — Repository-wide custom instructions for Copilot
  agent-memory.json        — Persistent agent memory (gitignored)
  copilot-setup-steps.yml  — Pre-session dependency install & smoke check
  agents/
    self-improver.agent.md — Custom Copilot agent profile for improvement sessions
  instructions/
    tools.instructions.md  — Path-specific instructions for src/tools/**
    tests.instructions.md  — Path-specific instructions for tests/**
  workflows/
    ci.yml                 — GitHub Actions: typecheck → test → server startup check
```

---

## Safety Boundaries

| Capability | Allowed | Reason |
|---|---|---|
| Read repo files | ✅ | Core analysis function |
| Run `tsc --noEmit` | ✅ | Read-only type check |
| Run `bun test` | ✅ | Read-only validation |
| Write / overwrite files | ✅ | Via `write_file` / `edit_file` (local clone only) |
| Delete files | ✅ | Via `delete_file` (blocklist protects critical files) |
| Persist session memory | ✅ | Via `store_memory` / `read_memory` |
| Run arbitrary shell | ❌ | No shell injection surface |
| Push commits / open PRs | ❌ | Never via MCP — use `report_progress` |
| Rewrite own source unsafely | ❌ | Blocklist protects critical files |

The `runSafe()` helper in `src/tools/validation.ts` runs only the two
pre-approved, argument-free commands (`tsc --noEmit`, `bun test`) with a
hard timeout and output cap.

---

## Tools Reference

| Tool | Description |
|---|---|
| `list_files` | List repo files, filter by extension or subdirectory |
| `read_file` | Read a text file with optional line-range (≤128 KB after slicing) |
| `analyze_repo` | Summary: file counts by extension, top-level dirs, total size |
| `search_files` | Full-text search across text files (case-insensitive, ≤200 hits) |
| `validate_typescript` | Run `tsc --noEmit` and return errors |
| `run_tests` | Run `bun test` and return results |
| `check_dependencies` | Verify declared deps are installed in node_modules |
| `diagnose_server` | Health-check: required files, valid JSON configs, source count |
| `suggest_improvements` | Static analysis: flagged comments, test coverage gaps, docs gaps |
| `store_memory` | Persist a key/value pair to `.github/agent-memory.json` |
| `read_memory` | Read one or all entries from the agent memory store |
| `write_file` | Create or overwrite a file in the local repo clone; supports dry-run |
| `edit_file` | Find-and-replace exactly one occurrence within a file |
| `delete_file` | Delete a file (blocklist protects critical files); supports dry-run |
| `get_tool_list` | Return a formatted table of all registered tools and descriptions |
| `list_tool_usage_examples` | Return `@example` JSDoc snippets from `src/tools/*.ts`, grouped by tool |

---

## The Self-Improvement Loop

This server works **alongside** the GitHub MCP server (available by default in
Copilot cloud agent sessions). The division of responsibility is:

| Concern | Tool(s) |
|---|---|
| Read local source | `read_file`, `list_files`, `search_files` |
| Analyse the codebase | `analyze_repo`, `diagnose_server`, `suggest_improvements` |
| Validate changes locally | `validate_typescript`, `run_tests` |
| **Write** local files | `write_file`, `edit_file`, `delete_file` |
| **Persist** session context | `store_memory`, `read_memory` |
| Remote git / GitHub ops | GitHub MCP server (`create_pull_request`, etc.) |

```
┌─ orient ──────────────────────────────────────────┐
│  read_memory (first call — restore prior context) │
│  analyze_repo + diagnose_server                   │
└──────────────────┬────────────────────────────────┘
                   │
┌─ identify ───────▼────────────────────────────────┐
│  suggest_improvements                             │
│  GitHub MCP: list open issues / PRs               │
└──────────────────┬────────────────────────────────┘
                   │
┌─ baseline ───────▼────────────────────────────────┐
│  validate_typescript + run_tests                  │
└──────────────────┬────────────────────────────────┘
                   │
┌─ implement ──────▼────────────────────────────────┐
│  write_file / edit_file / delete_file             │
└──────────────────┬────────────────────────────────┘
                   │
┌─ verify ─────────▼────────────────────────────────┐
│  validate_typescript + run_tests (again)          │
│  ↩ revert via write_file/edit_file if failures   │
└──────────────────┬────────────────────────────────┘
                   │
┌─ persist ────────▼────────────────────────────────┐
│  store_memory: last_branch, last_change_summary,  │
│               test_status                         │
└──────────────────┬────────────────────────────────┘
                   │
┌─ ship ───────────▼────────────────────────────────┐
│  GitHub MCP: report_progress / create_pull_request│
└───────────────────────────────────────────────────┘
```

---

## Two Memory Layers

Copilot has two distinct memory systems that complement each other in this repo:

### 1. GitHub Copilot Memory (platform-level, automatic)

GitHub's native memory feature (currently in public preview) automatically
creates "memories" as Copilot works on a repository. Key properties:

- **Automatic** — Copilot deduces memories from its own activity; no agent action needed.
- **Validated** — each memory is stored with code citations and re-checked against the
  current branch before use; stale memories are discarded.
- **Ephemeral** — memories expire after 28 days unless re-validated.
- **Shared** — all Copilot-enabled users of the repository benefit from the same memory.
- **Platform-managed** — visible and deletable via **GitHub Settings → Copilot → Memory**.
- Used by Copilot cloud agent, code review, and CLI.

See [GitHub docs: Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory)
for details.

### 2. Agent session notes (`store_memory` / `read_memory`, this MCP server)

This server provides a complementary **explicit, agent-controlled** note store:

| Property | Value |
|---|---|
| Storage | `.github/agent-memory.json` (local repo clone) |
| Creation | Explicit — agent calls `store_memory` intentionally |
| Validation | None — values are stored and returned verbatim |
| Expiry | Never — persists until the agent deletes or overwrites a key |
| Scope | This MCP server session only |
| Managed by | The agent itself; visible in `.github/agent-memory.json` |

**Use case:** track work-in-progress state across sessions — e.g. `last_branch`,
`last_change_summary`, `test_status` — so the agent can resume work without
re-exploring the whole repo from scratch.

### How they work together

```
GitHub Copilot Memory (platform)          Agent session notes (this server)
────────────────────────────────          ─────────────────────────────────
Learns: "DB connections use X pattern"    Records: "last_branch = feat/memory"
Learns: "File A and B stay in sync"       Records: "test_status = all passing"
Auto-validated, 28-day TTL                Explicit, permanent until overwritten
Used by code review + cloud agent         Used by this MCP server only
```



To add a new tool:

1. Create `src/tools/<name>.ts` — export a `register<Name>Tools(server)` function.
2. Register it in `src/tools/index.ts`.
3. Add tests in `tests/<name>.test.ts`.
4. Update the tools table above and in `README.md`.
5. Run `bun run validate` to confirm everything passes.
