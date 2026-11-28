import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { managementSignals } from "@/lib/management";
import { requireActor } from "@/lib/web-auth";
import { managedClarificationReasons, managedProcess, managedProcessTrends, WorkflowError } from "@/lib/workflow";

function displayCount(value: number | null) {
  return value === null ? "Fewer than 5" : String(value);
}

export default async function ManagedProcessPage({ params }: PageProps<"/manage/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  let item;
  let trends;
  let reasons;
  try { item = managedProcess(actor, id); trends = managedProcessTrends(actor, id);
    reasons = managedClarificationReasons(actor, id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const statusRows = [
    ["Manager review", item.managerReview], ["HR review", item.hrReview],
    ["Waiting for information", item.needsInformation], ["Approved", item.approved], ["Declined", item.declined],
  ] as const;
  const signals = managementSignals(item, actor.role === "function_owner");
  return <Shell actor={actor} section="manage">
    <Link className="text-link back-link" href="/manage">← Management</Link>
    <header className="workspace-heading"><div><h1>{item.name}</h1><p className="muted">Owned by {item.ownerName} · {item.version === null ? "Draft" : `Published version ${item.version}`}</p></div>
      <Link className="button button-primary" href={`/processes/${item.id}/edit?from=manage`}>Open editor</Link></header>
    <div className="manage-summary" aria-label="Process summary">
      <div className="panel"><strong>{item.totalCases}</strong><span>Cases, all versions</span></div>
      <div className="panel"><strong>{item.activeCases}</strong><span>Active cases</span></div>
      <div className="panel"><strong>{item.waiting48h}</strong><span>Waiting 48h</span></div>
      <div className="panel"><strong>{item.clarifiedCases}</strong><span>Needed clarification</span></div>
    </div>
    <div className="manage-detail-grid">
      <section id="management-current-status" className="panel manage-detail-panel"><h2>Where cases are now</h2>
        <p className="muted">Current status across every version of this process. Counts do not grant access to individual cases.</p>
        <dl className="manage-status-list">{statusRows.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
        <p className="field-hint">Waiting 48h counts active cases with no update for at least two days; it is an attention signal.</p>
      </section>
      <section className="panel manage-detail-panel"><h2>Process upkeep</h2>
        <dl className="manage-status-list"><div><dt>Publication</dt><dd>{item.version === null ? "Draft" : item.hasUnpublishedChanges ? "Draft changes to review" : "Current"}</dd></div>
          <div><dt>Open draft questions</dt><dd>{item.openQuestions}</dd></div></dl>
        {signals.length ? <ol className="manage-guidance-list">{signals.map((signal) => <li key={signal.title}>
          <strong>{signal.title}</strong><p>{signal.detail}</p>
          <Link className="text-link" href={signal.href}>{signal.action} <span aria-hidden="true">→</span></Link>
        </li>)}</ol> : <p>No open draft questions, unpublished changes, or cases waiting 48 hours.</p>}
        {!signals.length && <div className="button-group"><Link className="button button-secondary" href={`/processes/${item.id}/edit?from=manage`}>Review process</Link></div>}
      </section>
    </div>
    <div className="manage-detail-grid manage-trends">
      <section className="panel manage-detail-panel" aria-labelledby="management-monthly-title">
        <h2 id="management-monthly-title">Activity by month</h2>
        <p className="muted">Requests submitted and decisions recorded in the last six UTC calendar months. A decision may happen in a later month than submission. Form visits and abandoned attempts are not counted here.</p>
        <div className="case-table-scroll"><table className="case-table manage-trend-table">
          <thead><tr><th scope="col">Month</th><th scope="col">Submitted</th><th scope="col">Decided</th></tr></thead>
          <tbody>{trends.monthly.map((month) => <tr key={month.key}><th scope="row">{month.label}</th>
            <td>{displayCount(month.submitted)}</td><td>{displayCount(month.decided)}</td></tr>)}</tbody>
        </table></div>
        <p className="field-hint">Months with one to four cases show “Fewer than 5”. Zero and larger counts are shown exactly.</p>
      </section>
      <section className="panel manage-detail-panel" aria-labelledby="management-step-title">
        <h2 id="management-step-title">Time in each step</h2>
        <p className="muted">Average elapsed calendar hours among completed cases, across all versions. Time waiting for information is separate from reviewer time; repeated visits to a step are added together.</p>
        <dl className="manage-status-list">{trends.steps.map((step) => <div key={step.key}><dt>{step.label}</dt>
          <dd>{step.averageHours === null ? step.cases === 0 ? "No completed cases" : "Fewer than 5 cases" :
            `${step.averageHours} h · ${step.cases} cases`}</dd></div>)}</dl>
        <p className="field-hint">Averages appear after five completed cases have passed through that step. They include evenings and weekends.</p>
      </section>
    </div>
    <section className="panel manage-detail-panel manage-reasons" aria-labelledby="management-reasons-title">
      <h2 id="management-reasons-title">Why clarification was requested</h2>
      <p className="muted">Distinct cases by reviewer-selected reason, across all versions. A case can appear in more than one reason. Notes and participant names are not included.</p>
      {item.clarifiedCases ? <dl className="manage-status-list">{reasons.map((reason) => <div key={reason.code}>
        <dt>{reason.label}</dt><dd>{displayCount(reason.cases)}</dd></div>)}</dl> :
        <p className="field-hint">No cases have needed clarification.</p>}
      {item.clarifiedCases > 0 && <p className="field-hint">Reason counts from one to four show “Fewer than 5”. Earlier events may not have a category.</p>}
    </section>
  </Shell>;
}
