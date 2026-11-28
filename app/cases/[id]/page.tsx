import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTimestamp, Status } from "@/components/case-display";
import { CaseDelegationForm, RevokeCaseDelegation } from "@/components/case-delegation";
import { ReviewForm } from "@/components/forms";
import { Shell } from "@/components/shell";
import { groupCaseHistory } from "@/lib/case-history";
import { needsHr, processTitle, type Draft } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { caseDelegationCandidates, caseDetail, statuses, suggestedProcesses, WorkflowError } from "@/lib/workflow";

export default async function CasePage({ params, searchParams }: PageProps<"/cases/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const { from, return: returnQuery } = await searchParams;
  let item;
  try { item = caseDetail(actor, id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const lastEvent = item.events.at(-1);
  const delegationCandidates = item.canDelegate ? caseDelegationCandidates(actor, id) : [];
  const nextProcesses = item.isRequester && item.status === "approved" ? suggestedProcesses(item.processId) : [];
  const returnView = from === "home" || from === "assigned" || from === "mine" || from === "history" ? from : item.isRequester ? "mine" : "assigned";
  const rawReturn = typeof returnQuery === "string" && returnQuery.length <= 300 ? new URLSearchParams(returnQuery) : new URLSearchParams();
  const backParams = new URLSearchParams();
  if (returnView !== "home" && returnView !== "assigned") backParams.set("view", returnView);
  const query = rawReturn.get("q")?.trim().slice(0, 100);
  const status = rawReturn.get("status");
  if (query) backParams.set("q", query);
  if (status && Object.hasOwn(statuses, status)) backParams.set("status", status);
  const savedReturn = backParams.toString();
  const backHref = returnView === "home" ? "/" : `/work${savedReturn ? `?${savedReturn}` : ""}`;
  const backLabel = returnView === "home" ? "Home" : returnView === "mine" ? "My requests" : returnView === "history" ? "Review cases" : "Work queue";
  const sendsToHr = item.status === "manager_review" && needsHr(item.definition, item.answers);
  const history = groupCaseHistory(item.events).toReversed();
  return <Shell actor={actor} section="work">
    <Link href={backHref} className="text-link back-link">← {backLabel}</Link>
    <header className="case-heading">
      <div className="case-title"><h1>{processTitle(item.name)}</h1><Status value={item.status} /></div>
      <dl className="case-meta">
        <div><dt>Requested by</dt><dd>{item.requesterName}</dd></div>
        {item.assignedName && <div><dt>Assigned to</dt><dd>{item.canRespond || item.canReview ? "You" : item.assignedName}</dd></div>}
        <div><dt>Process version</dt><dd>{item.version}</dd></div>
      </dl>
    </header>
    <div className="case-layout">
      <div className="panel case-record">
        {item.status !== "approved" && item.status !== "declined" && <section className="case-section case-next-step">
          <h2>Next step</h2>
          {item.status === "needs_information" ? <>
            <p>{item.canRespond ? "You need to answer the reviewer’s question. Review your submitted answers below, correct any that changed, then send the information." :
              `Waiting for ${item.assignedName ?? "the requester"} to provide information. The case then returns for review.`}</p>
            {lastEvent?.kind === "Information requested" && <blockquote className="case-question">
              {lastEvent.clarificationReason && <p className="field-hint">{lastEvent.clarificationReason}</p>}
              <p>{lastEvent.note}</p><footer>Asked by {lastEvent.actor_name}</footer>
            </blockquote>}
          </> : item.canReview ? <p>{item.status === "manager_review" ?
            sendsToHr ? `Your manager decision is next. Approval sends this request to ${item.hrReviewerName ?? "HR"} for a final decision.` :
              "Your manager decision is next. Approval completes this request." :
            "Your final HR decision is next."}</p> :
            <p>Waiting for {item.assignedName ?? "the reviewer"} to review this request.{sendsToHr ?
              ` If approved, it then goes to ${item.hrReviewerName ?? "HR"} for a final decision.` : ""}</p>}
        </section>}
        <section className="case-section">
          <h2>Current information</h2>
          {item.events.some((event) => event.changes.length > 0) &&
            <p className="case-current-note">The requester corrected an answer. Earlier values are in the case history.</p>}
          <dl className="answer-list">{item.definition.fields.map((field) => <div key={field.key}>
            <dt>{field.label}</dt><dd className={item.answers[field.key] ? undefined : "muted"}>{item.answers[field.key] || "Not provided"}</dd>
          </div>)}</dl>
        </section>
        {(item.canReview || item.canRespond) && lastEvent && <section className="case-section case-review">
          <h2>{item.canRespond ? "Provide information" : "Review request"}</h2>
          {item.isActingDelegate && item.activeDelegation && <p className="notice">Delegated by {item.activeDelegation.delegatorName} until {formatTimestamp(item.activeDelegation.expiresAt)}. Your decision is recorded under your own name.</p>}
          <ReviewForm key={lastEvent.id} id={id} eventId={lastEvent.id} respond={item.canRespond}
            returnView={returnView} returnQuery={savedReturn} sendsToHr={sendsToHr} hrReviewerName={item.hrReviewerName}
            fields={item.definition.fields} answers={item.answers} />
        </section>}
        {item.activeDelegation && <section className="case-section case-delegation">
          <h2>Delegated review</h2>
          <p>{item.activeDelegation.delegatorName} delegated this step to {item.activeDelegation.delegateName} until {formatTimestamp(item.activeDelegation.expiresAt)}.</p>
          {item.canRevokeDelegation && lastEvent && <><p className="field-hint">Reclaiming the review removes the delegate’s access and returns the action to you.</p>
            <RevokeCaseDelegation delegationId={item.activeDelegation.id} eventId={lastEvent.id} /></>}
        </section>}
        {item.canDelegate && lastEvent && <section className="case-section case-delegation">
          <h2>Delegate this review</h2>
          <CaseDelegationForm caseId={id} eventId={lastEvent.id} candidates={delegationCandidates} />
        </section>}
        {nextProcesses.length > 0 && <section className="case-section">
          <h2>Suggested next processes</h2>
          <ul className="suggested-processes">{nextProcesses.map(({ id: nextId, definition }) => <li key={nextId}>
            <Link className="text-link" href={`/processes/${nextId}/request`}>{processTitle(definition.name)} <span aria-hidden="true">→</span></Link>
          </li>)}</ul>
        </section>}
      </div>
      <section className="panel case-section case-history">
        <h2>Case history</h2>
        <ol className="timeline">{history.map((entry) => entry.type === "clarification" ?
          <li key={entry.request.id} className="clarification-thread">
            <strong>Information requested {entry.response ? "and provided" : "· Awaiting response"}</strong>
            <span>{entry.request.actor_name} asked · <time dateTime={entry.request.created_at}>{formatTimestamp(entry.request.created_at)}</time></span>
            <HistoryEventDetails event={entry.request} fields={item.definition.fields} />
            {entry.response && <div className="clarification-reply">
              <strong>Response</strong>
              <span>{entry.response.actor_name} replied · <time dateTime={entry.response.created_at}>{formatTimestamp(entry.response.created_at)}</time></span>
              <HistoryEventDetails event={entry.response} fields={item.definition.fields} />
            </div>}
          </li> : <li key={entry.event.id}>
            <strong>{entry.event.kind}</strong>
            <span>{entry.event.actor_name} · <time dateTime={entry.event.created_at}>{formatTimestamp(entry.event.created_at)}</time></span>
            <HistoryEventDetails event={entry.event} fields={item.definition.fields} />
          </li>)}</ol>
        {item.delegationHistory.length > 0 && <details className="case-delegation-history">
          <summary>Delegation history ({item.delegationHistory.length})</summary>
          <ul>{item.delegationHistory.map((entry) => <li key={entry.id}>
            <strong>{entry.delegatorName} → {entry.delegateName}</strong>
            <span>Started {formatTimestamp(entry.createdAt)} · Expiry {formatTimestamp(entry.expiresAt)}</span>
            <span>{entry.endKind === "revoked" ? "Reclaimed" : entry.endKind === "expired" ? "Expired" :
              entry.endKind === "decision" ? "Delegate acted" : entry.endedAt ? "Ended" : "Active"}</span>
          </li>)}</ul>
        </details>}
      </section>
    </div>
  </Shell>;
}

type CaseEvent = ReturnType<typeof caseDetail>["events"][number];

function HistoryEventDetails({ event, fields }: { event: CaseEvent; fields: Draft["fields"] }) {
  return <>
    {event.clarificationReason && <p className="field-hint">Reason: {event.clarificationReason}</p>}
    {event.note && <p>{event.note}</p>}
    {event.changes.length > 0 && <dl className="answer-changes">{event.changes.map((change) => {
      const label = fields.find((field) => field.key === change.key)?.label ?? change.key;
      return <div key={change.key}><dt>{label}</dt><dd>
        <span>Before: {change.before || "Not provided"}</span><span>Now: {change.after || "Not provided"}</span>
      </dd></div>;
    })}</dl>}
  </>;
}
