/**
 * Smoke tests for the self-improving MCP server.
 *
 * These tests verify that:
 * 1. The server initialises without errors.
 * 2. All tools are registered with the expected names.
 * 3. Key utilities (safeReadFile, listFilesRecursive) behave correctly.
 */
import { describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/tools/index.js";
import { safeReadFile, listFilesRecursive, REPO_ROOT } from "../src/utils/fs.js";

// ── Server initialisation ───────────────────────────────────────────────────

describe("MCP server setup", () => {
  it("creates an McpServer instance without throwing", () => {
    expect(() => {
      const server = new McpServer(
        { name: "test-server", version: "0.0.1" },
        { capabilities: { tools: {} } }
      );
      registerAllTools(server);
    }).not.toThrow();
  });

  it("registers the expected set of tools", () => {
    const server = new McpServer(
      { name: "test-server", version: "0.0.1" },
      { capabilities: { tools: {} } }
    );
    registerAllTools(server);

    // Access internal registry via the McpServer's private property.
    // It is a plain object keyed by tool name.
    const registeredTools = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    const expectedTools = [
      "list_files",
      "read_file",
      "analyze_repo",
      "search_files",
      "validate_typescript",
      "run_tests",
      "check_dependencies",
      "diagnose_server",
      "suggest_improvements",
      "store_memory",
      "read_memory",
      "write_file",
      "edit_file",
      "delete_file",
      "get_tool_list",
      "list_tool_usage_examples",
    ];

    for (const name of expectedTools) {
      expect(name in registeredTools).toBe(true);
    }
    expect(Object.keys(registeredTools).length).toBe(expectedTools.length);
  });
});

// ── File utilities ───────────────────────────────────────────────────────────

describe("safeReadFile", () => {
  it("reads a known file successfully", async () => {
    const result = await safeReadFile("package.json");
    expect("content" in result).toBe(true);
    if ("content" in result) {
      expect(result.content).toContain("self-improving-mcp");
    }
  });

  it("rejects path traversal attempts", async () => {
    const result = await safeReadFile("../../etc/passwd");
    expect("error" in result).toBe(true);
  });

  it("returns an error for a non-existent file", async () => {
    const result = await safeReadFile("no-such-file.ts");
    expect("error" in result).toBe(true);
  });

  it("rejects binary file extensions", async () => {
    // .png is not in the allowed text extensions list
    const result = await safeReadFile("some-image.png");
    expect("error" in result).toBe(true);
  });
});

describe("listFilesRecursive", () => {
  it("returns a non-empty array for the repo root", async () => {
    const files = await listFilesRecursive();
    expect(files.length).toBeGreaterThan(0);
  });

  it("does not include node_modules", async () => {
    const files = await listFilesRecursive();
    const hasNodeModules = files.some((f) => f.path.startsWith("node_modules"));
    expect(hasNodeModules).toBe(false);
  });

  it("returns entries with the expected shape", async () => {
    const files = await listFilesRecursive();
    const first = files[0];
    expect(first).toHaveProperty("path");
    expect(first).toHaveProperty("size");
    expect(first).toHaveProperty("ext");
  });

  it("REPO_ROOT is an absolute path", () => {
    expect(REPO_ROOT.startsWith("/")).toBe(true);
  });
});
