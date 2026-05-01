/**
 * Unit tests for write tools: write_file, edit_file, delete_file.
 *
 * All tests operate under a temporary subdirectory that is created and
 * cleaned up per-suite so the real repo source is never modified.
 */
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWriteTools } from "../../src/tools/write.js";
import { REPO_ROOT } from "../../src/utils/fs.js";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
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
    { name: "test-write", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );
  registerWriteTools(server);
  return server;
}

function getTool(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: RegisteredTools })
    ._registeredTools;
  return tools[name].handler;
}

/** Temp dir inside the repo used for all write/delete tests. */
const TMP_DIR = "tmp-write-tests";
const TMP_ABS = join(REPO_ROOT, TMP_DIR);

async function setupTmpDir(): Promise<void> {
  await mkdir(TMP_ABS, { recursive: true });
}

async function cleanTmpDir(): Promise<void> {
  if (existsSync(TMP_ABS)) {
    await rm(TMP_ABS, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

describe("write_file tool", () => {
  beforeEach(setupTmpDir);
  afterEach(cleanTmpDir);

  it("creates a new file with the given content", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const path = `${TMP_DIR}/hello.ts`;
    const result = await write({ path, content: "export const x = 1;" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Wrote");
    const written = await readFile(join(REPO_ROOT, path), "utf-8");
    expect(written).toBe("export const x = 1;");
  });

  it("overwrites an existing file", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const path = `${TMP_DIR}/overwrite.ts`;
    await write({ path, content: "original" });
    await write({ path, content: "updated" });
    const written = await readFile(join(REPO_ROOT, path), "utf-8");
    expect(written).toBe("updated");
  });

  it("creates parent directories automatically", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const path = `${TMP_DIR}/deep/nested/file.ts`;
    const result = await write({ path, content: "deep content" });
    expect(result.isError).toBeFalsy();
    const written = await readFile(join(REPO_ROOT, path), "utf-8");
    expect(written).toBe("deep content");
  });

  it("rejects path traversal attempts", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const result = await write({ path: "../../etc/evil.sh", content: "bad" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Rejected");
  });

  it("rejects writes to node_modules", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const result = await write({
      path: "node_modules/injected.js",
      content: "bad",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Rejected");
  });

  it("rejects writes to .git", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const result = await write({ path: ".git/config", content: "bad" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Rejected");
  });
});

// ---------------------------------------------------------------------------
// edit_file
// ---------------------------------------------------------------------------

describe("edit_file tool", () => {
  beforeEach(setupTmpDir);
  afterEach(cleanTmpDir);

  it("replaces exactly one occurrence of old_str", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const edit = getTool(server, "edit_file");
    const path = `${TMP_DIR}/edit-me.ts`;
    await write({ path, content: "const a = 1;\nconst b = 2;" });
    const result = await edit({ path, old_str: "const a = 1;", new_str: "const a = 99;" });
    expect(result.isError).toBeFalsy();
    const written = await readFile(join(REPO_ROOT, path), "utf-8");
    expect(written).toBe("const a = 99;\nconst b = 2;");
  });

  it("returns an error when old_str is not found", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const edit = getTool(server, "edit_file");
    const path = `${TMP_DIR}/not-found.ts`;
    await write({ path, content: "hello world" });
    const result = await edit({ path, old_str: "NOT_PRESENT", new_str: "replacement" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns an error when old_str matches more than once", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const edit = getTool(server, "edit_file");
    const path = `${TMP_DIR}/ambiguous.ts`;
    await write({ path, content: "foo\nfoo\nbar" });
    const result = await edit({ path, old_str: "foo", new_str: "baz" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("matches 2 occurrences");
  });

  it("returns an error for a non-existent file", async () => {
    const server = makeServer();
    const edit = getTool(server, "edit_file");
    const result = await edit({
      path: `${TMP_DIR}/no-such-file.ts`,
      old_str: "x",
      new_str: "y",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("rejects path traversal in path", async () => {
    const server = makeServer();
    const edit = getTool(server, "edit_file");
    const result = await edit({ path: "../../etc/passwd", old_str: "root", new_str: "hacked" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Rejected");
  });
});

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

describe("delete_file tool", () => {
  beforeEach(setupTmpDir);
  afterEach(cleanTmpDir);

  it("deletes a file that exists", async () => {
    const server = makeServer();
    const write = getTool(server, "write_file");
    const del = getTool(server, "delete_file");
    const path = `${TMP_DIR}/to-delete.ts`;
    await write({ path, content: "delete me" });
    expect(existsSync(join(REPO_ROOT, path))).toBe(true);
    const result = await del({ path });
    expect(result.isError).toBeFalsy();
    expect(existsSync(join(REPO_ROOT, path))).toBe(false);
  });

  it("returns an error when the file does not exist", async () => {
    const server = makeServer();
    const del = getTool(server, "delete_file");
    const result = await del({ path: `${TMP_DIR}/ghost.ts` });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("rejects deletion of package.json", async () => {
    const server = makeServer();
    const del = getTool(server, "delete_file");
    const result = await del({ path: "package.json" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("critical file");
  });

  it("rejects deletion of tsconfig.json", async () => {
    const server = makeServer();
    const del = getTool(server, "delete_file");
    const result = await del({ path: "tsconfig.json" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("critical file");
  });

  it("rejects deletion of src/server.ts", async () => {
    const server = makeServer();
    const del = getTool(server, "delete_file");
    const result = await del({ path: "src/server.ts" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("critical file");
  });

  it("rejects path traversal attempts", async () => {
    const server = makeServer();
    const del = getTool(server, "delete_file");
    const result = await del({ path: "../../etc/passwd" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Rejected");
  });

  it("rejects deletion inside node_modules", async () => {
    const server = makeServer();
    const del = getTool(server, "delete_file");
    const result = await del({ path: "node_modules/some-pkg/index.js" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Rejected");
  });
});
