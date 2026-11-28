import Link from "next/link";
import { HomeChat } from "@/components/home-chat";
import { HomeApps } from "@/components/home-apps";
import { Status } from "@/components/case-display";
import { Shell } from "@/components/shell";
import { requestManagerId } from "@/lib/accounts";
import { managementHighlights } from "@/lib/management";
import { processTitle } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { listAssignedProcessQuestions, listCases, listEditableProcesses, listManagedProcesses, listPublishedProcesses } from "@/lib/workflow";

export default async function HomePage() {
  const actor = await requireActor();
  const canSubmit = Boolean(requestManagerId(actor));
  const editable = new Set(listEditableProcesses(actor).map((item) => item.id));
  const apps = listPublishedProcesses().map((item) => ({
    id: item.id, name: processTitle(item.definition.name), purpose: item.definition.purpose,
    ownerName: item.ownerName, version: item.version, canEdit: editable.has(item.id),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const actions = listCases(actor).filter((item) => item.needsAction);
  const questions = listAssignedProcessQuestions(actor);
  const actionCount = actions.length + questions.length;
  const managed = actor.role === "function_owner" || actor.role === "hr" ? listManagedProcesses(actor) : [];
  const processSignals = managementHighlights(managed, actor.role === "function_owner");
  return <Shell actor={actor} section="home">
    <header className="home-heading">
      <div><p className="home-eyebrow">Your workspace</p><h1>Good to see you, {actor.name.split(" ")[0]}.</h1>
        <p>{process.env.OPENAI_API_KEY ? "Find a process, pick up a request, or ask for help getting started." :
          "Find a process or pick up a request."}</p></div>
    </header>
    <div className={`home-grid${actionCount > 0 ? " has-actions" : ""}`}>
      <HomeApps apps={apps} canSubmit={canSubmit} canCreate={actor.role === "function_owner"} />
      <div className="home-side">
        <section className="panel home-actions" aria-labelledby="home-actions-title">
          <div className="home-panel-heading"><div><p className="home-eyebrow">Next up</p><h2 id="home-actions-title">Your actions</h2></div>
            {actionCount > 0 && <span className="home-action-count">{actionCount}</span>}</div>
          {actionCount ? <ul className="home-action-list">
            {questions.slice(0, 5).map((item) => <li key={`question-${item.id}`}>
              <Link href={`/questions/${item.id}`}><strong>{processTitle(item.processName)}</strong>
                <span>Answer draft question: {item.question}</span></Link></li>)}
            {actions.slice(0, Math.max(0, 5 - questions.length)).map((item) => <li key={item.id}>
            <Link href={`/cases/${item.id}?from=home`}><strong>{processTitle(item.name)}</strong>
              <span>{item.isRequester ? "Provide information" : item.delegatedByName ?
                `Delegated review from ${item.delegatedByName}` : `Review request from ${item.requesterName}`}</span>
              <Status value={item.status} /></Link>
          </li>)}</ul> : <p className="home-action-empty">Nothing needs your attention right now.</p>}
          <div className="home-action-links">
            <Link className="text-link" href="/work">Open work queue <span aria-hidden="true">→</span></Link>
            {canSubmit && <Link className="text-link" href="/processes">Start a request <span aria-hidden="true">→</span></Link>}
            {actor.role === "function_owner" && <Link className="text-link" href="/processes/new">Create a process <span aria-hidden="true">→</span></Link>}
          </div>
        </section>
        {managed.length > 0 && <section className="panel home-process-signals" aria-labelledby="home-process-signals-title">
          <div className="home-panel-heading"><div><p className="home-eyebrow">Process health</p>
            <h2 id="home-process-signals-title">Processes to check</h2></div>
            <Link className="text-link" href="/manage">Management <span aria-hidden="true">→</span></Link></div>
          {processSignals.length ? <ul className="home-action-list">{processSignals.slice(0, 3).map((signal) =>
            <li key={signal.processId}><Link href={signal.href}><strong>{processTitle(signal.processName)}</strong>
              <span>{signal.title}</span></Link></li>)}</ul> :
            <p className="home-action-empty">No open draft questions, unpublished changes, or cases waiting 48 hours.</p>}
        </section>}
        {process.env.OPENAI_API_KEY && <HomeChat />}
      </div>
    </div>
  </Shell>;
}
