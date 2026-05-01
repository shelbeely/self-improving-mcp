import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT, listFilesRecursive } from "../utils/fs.js";

/** Matches JSDoc block comments. */
const DOC_BLOCK_RE = /\/\*\*([\s\S]*?)\*\//g;

/** Matches the tool name argument of a registerTool call. */
const REGISTER_TOOL_NAME_RE = /server\.registerTool\(\s*["']([^"']+)["']/;

/**
 * Maintainable table of all registered tools with one-line descriptions.
 * Update this list whenever a tool is added, removed, or renamed.
 */
const TOOL_TABLE = [
  ["list_files", "List repo files; filter by extension or subdirectory"],
  ["read_file", "Read a text file with optional line-range (≤128 KB after slicing)"],
  ["analyze_repo", "File counts by extension, top-level dirs, and total repo size"],
  ["search_files", "Full-text search across text files (case-insensitive, ≤200 hits)"],
  ["validate_typescript", "Run tsc --noEmit and return any type errors"],
  ["run_tests", "Run bun test and return full results"],
  ["check_dependencies", "Verify all declared deps are installed in node_modules"],
  ["diagnose_server", "Health-check: required files, valid configs, source count"],
  ["suggest_improvements", "Static analysis: flagged comments, test gaps, doc gaps, tool-listing gaps"],
  ["store_memory", "Persist a key/value pair to .github/agent-memory.json"],
  ["read_memory", "Read one or all entries from the agent memory store"],
  ["write_file", "Create or overwrite a file; supports dry-run"],
  ["edit_file", "Find-and-replace exactly one occurrence within a file"],
  ["delete_file", "Delete a file (blocklist protects critical files); supports dry-run"],
  ["get_tool_list", "Return a formatted table of all registered tools and their descriptions"],
  ["list_tool_usage_examples", "Return @example JSDoc snippets from src/tools/*.ts, grouped by tool"],
] as const;

/** Register tool-list tools onto the server. */
export function registerToolListTools(server: McpServer): void {
  // ── get_tool_list ────────────────────────────────────────────────────────────
  server.registerTool(
    "get_tool_list",
    {
      description:
        "Return a formatted table of all registered tools and their one-line descriptions.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const header = "| Tool | Description |\n|---|---|";
      const rows = TOOL_TABLE.map(([name, desc]) => `| \`${name}\` | ${desc} |`).join("\n");
      return {
        content: [{ type: "text", text: `${header}\n${rows}` }],
      };
    }
  );

  // ── list_tool_usage_examples ─────────────────────────────────────────────────
  server.registerTool(
    "list_tool_usage_examples",
    {
      description:
        "Return @example JSDoc comments from all src/tools/*.ts files, grouped by tool name. " +
        "If no JSDoc examples exist yet, explains where to add them.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const toolsDir = join(REPO_ROOT, "src", "tools");
      const files = await listFilesRecursive(toolsDir);
      const tsFiles = files.filter((f) => f.ext === ".ts");

      const examples: Record<string, string[]> = {};

      for (const file of tsFiles) {
        const src = await readFile(join(REPO_ROOT, file.path), "utf-8");
        DOC_BLOCK_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DOC_BLOCK_RE.exec(src)) !== null) {
          const block = m[1];
          if (!block.includes("@example")) continue;
          const exStart = block.indexOf("@example") + "@example".length;
          const exText = block
            .slice(exStart)
            .replace(/^\s*\* ?/gm, "")
            .trim();
          // Associate the example with the next registerTool call in the source
          const after = src.slice(
            m.index + m[0].length,
            m.index + m[0].length + 300
          );
          const nm = REGISTER_TOOL_NAME_RE.exec(after);
          const toolName = nm ? nm[1] : file.path;
          if (!examples[toolName]) examples[toolName] = [];
          examples[toolName].push(exText);
        }
      }

      if (Object.keys(examples).length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "No @example JSDoc comments found in src/tools/*.ts.\n\n" +
                "To add examples, place a JSDoc block with @example immediately before\n" +
                "each server.registerTool(...) call, for example:\n\n" +
                "/**\n" +
                " * @example\n" +
                " * // List all TypeScript files\n" +
                " * handler({ extension: '.ts' })\n" +
                " */\n" +
                "server.registerTool('list_files', ...)",
            },
          ],
        };
      }

      const sections = Object.entries(examples)
        .map(([tool, exs]) => `### ${tool}\n\n${exs.join("\n\n---\n\n")}`)
        .join("\n\n");

      return { content: [{ type: "text", text: sections }] };
    }
  );
}
