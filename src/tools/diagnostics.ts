import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT, listFilesRecursive, safeReadFile } from "../utils/fs.js";

/** Register diagnostics tools. */
export function registerDiagnosticsTools(server: McpServer): void {
  // ── diagnose_server ─────────────────────────────────────────────────────────
  server.registerTool(
    "diagnose_server",
    {
      description:
        "Performs a health-check of the MCP server itself: " +
        "verifies source files exist, package.json is valid, and key config files are present. " +
        "Returns a structured health report.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const checks: { name: string; ok: boolean; detail: string }[] = [];

      // Check key source files exist
      const requiredFiles = [
        "src/server.ts",
        "src/tools/files.ts",
        "src/tools/analysis.ts",
        "src/tools/validation.ts",
        "src/tools/diagnostics.ts",
        "src/tools/memory.ts",
        "src/tools/write.ts",
        "src/utils/fs.ts",
        "package.json",
        "tsconfig.json",
      ];
      for (const file of requiredFiles) {
        try {
          await stat(join(REPO_ROOT, file));
          checks.push({ name: `file: ${file}`, ok: true, detail: "exists" });
        } catch {
          checks.push({ name: `file: ${file}`, ok: false, detail: "MISSING" });
        }
      }

      // Validate package.json is parseable
      try {
        const raw = await readFile(join(REPO_ROOT, "package.json"), "utf-8");
        const pkg = JSON.parse(raw) as Record<string, unknown>;
        checks.push({
          name: "package.json parse",
          ok: true,
          detail: `name=${pkg["name"]}, version=${pkg["version"]}`,
        });
      } catch (e) {
        checks.push({
          name: "package.json parse",
          ok: false,
          detail: String(e),
        });
      }

      // Validate tsconfig.json is parseable
      try {
        const raw = await readFile(join(REPO_ROOT, "tsconfig.json"), "utf-8");
        JSON.parse(raw);
        checks.push({ name: "tsconfig.json parse", ok: true, detail: "valid JSON" });
      } catch (e) {
        checks.push({ name: "tsconfig.json parse", ok: false, detail: String(e) });
      }

      // Count total source files
      const files = await listFilesRecursive(join(REPO_ROOT, "src"));
      checks.push({
        name: "src file count",
        ok: files.length > 0,
        detail: `${files.length} file(s) in src/`,
      });

      const allOk = checks.every((c) => c.ok);
      const rows = checks
        .map((c) => `  [${c.ok ? "✅" : "❌"}] ${c.name}: ${c.detail}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `MCP Server Health Check — ${allOk ? "ALL GOOD ✅" : "ISSUES FOUND ❌"}\n\n${rows}`,
          },
        ],
      };
    }
  );

  // ── suggest_improvements ────────────────────────────────────────────────────
  server.registerTool(
    "suggest_improvements",
    {
      description:
        "Analyses the MCP server source code and returns a list of concrete, " +
        "prioritised improvement suggestions. This is the primary tool for the " +
        "self-improvement loop. It does NOT make any changes.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const suggestions: string[] = [];

      const files = await listFilesRecursive(join(REPO_ROOT, "src"));
      const tsFiles = files.filter((f) => f.ext === ".ts");

      // 1. Check for TODO / FIXME comments
      const { readFile: rf } = await import("node:fs/promises");
      for (const file of tsFiles) {
        const content = await rf(join(REPO_ROOT, file.path), "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
            suggestions.push(
              `[todo] ${file.path}:${i + 1}: ${line.trim()}`
            );
          }
        }
      }

      // 2. Check test coverage (existence of test file per tool module)
      const toolFiles = tsFiles.filter((f) => f.path.startsWith("src/tools/"));
      const testFiles = await listFilesRecursive(join(REPO_ROOT, "tests"));
      const testNames = new Set(testFiles.map((f) => f.path));

      for (const tool of toolFiles) {
        const baseName = tool.path.split("/").pop()!.replace(/\.ts$/, "");
        const hasTest = [...testNames].some((t) => t.includes(baseName));
        if (!hasTest) {
          suggestions.push(
            `[coverage] No test file found for ${tool.path}. Consider adding tests/tools/${baseName}.test.ts.`
          );
        }
      }

      // 3. Check README exists and is non-trivial
      const readmeResult = await safeReadFile("README.md");
      if ("error" in readmeResult) {
        suggestions.push("[docs] README.md is missing.");
      } else if (readmeResult.content.split("\n").length < 20) {
        suggestions.push(
          "[docs] README.md is very short. Consider expanding it."
        );
      }

      // 4. Check for docs directory
      try {
        await stat(join(REPO_ROOT, "docs"));
      } catch {
        suggestions.push(
          "[docs] No docs/ directory found. Consider adding architecture docs."
        );
      }

      // 5. Check for CI workflow
      try {
        await stat(join(REPO_ROOT, ".github/workflows"));
      } catch {
        suggestions.push(
          "[ci] No .github/workflows found. Consider adding a CI pipeline."
        );
      }

      if (suggestions.length === 0) {
        suggestions.push(
          "No automated improvement suggestions at this time. " +
            "Consider reviewing the architecture docs for strategic improvements."
        );
      }

      return {
        content: [
          {
            type: "text",
            text: `Improvement suggestions (${suggestions.length}):\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
          },
        ],
      };
    }
  );
}
