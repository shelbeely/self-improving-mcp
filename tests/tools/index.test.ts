/**
 * Unit tests for the tool index: registerAllTools.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../src/tools/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RegisteredTools = Record<string, { handler: unknown }>;

function makeServer(): McpServer {
  return new McpServer(
    { name: "test-index", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
}

function getTools(server: McpServer): RegisteredTools {
  return (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
}

// ---------------------------------------------------------------------------
// registerAllTools
// ---------------------------------------------------------------------------

describe("registerAllTools", () => {
  it("registers tools onto the server without throwing", () => {
    expect(() => {
      const server = makeServer();
      registerAllTools(server);
    }).not.toThrow();
  });

  it("registers at least one tool", () => {
    const server = makeServer();
    registerAllTools(server);
    expect(Object.keys(getTools(server)).length).toBeGreaterThan(0);
  });

  it("includes all core tool names", () => {
    const server = makeServer();
    registerAllTools(server);
    const names = Object.keys(getTools(server));
    const required = [
      "list_files",
      "read_file",
      "analyze_repo",
      "search_files",
      "write_file",
      "edit_file",
      "delete_file",
      "diagnose_server",
      "suggest_improvements",
      "store_memory",
      "read_memory",
      "validate_typescript",
      "run_tests",
      "check_dependencies",
      "get_tool_list",
      "list_tool_usage_examples",
    ];
    for (const name of required) {
      expect(names).toContain(name);
    }
  });

  it("calling twice on different servers does not bleed state", () => {
    const s1 = makeServer();
    const s2 = makeServer();
    registerAllTools(s1);
    registerAllTools(s2);
    expect(Object.keys(getTools(s1)).length).toBe(
      Object.keys(getTools(s2)).length
    );
  });
});
