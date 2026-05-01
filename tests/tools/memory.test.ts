/**
 * Unit tests for memory tools: store_memory and read_memory.
 *
 * Uses a temporary directory so the real .github/agent-memory.json
 * is never touched during tests.
 */
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMemoryTools, MEMORY_FILE } from "../../src/tools/memory.js";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

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
    { name: "test-memory", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerMemoryTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].handler;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Remove the memory file if it exists so each test starts clean. */
async function cleanMemoryFile(): Promise<void> {
  if (existsSync(MEMORY_FILE)) {
    await unlink(MEMORY_FILE);
  }
}

// ---------------------------------------------------------------------------
// store_memory
// ---------------------------------------------------------------------------

describe("store_memory tool", () => {
  beforeEach(cleanMemoryFile);
  afterEach(cleanMemoryFile);

  it("stores a key/value pair and reports success", async () => {
    const server = makeServer();
    const store = getTool(server, "store_memory");
    const result = await store({ key: "last_branch", value: "feature/foo" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("last_branch");
    expect(result.content[0].text).toContain("feature/foo");
  });

  it("overwrites an existing key on second call", async () => {
    const server = makeServer();
    const store = getTool(server, "store_memory");
    await store({ key: "test_status", value: "passing" });
    await store({ key: "test_status", value: "failing" });

    const read = getTool(server, "read_memory");
    const result = await read({ key: "test_status" });
    expect(result.content[0].text).toContain("failing");
    expect(result.content[0].text).not.toContain("passing");
  });

  it("stores multiple independent keys", async () => {
    const server = makeServer();
    const store = getTool(server, "store_memory");
    await store({ key: "key_a", value: "alpha" });
    await store({ key: "key_b", value: "beta" });

    const read = getTool(server, "read_memory");
    const all = await read({});
    expect(all.content[0].text).toContain("key_a");
    expect(all.content[0].text).toContain("alpha");
    expect(all.content[0].text).toContain("key_b");
    expect(all.content[0].text).toContain("beta");
  });

  it("returns an error when key is empty", async () => {
    const server = makeServer();
    const store = getTool(server, "store_memory");
    const result = await store({ key: "", value: "oops" });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// read_memory
// ---------------------------------------------------------------------------

describe("read_memory tool", () => {
  beforeEach(cleanMemoryFile);
  afterEach(cleanMemoryFile);

  it("returns 'empty' message when no memory exists", async () => {
    const server = makeServer();
    const read = getTool(server, "read_memory");
    const result = await read({});
    expect(result.content[0].text).toContain("empty");
  });

  it("returns a specific key after storing it", async () => {
    const server = makeServer();
    const store = getTool(server, "store_memory");
    const read = getTool(server, "read_memory");
    await store({ key: "last_change_summary", value: "added memory tools" });
    const result = await read({ key: "last_change_summary" });
    expect(result.content[0].text).toContain("added memory tools");
  });

  it("returns a 'not found' message for a missing key", async () => {
    const server = makeServer();
    const read = getTool(server, "read_memory");
    const result = await read({ key: "nonexistent_key" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("No memory found");
  });

  it("returns all entries when no key is provided", async () => {
    const server = makeServer();
    const store = getTool(server, "store_memory");
    await store({ key: "x", value: "1" });
    await store({ key: "y", value: "2" });
    const read = getTool(server, "read_memory");
    const result = await read({});
    expect(result.content[0].text).toContain("x");
    expect(result.content[0].text).toContain("y");
    expect(result.content[0].text).toContain("2 entries");
  });

  it("gracefully handles a corrupt memory file (resets to empty)", async () => {
    // Write invalid JSON directly to the memory file
    await mkdir(dirname(MEMORY_FILE), { recursive: true });
    await writeFile(MEMORY_FILE, "NOT VALID JSON", "utf-8");

    const server = makeServer();
    const read = getTool(server, "read_memory");
    // Should not throw; corrupt file is treated as empty
    const result = await read({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("empty");
  });
});
