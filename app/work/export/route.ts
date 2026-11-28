import { currentActor } from "@/lib/web-auth";
import { caseCsv, caseFilters, caseRowsForView } from "@/lib/case-table";
import { listCases } from "@/lib/workflow";

export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response("Sign in to export cases.", { status: 401 });
  const cases = listCases(actor);
  const canReview = actor.role !== "employee" || cases.some((item) => !item.needsAction && !item.isRequester);
  const url = new URL(request.url);
  const filters = caseFilters({ view: url.searchParams.get("view") ?? undefined,
    q: url.searchParams.get("q") ?? undefined, status: url.searchParams.get("status") ?? undefined }, canReview);
  const rows = caseRowsForView(cases, filters);
  return new Response(caseCsv(rows), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="workshape-${filters.view}-cases.csv"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
