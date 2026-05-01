/**
 * Unit tests for toollist tools: get_tool_list and list_tool_usage_examples.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerToolListTools } from "../../src/tools/toollist.js";

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

type RegisteredTools = Record<string, { handler: ToolHandler }>;

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-toollist", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerToolListTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].handler;
}

// ---------------------------------------------------------------------------
// get_tool_list
// ---------------------------------------------------------------------------

describe("get_tool_list tool", () => {
  it("returns a text result without error", async () => {
    const server = makeServer();
    const handler = getTool(server, "get_tool_list");
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
  });

  it("output contains a markdown table header", async () => {
    const server = makeServer();
    const handler = getTool(server, "get_tool_list");
    const result = await handler({});
    expect(result.content[0].text).toContain("| Tool | Description |");
  });

  it("lists core tool names", async () => {
    const server = makeServer();
    const handler = getTool(server, "get_tool_list");
    const result = await handler({});
    const text = result.content[0].text;
    expect(text).toContain("list_files");
    expect(text).toContain("read_file");
    expect(text).toContain("write_file");
    expect(text).toContain("edit_file");
    expect(text).toContain("delete_file");
    expect(text).toContain("get_tool_list");
    expect(text).toContain("list_tool_usage_examples");
  });

  it("each tool name is wrapped in backticks", async () => {
    const server = makeServer();
    const handler = getTool(server, "get_tool_list");
    const result = await handler({});
    expect(result.content[0].text).toContain("`list_files`");
    expect(result.content[0].text).toContain("`write_file`");
  });
});

// ---------------------------------------------------------------------------
// list_tool_usage_examples
// ---------------------------------------------------------------------------

describe("list_tool_usage_examples tool", () => {
  it("returns a text result without error", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_tool_usage_examples");
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
  });

  it("returns a helpful message when no @example comments exist", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_tool_usage_examples");
    const result = await handler({});
    const text = result.content[0].text;
    // Either it found examples, or it returns guidance
    const hasExamples = text.includes("###");
    const hasGuidance = text.includes("@example");
    expect(hasExamples || hasGuidance).toBe(true);
  });

  it("does not throw on the current codebase", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_tool_usage_examples");
    await expect(handler({})).resolves.toBeTruthy();
  });
});
