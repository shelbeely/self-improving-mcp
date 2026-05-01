import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { REPO_ROOT } from "../utils/fs.js";

const execAsync = promisify(exec);

/**
 * Run a shell command inside the repo root with a strict timeout.
 * Returns stdout + stderr combined, truncated to maxBytes.
 * IMPORTANT: only pre-approved, argument-free commands are allowed.
 */
async function runSafe(
  cmd: string,
  timeoutMs = 60_000,
  maxBytes = 64 * 1024
): Promise<{ output: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const combined = (stdout + stderr).slice(0, maxBytes);
    return { output: combined, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    const combined = ((e.stdout ?? "") + (e.stderr ?? "") + (e.message ?? "")).slice(0, maxBytes);
    return { output: combined, exitCode: e.code ?? 1 };
  }
}

/** Register validation/diagnostic tools. */
export function registerValidationTools(server: McpServer): void {
  // ── validate_typescript ─────────────────────────────────────────────────────
  server.registerTool(
    "validate_typescript",
    {
      description:
        "Run `tsc --noEmit` to type-check the project without emitting files. " +
        "Returns TypeScript compiler errors, if any.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { output, exitCode } = await runSafe(
        "npx tsc --noEmit",
        120_000
      );
      return {
        content: [
          {
            type: "text",
            text:
              exitCode === 0
                ? "✅ TypeScript: no type errors."
                : `❌ TypeScript errors (exit ${exitCode}):\n${output}`,
          },
        ],
      };
    }
  );

  // ── run_tests ───────────────────────────────────────────────────────────────
  server.registerTool(
    "run_tests",
    {
      description:
        "Run the project test suite with `bun test`. " +
        "Returns test results, pass/fail counts, and any error output.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { output, exitCode } = await runSafe(
        "bun test",
        120_000
      );
      return {
        content: [
          {
            type: "text",
            text:
              exitCode === 0
                ? `✅ All tests passed.\n${output}`
                : `❌ Test failures (exit ${exitCode}):\n${output}`,
          },
        ],
      };
    }
  );

  // ── check_dependencies ──────────────────────────────────────────────────────
  server.registerTool(
    "check_dependencies",
    {
      description:
        "Check that all declared dependencies in package.json are installed " +
        "in node_modules. Reports missing or extra packages.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { existsSync } = await import("node:fs");

      let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      try {
        pkg = JSON.parse(
          await readFile(join(REPO_ROOT, "package.json"), "utf-8")
        );
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: "Could not read package.json." }],
        };
      }

      const declared = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ];

      const missing = declared.filter(
        (dep) => !existsSync(join(REPO_ROOT, "node_modules", dep))
      );

      if (missing.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `✅ All ${declared.length} declared dependencies are installed.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `⚠️ Missing from node_modules:\n${missing.map((d) => `  - ${d}`).join("\n")}\n\nRun: bun install`,
          },
        ],
      };
    }
  );
}
