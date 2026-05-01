---
applyTo: "tests/**/*.test.ts"
---

## Test file conventions (`tests/`)

### Imports and structure

```typescript
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerXxxTools } from "../../src/tools/xxx.js";
```

### Helper pattern — every test file uses the same boilerplate

```typescript
type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
type ToolHandler = (args: Record<string, unknown>, extra?: unknown) => Promise<ToolResult>;
type RegisteredTools = Record<string, { handler: ToolHandler }>;

function makeServer(): McpServer {
  const server = new McpServer({ name: "test-xxx", version: "0.0.1" }, { capabilities: { tools: {} } });
  registerXxxTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  return (server as unknown as { _registeredTools: RegisteredTools })._registeredTools[name].handler;
}
```

### What to test for every tool

- **Happy path** — correct input returns the expected result.
- **Error path** — bad input returns `isError: true` with a useful message.
- **Edge cases** — empty input, path traversal attempts, file-not-found, ambiguous matches.

### Filesystem tests (write/memory tools)

- Use a `tmp-<suite>` subdirectory inside `REPO_ROOT` as the workspace.
- Create it in `beforeEach` and remove it with `rm -rf` in `afterEach`.
- Never leave files on disk when tests finish.

### Smoke test (`tests/smoke.test.ts`)

`tests/smoke.test.ts` asserts the **exact** count of registered tools via
`Object.keys(registeredTools).length`. Update this number whenever a tool is
added or removed.
