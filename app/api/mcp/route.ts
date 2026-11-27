import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { accountById, type Actor } from "@/lib/accounts";
import { allowsMcpOrigin, resourceMetadataPath, resourceUrl, verifyMcpToken } from "@/lib/mcp-auth";
import { listPublishedProcesses, publishedProcess, requestStatus, submitRequest, WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";

function execute(info: { extra?: Record<string, unknown> } | undefined, action: (actor: Actor) => object) {
  const actorId = info?.extra?.actorId;
  const actor = typeof actorId === "string" ? accountById(actorId) : undefined;
  try {
    if (!actor) throw new WorkflowError("Authentication is required.", 401);
    const result = action(actor);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  } catch (error) {
    if (!(error instanceof WorkflowError)) console.error("Workshape could not complete an MCP operation.");
    return { isError: true, content: [{ type: "text" as const,
      text: error instanceof WorkflowError ? error.message : "The operation could not be completed." }] };
  }
}

const handler = createMcpHandler((server) => {
  server.registerTool("list_processes", {
    title: "List published processes",
    description: "List the published processes available to the signed-in user.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (_args, context) => execute(context.http?.authInfo, () => ({
    processes: listPublishedProcesses().map((item) => ({
      id: item.id, version: item.version, name: item.definition.name, purpose: item.definition.purpose,
    })),
  })));

  server.registerTool("get_process", {
    title: "Get a published process",
    description: "Read the current process version and the field definitions required to submit a request.",
    inputSchema: z.object({ processId: z.uuid() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, ({ processId }, context) => execute(context.http?.authInfo, () => publishedProcess(processId)));

  server.registerTool("get_request_status", {
    title: "Get request status",
    description: "Read the status of a case the signed-in user may access. Returns status and assignment without submitted answers.",
    inputSchema: z.object({ requestId: z.uuid() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, ({ requestId }, context) => execute(context.http?.authInfo, (actor) => requestStatus(actor, requestId)));

  server.registerTool("submit_request", {
    title: "Submit a request",
    description: "Submit on behalf of the signed-in user after they confirm the answers. Reuse the same requestKey UUID when retrying the same submission.",
    inputSchema: z.object({ processId: z.uuid(), version: z.number().int().positive(),
      requestKey: z.uuid(), answers: z.record(z.string(), z.string()) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args, context) => execute(context.http?.authInfo, (actor) => submitRequest(actor, args)));
}, { serverInfo: { name: "workshape", version: "0.1.0" } });

const authenticated = withMcpAuth(handler, verifyMcpToken, {
  required: true, requiredScopes: ["workshape:access"], resourceMetadataPath, resourceUrl,
});

async function endpoint(request: Request) {
  if (!allowsMcpOrigin(request)) return new Response(null, { status: 403 });
  return authenticated(request);
}

export { endpoint as GET, endpoint as POST, endpoint as DELETE };
