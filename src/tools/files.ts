import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import {
  listFilesRecursive,
  safeReadFile,
  REPO_ROOT,
  TEXT_EXTENSIONS,
  MAX_FILE_BYTES,
} from "../utils/fs.js";

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
        "Path must be relative to the repo root. " +
        "Supports optional startLine/endLine (1-based) to return a specific line range — " +
        "the 128 KB size check is applied after slicing. " +
        "Binary files and files >128 KB (after any slice) are rejected.",
      inputSchema: {
        path: z.string().describe("Relative path to the file, e.g. src/server.ts"),
        startLine: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("First line to return (1-based, inclusive). Omit to start from the beginning."),
        endLine: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Last line to return (1-based, inclusive). Omit to read to end of file."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, startLine, endLine }) => {
      // Fast path: no line range — use existing safe helper
      if (startLine === undefined && endLine === undefined) {
        const result = await safeReadFile(path);
        if ("error" in result) {
          return {
            isError: true,
            content: [{ type: "text", text: result.error }],
          };
        }
        return { content: [{ type: "text", text: result.content }] };
      }

      // Line-range path: read raw, slice first, then size-check
      const normalized = normalize(path).replace(/^(\.\.\/|\/)+/, "");
      const abs = join(REPO_ROOT, normalized);
      if (!abs.startsWith(REPO_ROOT + "/") && abs !== REPO_ROOT) {
        return {
          isError: true,
          content: [{ type: "text", text: "Path escapes repository root." }],
        };
      }

      const ext = extname(normalized).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext) && ext !== "") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `File type "${ext}" is not a recognised text type. Use list_files to browse binary files.`,
            },
          ],
        };
      }

      let fileStat;
      try {
        fileStat = await stat(abs);
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: `File not found: ${normalized}` }],
        };
      }
      if (!fileStat.isFile()) {
        return {
          isError: true,
          content: [{ type: "text", text: `Not a file: ${normalized}` }],
        };
      }

      const raw = await readFile(abs, "utf-8");
      const lines = raw.split("\n");
      const start = (startLine ?? 1) - 1;
      const end = endLine ?? lines.length;
      const sliced = lines.slice(start, end).join("\n");

      if (sliced.length > MAX_FILE_BYTES) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Selected range too large (${sliced.length} bytes). Maximum is ${MAX_FILE_BYTES} bytes.`,
            },
          ],
        };
      }

      return { content: [{ type: "text", text: sliced }] };
    }
  );
}
