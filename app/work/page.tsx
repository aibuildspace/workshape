import Link from "next/link";
import { openNotification } from "../actions";
import { formatDate, Status } from "@/components/case-display";
import { Shell } from "@/components/shell";
import { caseFilters, caseRowsForView } from "@/lib/case-table";
import { processTitle } from "@/lib/process";
import { requestManagerId } from "@/lib/accounts";
import { requireActor } from "@/lib/web-auth";
import { listAssignedProcessQuestions, listCases, listNotifications, statuses } from "@/lib/workflow";

export default async function WorkQueue({ searchParams }: PageProps<"/work">) {
  const actor = await requireActor();
  const { view, q, status, notice } = await searchParams;
  const cases = listCases(actor);
  const draftQuestions = listAssignedProcessQuestions(actor);
  const alerts = listNotifications(actor);
  const reviewCases = cases.filter((item) => !item.needsAction && !item.isRequester);
  const canReview = actor.role !== "employee" || reviewCases.length > 0;
  const filters = caseFilters({ view, q, status }, canReview);
  const tab = filters.view;
  const assigned = cases.filter((item) => item.needsAction);
  const visible = caseRowsForView(cases, filters);
  const viewParams = new URLSearchParams();
  if (tab !== "assigned") viewParams.set("view", tab);
  if (filters.query) viewParams.set("q", filters.query);
  if (filters.status !== "all") viewParams.set("status", filters.status);
  const exportHref = `/work/export?${viewParams.toString()}`;
  const returnParams = viewParams.toString();
  return <Shell actor={actor} section="work">
    {notice === "delegated" && <p className="notice success" role="status">Your delegated review decision was recorded. The case is no longer assigned to you.</p>}
    <header className="workspace-heading queue-heading">
      <h1>Work queue</h1>
      <div className="workspace-toolbar queue-toolbar">
        <nav className="workspace-views" aria-label="Case views">
          <Link href="/work" aria-current={tab === "assigned" ? "page" : undefined}>
            Needs action{assigned.length + draftQuestions.length > 0 && <span className="queue-count"
              aria-label={`${assigned.length} cases and ${draftQuestions.length} draft questions`}>{assigned.length + draftQuestions.length}</span>}
          </Link>
          <Link href="/work?view=mine" aria-current={tab === "mine" ? "page" : undefined}>My requests</Link>
          {canReview && <Link href="/work?view=history" aria-current={tab === "history" ? "page" : undefined}>Review cases</Link>}
        </nav>
        <Link href="/processes" className="button button-primary">{requestManagerId(actor) ? "Start a request" : "Browse processes"}</Link>
      </div>
    </header>
    {alerts.length > 0 && <section className="panel notification-panel" aria-label="New case notifications">
      <h2>New activity</h2>
      <ul>{alerts.map((item) => <li key={item.id}><form action={openNotification.bind(null, item.id)}>
        <button type="submit" className="button button-text">{item.kind} · Open case</button>
      </form></li>)}</ul>
    </section>}
    {tab === "assigned" && draftQuestions.length > 0 && <section className="panel workspace-surface draft-question-queue" aria-label="Assigned draft questions">
      <h2>Draft questions assigned to you</h2>
      <ul>{draftQuestions.map((item) => <li key={item.id}>
        <div><strong>{item.processName}</strong><p>{item.question}</p>
          <small>Expires {formatDate(item.expiresAt)}</small></div>
        <Link className="button button-secondary" href={`/questions/${item.id}`}>Answer question</Link>
      </li>)}</ul>
    </section>}
    <section className="panel workspace-surface" aria-label="Requests">
      <div className="case-table-toolbar">
        <form action="/work" className="case-table-filters">
          {tab !== "assigned" && <input type="hidden" name="view" value={tab} />}
          <label>Search cases<input type="search" name="q" defaultValue={filters.query}
            placeholder="Process, person, or case ID" maxLength={100} /></label>
          <label>Status<select name="status" defaultValue={filters.status}>
            <option value="all">All statuses</option>
            {Object.entries(statuses).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button className="button button-secondary" type="submit">Apply filters</button>
          {(filters.query || filters.status !== "all") && <Link className="text-link" href={tab === "assigned" ? "/work" : `/work?view=${tab}`}>Clear</Link>}
        </form>
        <a className="button button-secondary" href={exportHref}>Export CSV</a>
      </div>
      <p className="case-table-count" role="status">{visible.length} {visible.length === 1 ? "case" : "cases"} in this view</p>
      {visible.length ? <><p className="case-table-scroll-hint">Scroll sideways to see all columns.</p>
        <div className="case-table-scroll" role="region" aria-label="Cases table, scroll for more columns" tabIndex={0}><table className="case-table work-case-table">
        <caption className="sr-only">Cases you can access</caption>
        <thead><tr><th scope="col">Process</th><th scope="col">Requested by</th><th scope="col">Status</th>
          <th scope="col">Assigned to</th><th scope="col">Updated</th><th scope="col">Details</th></tr></thead>
        <tbody>{visible.map((item) => <tr key={item.id}>
          <td><strong>{processTitle(item.name)}</strong><small>#{item.id.slice(0, 8)}</small>
            <Link className="text-link mobile-row-action" href={`/cases/${item.id}?from=${tab}${returnParams ? `&return=${encodeURIComponent(returnParams)}` : ""}`}>
              Open case<span className="sr-only"> {processTitle(item.name)} #{item.id.slice(0, 8)}</span></Link></td>
          <td>{item.requesterName}</td>
          <td><Status value={item.status} />
            {item.needsAction && Date.now() - Date.parse(item.updatedAt) >= 2 * 24 * 60 * 60 * 1000 &&
              <span className="queue-reminder">Waiting on you for 2+ days</span>}</td>
          <td>{item.needsAction ? "You" : item.assignedName ?? "—"}
            {item.needsAction && item.delegatedByName && <small>Delegated by {item.delegatedByName}</small>}</td>
          <td><time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></td>
          <td><Link className="text-link" href={`/cases/${item.id}?from=${tab}${returnParams ? `&return=${encodeURIComponent(returnParams)}` : ""}`}>
            Open<span className="sr-only"> {processTitle(item.name)} case #{item.id.slice(0, 8)}</span></Link></td>
        </tr>)}</tbody>
      </table></div></> : <div className="empty">
        <h2>{filters.query || filters.status !== "all" ? "No cases match these filters" : tab === "assigned" ?
          draftQuestions.length ? "No cases need your attention" : "Nothing needs your attention" :
          tab === "mine" ? "You haven’t submitted any requests" : "No other review cases"}</h2>
        {(filters.query || filters.status !== "all") && <p>Clear the filters to see the rest of this view.</p>}
      </div>}
    </section>
  </Shell>;
}
