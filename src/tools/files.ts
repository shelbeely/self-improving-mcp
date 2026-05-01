import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { listFilesRecursive, safeReadFile, REPO_ROOT } from "../utils/fs.js";

/** Register all file-browsing tools onto the server. */
export function registerFilesTools(server: McpServer): void {
  // ── list_files ─────────────────────────────────────────────────────────────
  server.registerTool(
    "list_files",
    {
      description:
        "List files in the repository. Returns paths, sizes, and extensions. " +
        "Skips node_modules, .git, and dist. Optionally filter by extension.",
      inputSchema: {
        extension: z
          .string()
          .optional()
          .describe(
            'Filter to files with this extension, e.g. ".ts". Leave empty for all files.'
          ),
        subdir: z
          .string()
          .optional()
          .describe(
            'Restrict listing to this subdirectory relative to the repo root, e.g. "src".'
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ extension, subdir }) => {
      const { join, normalize } = await import("node:path");
      let dir = REPO_ROOT;
      if (subdir) {
        const safe = normalize(subdir).replace(/^(\.\.\/|\/)+/, "");
        dir = join(REPO_ROOT, safe);
      }
      const files = await listFilesRecursive(dir);
      const filtered = extension
        ? files.filter((f) => f.ext === extension)
        : files;

      const lines = filtered.map(
        (f) => `${f.path} (${f.ext || "no ext"}, ${f.size} bytes)`
      );
      return {
        content: [
          {
            type: "text",
            text:
              filtered.length === 0
                ? "No files found."
                : `${filtered.length} file(s):\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── read_file ───────────────────────────────────────────────────────────────
  server.registerTool(
    "read_file",
    {
      description:
        "Read the contents of a text file in the repository. " +
        "Path must be relative to the repo root. Binary and files >128 KB are rejected.",
      inputSchema: {
        path: z.string().describe("Relative path to the file, e.g. src/server.ts"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => {
      const result = await safeReadFile(path);
      if ("error" in result) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      return {
        content: [{ type: "text", text: result.content }],
      };
    }
  );
}
