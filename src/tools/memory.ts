import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { REPO_ROOT } from "../utils/fs.js";

/** Absolute path to the persistent agent memory file. */
export const MEMORY_FILE = join(REPO_ROOT, ".github", "agent-memory.json");

/** Read the memory store, returning an empty object on missing or corrupt file. */
async function readStore(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(MEMORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Missing file or corrupt JSON — start fresh
  }
  return {};
}

/** Persist the memory store to disk, creating parent directories as needed. */
async function writeStore(store: Record<string, string>): Promise<void> {
  await mkdir(dirname(MEMORY_FILE), { recursive: true });
  await writeFile(MEMORY_FILE, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

/** Register memory tools onto the server. */
export function registerMemoryTools(server: McpServer): void {
  // ── store_memory ────────────────────────────────────────────────────────────
  server.registerTool(
    "store_memory",
    {
      description:
        "Persist a key/value pair in the agent memory store " +
        "(.github/agent-memory.json). " +
        "Call this at the END of every session to save facts such as " +
        "last_branch, last_change_summary, or test_status. " +
        "Works alongside the GitHub MCP server — use GitHub tools for remote " +
        "operations and this tool for local session context.",
      inputSchema: {
        key: z.string().describe("Memory key, e.g. \"last_branch\"."),
        value: z.string().describe("Value to associate with the key."),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ key, value }) => {
      if (!key.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: "key must not be empty." }],
        };
      }
      const store = await readStore();
      store[key] = value;
      await writeStore(store);
      return {
        content: [{ type: "text", text: `✅ Stored memory: ${key} = ${JSON.stringify(value)}` }],
      };
    }
  );

  // ── read_memory ─────────────────────────────────────────────────────────────
  server.registerTool(
    "read_memory",
    {
      description:
        "Read from the agent memory store (.github/agent-memory.json). " +
        "Call this as the FIRST tool in every new session to re-orient " +
        "without re-exploring the whole repo. " +
        "Omit `key` to return all stored entries.",
      inputSchema: {
        key: z
          .string()
          .optional()
          .describe("Specific key to retrieve. Omit to return all entries."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ key }) => {
      const store = await readStore();

      if (key !== undefined) {
        if (key in store) {
          return {
            content: [{ type: "text", text: `${key} = ${JSON.stringify(store[key])}` }],
          };
        }
        return {
          content: [{ type: "text", text: `No memory found for key: ${key}` }],
        };
      }

      const entries = Object.entries(store);
      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: "Memory store is empty." }],
        };
      }
      const lines = entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join("\n");
      return {
        content: [{ type: "text", text: `Agent memory (${entries.length} entries):\n${lines}` }],
      };
    }
  );
}
