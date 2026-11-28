import { processTitle } from "./process";
import { statuses, type listCases } from "./workflow";

type CaseRow = ReturnType<typeof listCases>[number];
export type CaseView = "assigned" | "mine" | "history";
export type CaseFilters = { view: CaseView; query: string; status: keyof typeof statuses | "all" };

export function caseFilters(input: { view?: string | string[]; q?: string | string[]; status?: string | string[] },
  canReview: boolean): CaseFilters {
  const view = input.view === "mine" ? "mine" : input.view === "history" && canReview ? "history" : "assigned";
  const query = typeof input.q === "string" ? input.q.trim().slice(0, 100) : "";
  const status = typeof input.status === "string" && Object.hasOwn(statuses, input.status)
    ? input.status as keyof typeof statuses : "all";
  return { view, query, status };
}

export function caseRowsForView(cases: CaseRow[], filters: CaseFilters) {
  const query = filters.query.toLocaleLowerCase();
  return cases.filter((item) => {
    if (filters.view === "assigned" && !item.needsAction) return false;
    if (filters.view === "mine" && !item.isRequester) return false;
    if (filters.view === "history" && (item.needsAction || item.isRequester)) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    return !query || [item.id, processTitle(item.name), item.requesterName, item.assignedName ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function caseCsv(rows: CaseRow[]) {
  const header = ["Case ID", "Process", "Requested by", "Status", "Assigned to", "Updated at"];
  const lines = rows.map((item) => [item.id, processTitle(item.name), item.requesterName,
    statuses[item.status], item.assignedName ?? "", item.updatedAt]);
  return "\ufeff" + [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
