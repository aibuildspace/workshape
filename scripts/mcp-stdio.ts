import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { actorForMcpToken } from "../src/lib/accounts";
import { mcpInstructions, mcpServerInfo, registerWorkshapeTools } from "../src/lib/mcp-tools";

// Desktop clients can launch this from any working directory.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

function tokenFromEnvironment() {
  if (process.env.WORKSHAPE_MCP_TOKEN) return process.env.WORKSHAPE_MCP_TOKEN;
  const file = process.env.WORKSHAPE_MCP_TOKEN_FILE;
  if (!file) return;
  const fileInfo = statSync(file);
  if (process.platform !== "win32" && (fileInfo.mode & 0o077) !== 0) {
    throw new Error("The MCP token file must be readable only by its owner (mode 600).");
  }
  return readFileSync(file, "utf8").trim();
}

try {
  if (process.env.WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS !== "1" || process.env.WORKSHAPE_PUBLIC_URL ||
    process.env.MCP_OAUTH_ISSUER || process.env.MCP_OAUTH_JWKS_URL) {
    throw new Error("Local MCP tokens must be enabled without a public OAuth deployment.");
  }
  const token = tokenFromEnvironment();
  if (!token || !actorForMcpToken(token)) throw new Error("A valid participant MCP token is required.");
  serveStdio(() => {
    const server = new McpServer(mcpServerInfo, { instructions: mcpInstructions });
    // Recheck token expiry and the mapped account on every tool call.
    registerWorkshapeTools(server, () => actorForMcpToken(token));
    return server;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not start the Workshape MCP server.");
  process.exitCode = 1;
}
