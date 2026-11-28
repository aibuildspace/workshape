import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { accountById } from "@/lib/accounts";
import { allowsMcpOrigin, resourceMetadataPath, resourceUrl, verifyMcpToken } from "@/lib/mcp-auth";
import { mcpInstructions, mcpServerInfo, registerWorkshapeTools } from "@/lib/mcp-tools";

export const runtime = "nodejs";

const handler = createMcpHandler((server) => registerWorkshapeTools(server, (context) => {
  const actorId = context.http?.authInfo?.extra?.actorId;
  return typeof actorId === "string" ? accountById(actorId) : undefined;
}), { serverInfo: mcpServerInfo, instructions: mcpInstructions });

const authenticated = withMcpAuth(handler, verifyMcpToken, {
  required: true, requiredScopes: ["workshape:access"], resourceMetadataPath, resourceUrl,
});

async function endpoint(request: Request) {
  if (!allowsMcpOrigin(request)) return new Response(null, { status: 403 });
  return authenticated(request);
}

export { endpoint as GET, endpoint as POST, endpoint as DELETE };
