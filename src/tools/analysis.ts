import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { listFilesRecursive, REPO_ROOT } from "../utils/fs.js";

/** Register repo-analysis tools. */
export function registerAnalysisTools(server: McpServer): void {
  // ── analyze_repo ────────────────────────────────────────────────────────────
  server.registerTool(
    "analyze_repo",
    {
      description:
        "Summarise the repository structure: file counts per extension, " +
        "top-level directories, and total size. Good for orientation before " +
        "making improvements.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const files = await listFilesRecursive();

      // File counts per extension
      const byExt = new Map<string, number>();
      let totalBytes = 0;
      for (const f of files) {
        const key = f.ext || "(no ext)";
        byExt.set(key, (byExt.get(key) ?? 0) + 1);
        totalBytes += f.size;
      }

      // Top-level dirs
      const topDirs = new Set<string>();
      for (const f of files) {
        const parts = f.path.split("/");
        if (parts.length > 1) topDirs.add(parts[0]);
      }

      const extTable = [...byExt.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => `  ${ext.padEnd(14)} ${count}`)
        .join("\n");

      const text = [
        `Repository root: ${REPO_ROOT}`,
        `Total files: ${files.length}`,
        `Total size: ${(totalBytes / 1024).toFixed(1)} KB`,
        "",
        "Files by extension:",
        extTable,
        "",
        "Top-level directories:",
        [...topDirs]
          .sort()
          .map((d) => `  ${d}`)
          .join("\n"),
      ].join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  // ── search_files ────────────────────────────────────────────────────────────
  server.registerTool(
    "search_files",
    {
      description:
        "Search for a plain-text pattern across all text files in the repository. " +
        "Returns matching file paths and the lines that matched. " +
        "Case-insensitive. Limited to 200 matches to keep responses concise.",
      inputSchema: {
        pattern: z
          .string()
          .describe("Plain-text string to search for (case-insensitive)."),
        extension: z
          .string()
          .optional()
          .describe('Restrict search to files with this extension, e.g. ".ts".'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ pattern, extension }) => {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const TEXT_EXTS = new Set([
        ".ts", ".js", ".mts", ".mjs", ".json", ".md",
        ".yml", ".yaml", ".toml", ".txt", ".sh",
      ]);

      const files = await listFilesRecursive();
      const candidates = files.filter(
        (f) =>
          (extension ? f.ext === extension : TEXT_EXTS.has(f.ext)) &&
          f.size < 256 * 1024
      );

      const lowerPattern = pattern.toLowerCase();
      const matches: string[] = [];
      let matchCount = 0;

      for (const file of candidates) {
        if (matchCount >= 200) break;
        let content: string;
        try {
          content = await readFile(join(REPO_ROOT, file.path), "utf-8");
        } catch {
          continue;
        }

        const lines = content.split("\n");
        for (let i = 0; i < lines.length && matchCount < 200; i++) {
          if (lines[i].toLowerCase().includes(lowerPattern)) {
            matches.push(`${file.path}:${i + 1}: ${lines[i].trimEnd()}`);
            matchCount++;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text:
              matches.length === 0
                ? `No matches found for "${pattern}".`
                : `${matches.length} match(es) for "${pattern}":\n${matches.join("\n")}`,
          },
        ],
      };
    }
  );
}
