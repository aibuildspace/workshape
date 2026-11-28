import { currentActor } from "@/lib/web-auth";
import { publishedProcess, WorkflowError } from "@/lib/workflow";

export async function GET(_request: Request, { params }: RouteContext<"/processes/[id]/export">) {
  const actor = await currentActor();
  if (!actor) return new Response("Sign in to export a process.", { status: 401 });
  const { id } = await params;
  let process;
  try { process = publishedProcess(id); }
  catch (error) {
    if (error instanceof WorkflowError && error.status === 404) return new Response("Process unavailable.", { status: 404 });
    throw error;
  }
  const body = JSON.stringify({ format: "workshape-process", version: 1, definition: process.definition }, null, 2) + "\n";
  return new Response(body, { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="workshape-process-${id.slice(0, 8)}.json"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
