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
  utils/
    fs.ts            — Safe filesystem helpers (REPO_ROOT, safeReadFile, listFilesRecursive)

tests/
  smoke.test.ts      — Server instantiation, tool registration, fs utility tests

docs/
  architecture.md    — This file

.github/
  copilot-setup-steps.yml  — Pre-session dependency install & smoke check
  agents/
    self-improver.md       — Custom Copilot agent profile for improvement sessions
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
| Write / delete files | ❌ | Copilot edits directly |
| Run arbitrary shell | ❌ | No shell injection surface |
| Push commits / open PRs | ❌ | Never via MCP |
| Rewrite own source | ❌ | Never via MCP |

The `runSafe()` helper in `src/tools/validation.ts` runs only the two
pre-approved, argument-free commands (`tsc --noEmit`, `bun test`) with a
hard timeout and output cap.

---

## Tools Reference

| Tool | Description |
|---|---|
| `list_files` | List repo files, filter by extension or subdirectory |
| `read_file` | Read a text file (≤128 KB, allowed extensions only) |
| `analyze_repo` | Summary: file counts by extension, top-level dirs, total size |
| `search_files` | Full-text search across text files (case-insensitive, ≤200 hits) |
| `validate_typescript` | Run `tsc --noEmit` and return errors |
| `run_tests` | Run `bun test` and return results |
| `check_dependencies` | Verify declared deps are installed in node_modules |
| `diagnose_server` | Health-check: required files, valid JSON configs, source count |
| `suggest_improvements` | Static analysis: TODOs, test coverage gaps, docs gaps |

---

## The Self-Improvement Loop

```
┌─ orient ──────────────────────────────────┐
│  analyze_repo + diagnose_server           │
└──────────────────┬────────────────────────┘
                   │
┌─ identify ───────▼────────────────────────┐
│  suggest_improvements + read open issues  │
└──────────────────┬────────────────────────┘
                   │
┌─ baseline ───────▼────────────────────────┐
│  validate_typescript + run_tests          │
└──────────────────┬────────────────────────┘
                   │
┌─ implement ──────▼────────────────────────┐
│  Copilot edits files directly             │
└──────────────────┬────────────────────────┘
                   │
┌─ verify ─────────▼────────────────────────┐
│  validate_typescript + run_tests (again)  │
│  ↩ revert if failures                     │
└──────────────────┬────────────────────────┘
                   │
┌─ document ───────▼────────────────────────┐
│  Update docs/architecture.md if needed   │
└──────────────────┬────────────────────────┘
                   │
                   ▼
             Open focused PR
```

---

## Extending the Server

To add a new tool:

1. Create `src/tools/<name>.ts` — export a `register<Name>Tools(server)` function.
2. Register it in `src/tools/index.ts`.
3. Add tests in `tests/<name>.test.ts`.
4. Update the tools table above and in `README.md`.
5. Run `bun run validate` to confirm everything passes.
