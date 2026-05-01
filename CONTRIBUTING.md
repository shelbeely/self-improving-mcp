# Contributing to self-improving-mcp

Thank you for your interest in contributing! This document explains how to set up the development environment, run tests, and submit changes.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [Bun](https://bun.sh) | 1.0 |
| [Node.js](https://nodejs.org) | 20 (for compiled output) |
| [TypeScript](https://www.typescriptlang.org) | 5.4 (installed via devDependencies) |

---

## Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/shelbeely/self-improving-mcp.git
cd self-improving-mcp

# 2. Install dependencies
bun install

# 3. Verify everything is working
bun run validate   # type-check + full test suite
```

---

## Project Layout

```
src/
  server.ts          — Entry point
  tools/
    index.ts         — Aggregates all tool registrations
    files.ts         — list_files, read_file
    analysis.ts      — analyze_repo, search_files
    validation.ts    — validate_typescript, run_tests, check_dependencies
    diagnostics.ts   — diagnose_server, suggest_improvements
  utils/
    fs.ts            — Safe filesystem helpers

tests/
  smoke.test.ts      — Server setup and utility smoke tests
  tools/
    files.test.ts    — Tests for files tools
    analysis.test.ts — Tests for analysis tools
    validation.test.ts  — Tests for validation tools
    diagnostics.test.ts — Tests for diagnostics tools

docs/
  architecture.md    — Design, safety model, and tool reference
```

---

## Common Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start the MCP server (stdio transport) |
| `bun test` | Run the full test suite |
| `bun run typecheck` | Run `tsc --noEmit` |
| `bun run validate` | Typecheck + tests (full pre-PR check) |
| `bun run build` | Emit compiled JS to `dist/` |

---

## Adding a New Tool

1. Create `src/tools/<name>.ts` and export a `register<Name>Tools(server: McpServer): void` function.
2. Import and call it in `src/tools/index.ts`.
3. Add tests in `tests/tools/<name>.test.ts`.
4. Update the tools table in both `README.md` and `docs/architecture.md`.
5. Run `bun run validate` — all checks must pass before opening a PR.

---

## Running Tests

```bash
# Run all tests
bun test

# Run a specific test file
bun test tests/tools/files.test.ts

# Run tests matching a pattern
bun test --grep "list_files"
```

---

## Code Style

- TypeScript strict mode is enabled — avoid `any` where possible.
- No arbitrary shell execution; use the `runSafe()` helper in `validation.ts` for approved commands.
- Keep tool handlers pure and side-effect-free (read-only operations only).
- Add a JSDoc comment to every exported function.

---

## Submitting a Pull Request

1. Fork the repository and create a branch: `git checkout -b feat/my-feature`.
2. Make your changes following the code style guidelines above.
3. Run `bun run validate` — the full validation suite must pass.
4. Open a pull request against `main` and fill in the PR template.
5. A CI workflow will automatically run typecheck, tests, and a server startup smoke-check.

---

## Reporting Issues

Please use the GitHub issue templates when reporting bugs or requesting features. Include as much context as possible — reproduction steps, expected vs. actual behaviour, and relevant log output.
