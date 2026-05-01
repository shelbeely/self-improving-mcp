/**
 * Unit tests for the files tools: list_files and read_file.
 *
 * Each test registers the tools onto a fresh McpServer, then invokes
 * the registered handler directly to verify its behaviour.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFilesTools } from "../../src/tools/files.js";

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
    { name: "test-files", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerFilesTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].handler;
}

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

describe("list_files tool", () => {
  it("lists all files when no filter is given", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_files");
    const result = await handler({});
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("file(s):");
    expect(result.content[0].text).toContain("package.json");
  });

  it("filters by extension correctly", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_files");
    const result = await handler({ extension: ".ts" });
    const text = result.content[0].text;
    // Every listed file should be a .ts file
    if (text !== "No files found.") {
      const lines = text.split("\n").slice(1); // skip "N file(s):" header
      for (const line of lines.filter(Boolean)) {
        expect(line).toContain(".ts");
      }
    }
  });

  it("restricts listing to a subdirectory", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_files");
    const result = await handler({ subdir: "src" });
    const text = result.content[0].text;
    expect(text).not.toBe("No files found.");
    // All paths should be relative and within src
    const lines = text.split("\n").slice(1);
    for (const line of lines.filter(Boolean)) {
      expect(line.startsWith("src/")).toBe(true);
    }
  });

  it("returns 'No files found.' for an extension with no matches", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_files");
    const result = await handler({ extension: ".rb" });
    expect(result.content[0].text).toBe("No files found.");
  });

  it("sanitises path-traversal attempts in subdir", async () => {
    const server = makeServer();
    const handler = getTool(server, "list_files");
    // Should not throw; the traversal is stripped
    const result = await handler({ subdir: "../../etc" });
    expect(result.isError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

describe("read_file tool", () => {
  it("reads a known text file successfully", async () => {
    const server = makeServer();
    const handler = getTool(server, "read_file");
    const result = await handler({ path: "package.json" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("self-improving-mcp");
  });

  it("reads a TypeScript source file", async () => {
    const server = makeServer();
    const handler = getTool(server, "read_file");
    const result = await handler({ path: "src/server.ts" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("McpServer");
  });

  it("returns an error for a non-existent file", async () => {
    const server = makeServer();
    const handler = getTool(server, "read_file");
    const result = await handler({ path: "does-not-exist.ts" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("rejects path traversal attempts", async () => {
    const server = makeServer();
    const handler = getTool(server, "read_file");
    const result = await handler({ path: "../../etc/passwd" });
    expect(result.isError).toBe(true);
  });

  it("rejects binary file extensions", async () => {
    const server = makeServer();
    const handler = getTool(server, "read_file");
    const result = await handler({ path: "image.png" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not a recognised text type");
  });

  it("reads a markdown file", async () => {
    const server = makeServer();
    const handler = getTool(server, "read_file");
    const result = await handler({ path: "README.md" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("self-improving-mcp");
  });
});
