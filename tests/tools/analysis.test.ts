/**
 * Unit tests for the analysis tools: analyze_repo and search_files.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAnalysisTools } from "../../src/tools/analysis.js";

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
    { name: "test-analysis", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerAnalysisTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].handler;
}

// ---------------------------------------------------------------------------
// analyze_repo
// ---------------------------------------------------------------------------

describe("analyze_repo tool", () => {
  it("returns a text result", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
  });

  it("reports the repository root", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    expect(result.content[0].text).toContain("Repository root:");
  });

  it("reports total file count and size", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    const text = result.content[0].text;
    expect(text).toContain("Total files:");
    expect(text).toContain("Total size:");
  });

  it("includes a 'Files by extension' section", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    expect(result.content[0].text).toContain("Files by extension:");
  });

  it("shows .ts as one of the top extensions", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    expect(result.content[0].text).toContain(".ts");
  });

  it("includes a 'Top-level directories' section", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    expect(result.content[0].text).toContain("Top-level directories:");
  });

  it("lists src as a top-level directory", async () => {
    const server = makeServer();
    const handler = getTool(server, "analyze_repo");
    const result = await handler({});
    expect(result.content[0].text).toContain("src");
  });
});

// ---------------------------------------------------------------------------
// search_files
// ---------------------------------------------------------------------------

describe("search_files tool", () => {
  it("finds a pattern that exists in source files", async () => {
    const server = makeServer();
    const handler = getTool(server, "search_files");
    const result = await handler({ pattern: "McpServer" });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('match');
    expect(text).not.toBe(`No matches found for "McpServer".`);
  });

  it("reports no matches for a pattern that does not exist", async () => {
    const server = makeServer();
    const handler = getTool(server, "search_files");
    // Build pattern dynamically so this literal string doesn't appear in source and match itself
    const pattern = ["XYZZY", "NONEXISTENT", "TOKEN", "99Z"].join("_");
    const result = await handler({ pattern });
    expect(result.content[0].text).toContain("No matches found");
  });

  it("respects the extension filter", async () => {
    const server = makeServer();
    const handler = getTool(server, "search_files");
    // Search for a pattern only present in .ts files; restrict to .md
    const result = await handler({
      pattern: "registerAllTools",
      extension: ".md",
    });
    // registerAllTools is not in any .md file
    expect(result.content[0].text).toContain("No matches found");
  });

  it("returns match lines with file path and line number", async () => {
    const server = makeServer();
    const handler = getTool(server, "search_files");
    const result = await handler({ pattern: "REPO_ROOT" });
    const text = result.content[0].text;
    // Each match line should follow the format path:line: content
    const lines = text.split("\n").slice(1);
    for (const line of lines.filter(Boolean)) {
      expect(line).toMatch(/^[^:]+:\d+:/);
    }
  });

  it("is case-insensitive", async () => {
    const server = makeServer();
    const handler = getTool(server, "search_files");
    const upper = await handler({ pattern: "MCPSERVER" });
    const lower = await handler({ pattern: "mcpserver" });
    // Both should find the same number of matches
    const countOf = (text: string) => {
      const m = text.match(/^(\d+) match/);
      return m ? parseInt(m[1], 10) : 0;
    };
    expect(countOf(upper.content[0].text)).toBe(
      countOf(lower.content[0].text)
    );
  });

  it("finds patterns in JSON files when no extension filter is given", async () => {
    const server = makeServer();
    const handler = getTool(server, "search_files");
    const result = await handler({ pattern: "self-improving-mcp" });
    const text = result.content[0].text;
    // package.json contains this pattern
    expect(text).toContain("package.json");
  });
});
