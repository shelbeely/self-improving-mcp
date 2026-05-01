---
applyTo: "src/tools/**/*.ts"
---

## MCP tool file conventions (`src/tools/`)

Every file in this directory exports a single `register<Name>Tools(server: McpServer): void`
function that calls `server.registerTool()` for each tool it owns.

### registerTool signature

```typescript
server.registerTool(
  "tool_name",           // snake_case, unique across the server
  {
    description: "...", // used verbatim by the model — be precise and concise
    inputSchema: {       // Zod schema object (not z.object wrapper)
      param: z.string().describe("..."),
      optional: z.string().optional().describe("..."),
    },
    annotations: { readOnlyHint: true },   // or { readOnlyHint: false, destructiveHint: true }
  },
  async ({ param, optional }) => {
    // success
    return { content: [{ type: "text", text: "..." }] };
    // error
    return { isError: true, content: [{ type: "text", text: "error message" }] };
  }
);
```

### File operations

- Always resolve paths through `resolveRepoPath()` (defined in `write.ts`) or
  `safeReadFile()` / `listFilesRecursive()` from `src/utils/fs.ts`.
- Import `REPO_ROOT` from `../utils/fs.js` — never hard-code absolute paths.
- Use `node:fs/promises` for async file I/O; never use synchronous `fs` APIs in handlers.

### Imports

- Use `.js` extensions on all local imports (TypeScript ESM convention): `import { REPO_ROOT } from "../utils/fs.js"`.
- Import `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.
- Import Zod as `import * as z from "zod"`.

### After adding a tool

Register it in `src/tools/index.ts`, add tests in `tests/tools/<name>.test.ts`,
update the tool count in `tests/smoke.test.ts`, and add a row to the tools
tables in `README.md` and `docs/architecture.md`.
