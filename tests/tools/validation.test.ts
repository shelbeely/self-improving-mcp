/**
 * Unit tests for the validation tools:
 *   validate_typescript, run_tests, check_dependencies.
 *
 * validate_typescript and run_tests invoke real subprocesses; we verify that
 * the handlers return the expected output shape and that the commands succeed
 * in the CI/development environment where deps are installed.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerValidationTools } from "../../src/tools/validation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

type ToolHandler = (
  args: Record<string, unknown>,
  extra?: unknown
) => Promise<ToolResult>;

type RegisteredTools = Record<string, { callback: ToolHandler }>;

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-validation", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerValidationTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].callback;
}

// ---------------------------------------------------------------------------
// validate_typescript
// ---------------------------------------------------------------------------

describe("validate_typescript tool", () => {
  it("returns a text result", async () => {
    const server = makeServer();
    const handler = getTool(server, "validate_typescript");
    const result = await handler({});
    expect(result.content[0].type).toBe("text");
  }, 30_000);

  it("result text contains a status indicator (✅ or ❌)", async () => {
    const server = makeServer();
    const handler = getTool(server, "validate_typescript");
    const result = await handler({});
    const text = result.content[0].text;
    expect(text.includes("✅") || text.includes("❌")).toBe(true);
  }, 30_000);

  it("reports no type errors on a valid codebase", async () => {
    const server = makeServer();
    const handler = getTool(server, "validate_typescript");
    const result = await handler({});
    expect(result.content[0].text).toContain("✅ TypeScript: no type errors.");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// run_tests
// ---------------------------------------------------------------------------

describe("run_tests tool", () => {
  it("returns a text result", async () => {
    const server = makeServer();
    const handler = getTool(server, "run_tests");
    const result = await handler({});
    expect(result.content[0].type).toBe("text");
  }, 60_000);

  it("result text contains a status indicator (✅ or ❌)", async () => {
    const server = makeServer();
    const handler = getTool(server, "run_tests");
    const result = await handler({});
    const text = result.content[0].text;
    expect(text.includes("✅") || text.includes("❌")).toBe(true);
  }, 60_000);

  it("reports passing tests on a healthy codebase", async () => {
    const server = makeServer();
    const handler = getTool(server, "run_tests");
    const result = await handler({});
    expect(result.content[0].text).toContain("✅ All tests passed.");
  }, 60_000);
});

// ---------------------------------------------------------------------------
// check_dependencies
// ---------------------------------------------------------------------------

describe("check_dependencies tool", () => {
  it("returns a text result", async () => {
    const server = makeServer();
    const handler = getTool(server, "check_dependencies");
    const result = await handler({});
    expect(result.content[0].type).toBe("text");
  });

  it("reports all dependencies installed when node_modules is present", async () => {
    const server = makeServer();
    const handler = getTool(server, "check_dependencies");
    const result = await handler({});
    // In CI / dev the deps should always be installed
    const text = result.content[0].text;
    expect(text).toContain("✅ All");
    expect(text).toContain("declared dependencies are installed.");
  });

  it("output mentions the count of declared dependencies", async () => {
    const server = makeServer();
    const handler = getTool(server, "check_dependencies");
    const result = await handler({});
    // The message includes the total count as a number
    expect(result.content[0].text).toMatch(/\d+ declared/);
  });
});
