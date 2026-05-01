# self-improving-mcp — Repository Instructions

## What this repository is

A **Model Context Protocol (MCP) server** written in TypeScript that gives GitHub
Copilot cloud agent sessions structured access to this same repository — so the
agent can read, validate, write, and improve the server over time.

**Stack:** TypeScript (strict) · Bun ≥ 1.0 · Node.js 20 · `@modelcontextprotocol/sdk@1.29.0` · Zod 4

---

## Build & validate — always run in this order

```bash
bun install              # install / sync deps (run once, or after bun.lock changes)
bun run typecheck        # tsc --noEmit  — type errors only, no output files
bun test                 # full test suite via bun:test
bun run validate         # shortcut: typecheck + test (run before every PR)
bun run build            # emit compiled JS to dist/  (not needed for dev/test)
bun run dev              # start MCP server on stdio (for manual testing)
```

- **Always** `bun install` before anything else in a fresh clone.
- `bun run validate` is the gate: both typecheck and tests must pass before a PR is opened.
- `bun test` is safe to run repeatedly; a recursion guard prevents infinite loops when `run_tests` MCP tool is called from within a test.
- Tests live in `tests/` and mirror `src/tools/` one-to-one. Run a single file with `bun test tests/tools/files.test.ts`.

---

## Project layout

```
src/
  server.ts              Entry point — creates McpServer, registers all tools, stdio transport
  tools/
    index.ts             Aggregates all registerXxxTools() calls
    files.ts             list_files, read_file
    analysis.ts          analyze_repo, search_files
    validation.ts        validate_typescript, run_tests, check_dependencies
    diagnostics.ts       diagnose_server, suggest_improvements
    memory.ts            store_memory, read_memory
    write.ts             write_file, edit_file, delete_file
  utils/
    fs.ts                REPO_ROOT constant, safeReadFile(), listFilesRecursive()

tests/
  smoke.test.ts          Server instantiation + tool-registration counts
  tools/
    files.test.ts
    analysis.test.ts
    validation.test.ts
    diagnostics.test.ts
    memory.test.ts
    write.test.ts

docs/
  architecture.md        Full design doc, safety model, self-improvement loop

.github/
  copilot-instructions.md   ← this file
  agents/
    self-improver.agent.md  Custom agent profile for improvement sessions
  instructions/
    tools.instructions.md   Path-specific instructions for src/tools/**
    tests.instructions.md   Path-specific instructions for tests/**
  workflows/
    ci.yml                  push/PR: typecheck → test → server startup smoke-check
  copilot-setup-steps.yml   Pre-session: bun install + smoke-check
  start-mcp.sh              Bootstraps bun and starts the MCP server (stdio)
```

---

## Adding a new tool (the standard pattern)

1. Create `src/tools/<name>.ts` — export `register<Name>Tools(server: McpServer): void`.
2. Import and call it in `src/tools/index.ts`.
3. Add `tests/tools/<name>.test.ts` following the existing test files as a template.
4. Update the tools table in `README.md` and `docs/architecture.md`.
5. Run `bun run validate` — both checks must be green.

**Tool handler signature:**
```typescript
// Success
return { content: [{ type: "text", text: "..." }] };
// Error
return { isError: true, content: [{ type: "text", text: "..." }] };
```

**Annotations:** `{ readOnlyHint: true }` for reads; `{ readOnlyHint: false, destructiveHint: true }` for writes/deletes.

---

## MCP tools available in agent sessions

These tools are provided by this server. Call `read_memory` **first** in every session.

| Tool | Purpose |
|---|---|
| `read_memory` | **First call** — restore prior session context |
| `analyze_repo` | File counts, top dirs, total size — orientation |
| `list_files` | Browse by extension or subdirectory |
| `read_file` | Read any text file (≤128 KB) |
| `search_files` | Full-text search across the repo |
| `diagnose_server` | Health-check required files and configs |
| `suggest_improvements` | TODOs, test gaps, docs gaps |
| `validate_typescript` | Run `tsc --noEmit` |
| `run_tests` | Run `bun test` |
| `check_dependencies` | Verify node_modules matches package.json |
| `write_file` | Create or overwrite a file |
| `edit_file` | Find-and-replace exactly one occurrence |
| `delete_file` | Remove a file (critical files are blocklisted) |
| `store_memory` | **Last call** — persist key facts for next session |

Use the **GitHub MCP server** (available by default) for all remote git operations:
issues, PRs, commits, branches. This server handles local files only.

---

## Safety rules (do not violate)

- File operations are scoped to the repository clone — no path traversal.
- Writes into `node_modules`, `.git`, `dist` are rejected.
- `package.json`, `tsconfig.json`, and `src/server.ts` cannot be deleted.
- No arbitrary shell commands — only `tsc --noEmit` and `bun test` run via MCP.
- Never push commits or open PRs through this MCP server — use `report_progress` / `create_pull_request` from the GitHub MCP server.
