import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTimestamp, Status } from "@/components/case-display";
import { ReviewForm } from "@/components/forms";
import { Shell } from "@/components/shell";
import { needsHr, processTitle } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { caseDetail, suggestedProcesses, WorkflowError } from "@/lib/workflow";

export default async function CasePage({ params, searchParams }: PageProps<"/cases/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const { from } = await searchParams;
  let item;
  try { item = caseDetail(actor, id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const lastEvent = item.events.at(-1);
  const nextProcesses = item.isRequester && item.status === "approved" ? suggestedProcesses(item.processId) : [];
  const returnView = from === "assigned" || from === "mine" || from === "history" ? from : item.isRequester ? "mine" : "assigned";
  const backHref = returnView === "assigned" ? "/" : "/?view=" + returnView;
  const backLabel = returnView === "mine" ? "My requests" : returnView === "history" ? "Review cases" : "Work queue";
  const sendsToHr = item.status === "manager_review" && needsHr(item.definition, item.answers);
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
        <section className="case-section">
          <h2>Submitted information</h2>
          <dl className="answer-list">{item.definition.fields.map((field) => <div key={field.key}>
            <dt>{field.label}</dt><dd className={item.answers[field.key] ? undefined : "muted"}>{item.answers[field.key] || "Not provided"}</dd>
          </div>)}</dl>
        </section>
        {(item.canReview || item.canRespond) && lastEvent && <section className="case-section case-review">
          <h2>{item.canRespond ? "Provide information" : "Review request"}</h2>
          {item.canRespond && lastEvent.kind === "Information requested" && <blockquote className="case-question">
            <p>{lastEvent.note}</p><footer>{lastEvent.actor_name}</footer>
          </blockquote>}
          <ReviewForm key={lastEvent.id} id={id} eventId={lastEvent.id} respond={item.canRespond} returnView={returnView} sendsToHr={sendsToHr} />
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
        <ol className="timeline">{item.events.toReversed().map((event) => <li key={event.id}>
          <strong>{event.kind}</strong>
          <span>{event.actor_name} · <time dateTime={event.created_at}>{formatTimestamp(event.created_at)}</time></span>
          {event.note && <p>{event.note}</p>}
        </li>)}</ol>
      </section>
    </div>
  </Shell>;
}
