"use client";

import { needsHr, ruleLabel, type Draft } from "@/lib/process";

export function RequestOutcome({ definition, values, hrReviewerName, managerName }: {
  definition: Draft; values?: Record<string, string>; hrReviewerName: string | null; managerName?: string | null;
}) {
  const rule = definition.escalation;
  const answer = rule && values?.[rule.field];
  const selected = Boolean(answer);
  const escalates = selected && needsHr(definition, values ?? {});
  const reviewer = hrReviewerName ?? "an HR reviewer";
  return <section className="request-outcome" aria-labelledby="request-outcome-title" aria-live="polite">
    <h2 id="request-outcome-title">What happens next</h2>
    <p>{managerName ?? "The requester’s assigned manager"} reviews this request first. {rule ? selected ? escalates
      ? `If the manager approves, the request goes to ${reviewer} for the final decision.`
      : "If the manager approves, the request is complete."
      : `If ${ruleLabel(definition)}, manager approval sends the request to ${reviewer} for the final decision. Otherwise, manager approval completes it.`
      : "Manager approval completes the request."}</p>
  </section>;
}
