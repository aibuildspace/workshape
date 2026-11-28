import { currentActor } from "@/lib/web-auth";
import { managementCsv } from "@/lib/management";
import { listManagedProcesses, WorkflowError } from "@/lib/workflow";

export async function GET() {
  const actor = await currentActor();
  if (!actor) return new Response("Sign in to export the management summary.", { status: 401 });
  try {
    return new Response(managementCsv(listManagedProcesses(actor)), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="workshape-management-summary.csv"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof WorkflowError && error.status === 404) return new Response("Management summary unavailable.", { status: 404 });
    throw error;
  }
}
