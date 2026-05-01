import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFilesTools } from "./files.js";
import { registerAnalysisTools } from "./analysis.js";
import { registerValidationTools } from "./validation.js";
import { registerDiagnosticsTools } from "./diagnostics.js";

/** Register all tools onto the server. */
export function registerAllTools(server: McpServer): void {
  registerFilesTools(server);
  registerAnalysisTools(server);
  registerValidationTools(server);
  registerDiagnosticsTools(server);
}
