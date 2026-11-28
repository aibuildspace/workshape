import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { Shell } from "@/components/shell";
import { roleLabel } from "@/lib/accounts";
import { processTitle } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { listAccounts, listEditableProcesses } from "@/lib/workflow";

export default async function AccountsPage() {
  const actor = await requireActor();
  if (actor.role !== "function_owner") notFound();
  const accounts = listAccounts(actor);
  const processes = listEditableProcesses(actor);
  const managers = accounts.filter((account) => account.role === "manager");
  const byId = new Map(accounts.map((account) => [account.id, account.name]));
  return <Shell actor={actor} section="accounts">
    <header className="workspace-heading"><h1>People and ownership</h1></header>
    <p className="account-scope-note">Every process currently belongs to the HR function. Business-unit membership is not recorded.</p>
    <div className="accounts-grid">
      <section className="panel content-panel" aria-label="Create account">
        <h2>Create account</h2>
        <AccountForm managers={managers} />
      </section>
      <section className="panel content-panel" aria-label="Existing accounts">
        <h2>People</h2>
        <div className="case-table-scroll"><table className="case-table account-table">
          <caption className="sr-only">People and manager assignments</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Manager</th></tr></thead>
          <tbody>{accounts.map((account) => <tr key={account.id}>
            <td><strong>{account.name}</strong></td><td>{account.email}</td><td>{roleLabel[account.role]}</td>
            <td>{account.managerId ? byId.get(account.managerId) ?? "Unknown" : "—"}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </div>
    <section className="panel account-ownership" aria-labelledby="account-ownership-title">
      <div className="section-heading"><div><h2 id="account-ownership-title">Process ownership</h2>
        <p className="muted">Assign an HR process owner in the editor. Owners maintain drafts and links; the function owner publishes.</p></div></div>
      {processes.length ? <><p className="case-table-scroll-hint">Scroll sideways to see all columns.</p>
        <div className="case-table-scroll"><table className="case-table">
          <caption className="sr-only">Processes and their current owners</caption>
          <thead><tr><th scope="col">Process</th><th scope="col">Owner</th><th scope="col">Published version</th><th scope="col">Action</th></tr></thead>
          <tbody>{processes.map((process) => <tr key={process.id}>
            <td><strong>{processTitle(process.name)}</strong></td><td>{process.ownerName}</td>
            <td>{process.version ?? "Draft only"}</td>
            <td><Link className="text-link" href={`/processes/${process.id}/edit`}>Manage ownership<span className="sr-only"> for {processTitle(process.name)}</span></Link></td>
          </tr>)}</tbody>
        </table></div></> : <p className="account-ownership-empty muted">No processes have been created yet.</p>}
    </section>
  </Shell>;
}
