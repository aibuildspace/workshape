import type { listManagedProcesses } from "./workflow";

type ManagedProcess = ReturnType<typeof listManagedProcesses>[number];

export type ManagementSignal = {
  processId: string; processName: string; priority: number; title: string; detail: string;
  href: string; action: string;
};

export function managementSignals(item: ManagedProcess, canPublish: boolean): ManagementSignal[] {
  const editor = `/processes/${item.id}/edit?from=manage`;
  const result: ManagementSignal[] = [];
  if (item.openQuestions) result.push({ processId: item.id, processName: item.name, priority: 0,
    title: `${item.openQuestions} open draft ${item.openQuestions === 1 ? "question" : "questions"}`,
    detail: "Record answers and update the relevant draft sections before publication.",
    href: `${editor}#draft-questions`, action: "Answer questions" });
  if (item.version === null) result.push({ processId: item.id, processName: item.name, priority: 1,
    title: "Draft not published", detail: canPublish ?
      "Review the form and decision path, then publish when ready." :
      "Finish the draft for the HR function owner to review and publish.",
    href: editor, action: "Review draft" });
  else if (item.hasUnpublishedChanges) result.push({ processId: item.id, processName: item.name, priority: 1,
    title: "Unpublished changes", detail: canPublish ?
      "Review the changed form and decision path before publishing." :
      "Review the draft and ask the HR function owner to publish it.",
    href: editor, action: "Review changes" });
  if (item.waiting48h) result.push({ processId: item.id, processName: item.name, priority: 2,
    title: `${item.waiting48h} ${item.waiting48h === 1 ? "case" : "cases"} waiting 48h`,
    detail: "These cases have not changed in two days. Assigned participants can act from their own work queues.",
    href: `/manage/${item.id}#management-current-status`, action: "View process health" });
  return result;
}

export function managementHighlights(rows: ManagedProcess[], canPublish: boolean) {
  return rows.flatMap((item) => managementSignals(item, canPublish).slice(0, 1))
    .sort((first, second) => first.priority - second.priority || first.processName.localeCompare(second.processName));
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function managementCsv(rows: ManagedProcess[]) {
  const header = ["Process", "Owner", "Version", "Publication state", "Open draft questions",
    "Total cases", "Active cases", "Waiting 48h", "Manager review", "HR review",
    "Waiting for information", "Approved", "Declined", "Needed clarification"];
  const lines = rows.map((item) => [item.name, item.ownerName, item.version ?? "",
    item.version === null ? "Draft" : item.hasUnpublishedChanges ? "Published with draft changes" : "Published",
    item.openQuestions, item.totalCases, item.activeCases, item.waiting48h, item.managerReview,
    item.hrReview, item.needsInformation, item.approved, item.declined, item.clarifiedCases]);
  return "\ufeff" + [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
