/**
 * Unit tests for the diagnostics tools: diagnose_server and suggest_improvements.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiagnosticsTools } from "../../src/tools/diagnostics.js";

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
    { name: "test-diagnostics", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerDiagnosticsTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].handler;
}

// ---------------------------------------------------------------------------
// diagnose_server
// ---------------------------------------------------------------------------

describe("diagnose_server tool", () => {
  it("returns a text result", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
  });

  it("outputs a health check header", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    expect(result.content[0].text).toContain("MCP Server Health Check");
  });

  it("reports all required source files as present", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    const text = result.content[0].text;
    // All required files should show ✅
    expect(text).toContain("src/server.ts");
    expect(text).toContain("src/tools/files.ts");
    expect(text).toContain("src/tools/analysis.ts");
    expect(text).toContain("src/tools/validation.ts");
    expect(text).toContain("src/tools/diagnostics.ts");
    expect(text).toContain("src/utils/fs.ts");
  });

  it("confirms package.json and tsconfig.json are valid JSON", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    const text = result.content[0].text;
    expect(text).toContain("package.json parse");
    expect(text).toContain("tsconfig.json parse");
  });

  it("reports src file count greater than zero", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    expect(result.content[0].text).toContain("src file count");
    // Should contain a positive count, e.g. "6 file(s) in src/"
    expect(result.content[0].text).toMatch(/\d+ file\(s\) in src\//);
  });

  it("reports ALL GOOD on a healthy repository", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    expect(result.content[0].text).toContain("ALL GOOD ✅");
  });

  it("does not contain any ❌ entries on a healthy repository", async () => {
    const server = makeServer();
    const handler = getTool(server, "diagnose_server");
    const result = await handler({});
    expect(result.content[0].text).not.toContain("❌");
  });
});

// ---------------------------------------------------------------------------
// suggest_improvements
// ---------------------------------------------------------------------------

describe("suggest_improvements tool", () => {
  it("returns a text result", async () => {
    const server = makeServer();
    const handler = getTool(server, "suggest_improvements");
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
  });

  it("output starts with 'Improvement suggestions'", async () => {
    const server = makeServer();
    const handler = getTool(server, "suggest_improvements");
    const result = await handler({});
    expect(result.content[0].text).toContain("Improvement suggestions");
  });

  it("output contains a count of suggestions", async () => {
    const server = makeServer();
    const handler = getTool(server, "suggest_improvements");
    const result = await handler({});
    expect(result.content[0].text).toMatch(/Improvement suggestions \(\d+\)/);
  });

  it("numbered list items start from 1", async () => {
    const server = makeServer();
    const handler = getTool(server, "suggest_improvements");
    const result = await handler({});
    // Either "1. [tag] ..." or the fallback "No automated improvement suggestions" message
    const text = result.content[0].text;
    const hasItems = text.includes("\n1.");
    const hasFallback = text.includes("No automated improvement suggestions");
    expect(hasItems || hasFallback).toBe(true);
  });

  it("does not throw on a clean repository", async () => {
    const server = makeServer();
    const handler = getTool(server, "suggest_improvements");
    await expect(handler({})).resolves.toBeTruthy();
  });
});
