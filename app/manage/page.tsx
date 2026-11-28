import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { managementSignals } from "@/lib/management";
import { requireActor } from "@/lib/web-auth";
import { listManagedProcesses, WorkflowError } from "@/lib/workflow";

export default async function ManagementPage() {
  const actor = await requireActor();
  let rows;
  try { rows = listManagedProcesses(actor); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const totals = rows.reduce((acc, item) => ({
    active: acc.active + item.activeCases, waiting: acc.waiting + item.waiting48h,
    questions: acc.questions + item.openQuestions,
  }), { active: 0, waiting: 0, questions: 0 });
  return <Shell actor={actor} section="manage">
    <header className="workspace-heading"><div><h1>Management</h1>
      <p className="muted">{actor.role === "function_owner" ? "HR process portfolio" : "Processes you own"} · Counts across all versions</p></div>
      <a className="button button-secondary" href="/manage/export">Export summary CSV</a></header>
    <div className="manage-summary" aria-label="Portfolio summary">
      <div className="panel"><strong>{rows.length}</strong><span>{rows.length === 1 ? "Process" : "Processes"}</span></div>
      <div className="panel"><strong>{totals.active}</strong><span>Active cases</span></div>
      <div className="panel"><strong>{totals.waiting}</strong><span>Waiting 48h</span></div>
      <div className="panel"><strong>{totals.questions}</strong><span>Open draft questions</span></div>
    </div>
    <section className="panel workspace-surface" aria-labelledby="managed-processes-title">
      <div className="manage-panel-heading"><h2 id="managed-processes-title">Process health</h2>
        <p>Waiting 48h means an active case has had no update for at least two days. It is an attention signal, not a deadline.</p></div>
      {rows.length ? <><p className="case-table-scroll-hint">Scroll sideways to see all columns.</p>
        <div className="case-table-scroll" role="region" aria-label="Process health table, scroll for more columns" tabIndex={0}><table className="case-table manage-table">
          <thead><tr><th scope="col">Process</th><th scope="col">Owner</th><th scope="col">Publication</th>
            <th scope="col">Active</th><th scope="col">Waiting 48h</th><th scope="col">Open questions</th><th scope="col">Total cases</th>
            <th scope="col">Next step</th></tr></thead>
          <tbody>{rows.map((item) => { const signal = managementSignals(item, actor.role === "function_owner")[0]; return <tr key={item.id}>
            <td><Link className="text-link" href={`/manage/${item.id}`}>{item.name}</Link></td>
            <td>{item.ownerName}</td>
            <td>{item.version === null ? "Draft" : item.hasUnpublishedChanges ? `Version ${item.version} · Draft changes` : `Version ${item.version}`}</td>
            <td>{item.activeCases}</td><td>{item.waiting48h}</td><td>{item.openQuestions}</td><td>{item.totalCases}</td>
            <td>{signal ? <Link className="text-link" href={signal.href}>{signal.title}</Link> : "No immediate issues"}</td>
          </tr>; })}</tbody></table></div></> : <div className="empty"><h2>No processes to manage yet</h2>
        <p>{actor.role === "function_owner" ? "Create a process to begin tracking its work." : "Ask the HR function owner to assign you a process."}</p>
        {actor.role === "function_owner" && <Link className="button button-primary" href="/processes/new">New process</Link>}</div>}
    </section>
  </Shell>;
}
