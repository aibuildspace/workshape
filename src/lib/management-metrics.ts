export type ManagementCase = {
  id: string; createdAt: string; updatedAt: string;
  status: "manager_review" | "hr_review" | "needs_information" | "approved" | "declined";
};
export type ManagementEvent = { caseId: string; kind: string; at: string };

type Step = "manager" | "hr" | "information";
const stepLabels: Record<Step, string> = {
  manager: "Manager review", hr: "HR review", information: "Waiting for information",
};
export const managementPrivacyFloor = 5;

function safeCount(count: number) {
  return count === 0 || count >= managementPrivacyFloor ? count : null;
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

export function calculateManagementTrends(cases: ManagementCase[], events: ManagementEvent[], asOf: Date) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (5 - index), 1));
    return { key: monthKey(date.toISOString()), label: new Intl.DateTimeFormat("en", {
      month: "short", year: "numeric", timeZone: "UTC",
    }).format(date) };
  });
  const monthly = months.map((month) => ({ ...month,
    submitted: safeCount(cases.filter((item) => monthKey(item.createdAt) === month.key &&
      item.createdAt <= asOf.toISOString()).length),
    decided: safeCount(cases.filter((item) => (item.status === "approved" || item.status === "declined") &&
      monthKey(item.updatedAt) === month.key && item.updatedAt <= asOf.toISOString()).length),
  }));

  const eventsByCase = new Map<string, ManagementEvent[]>();
  for (const event of events) {
    if (!eventsByCase.has(event.caseId)) eventsByCase.set(event.caseId, []);
    eventsByCase.get(event.caseId)!.push(event);
  }
  const durations: Record<Step, number[]> = { manager: [], hr: [], information: [] };
  for (const item of cases) {
    if (item.status !== "approved" && item.status !== "declined") continue;
    if (item.updatedAt > asOf.toISOString()) continue;
    let stage: Step | null = "manager";
    let priorReview: "manager" | "hr" = "manager";
    let entered = Date.parse(item.createdAt);
    const caseDurations: Record<Step, number> = { manager: 0, hr: 0, information: 0 };
    const seen = new Set<Step>();
    for (const event of eventsByCase.get(item.id) ?? []) {
      const at = Date.parse(event.at);
      if (stage === null || !Number.isFinite(at) || at < entered) continue;
      if (event.kind === "Submitted") continue;
      let next: Step | null | undefined;
      if (event.kind === "Information requested" && stage !== "information") {
        priorReview = stage;
        next = "information";
      } else if (event.kind === "Information provided" && stage === "information") next = priorReview;
      else if (event.kind === "Manager approved and sent to HR" && stage === "manager") next = "hr";
      else if (event.kind === "Approved" || event.kind === "Declined") next = null;
      if (next === undefined) continue;
      caseDurations[stage] += at - entered;
      seen.add(stage);
      stage = next;
      entered = at;
    }
    for (const step of seen) durations[step].push(caseDurations[step]);
  }
  const steps = (Object.keys(stepLabels) as Step[]).map((step) => ({
    key: step, label: stepLabels[step], cases: safeCount(durations[step].length),
    averageHours: durations[step].length >= managementPrivacyFloor
      ? Math.round(durations[step].reduce((sum, value) => sum + value, 0) / durations[step].length / 3_600_000 * 10) / 10
      : null,
  }));
  return { monthly, steps, privacyFloor: managementPrivacyFloor };
}
