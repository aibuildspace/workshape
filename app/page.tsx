import Link from "next/link";
import { formatDate, Status } from "@/components/case-display";
import { Shell } from "@/components/shell";
import { processTitle } from "@/lib/process";
import { requestManagerId } from "@/lib/accounts";
import { requireActor } from "@/lib/web-auth";
import { listCases } from "@/lib/workflow";

export default async function WorkQueue({ searchParams }: PageProps<"/">) {
  const actor = await requireActor();
  const { view, profileError } = await searchParams;
  const cases = listCases(actor);
  const reviewCases = cases.filter((item) => !item.needsAction && !item.isRequester);
  const canReview = actor.role !== "employee" || reviewCases.length > 0;
  const tab = view === "mine" ? view : view === "history" && canReview ? view : "assigned";
  const assigned = cases.filter((item) => item.needsAction);
  const visible = tab === "assigned" ? assigned : tab === "mine" ? cases.filter((item) => item.isRequester) : reviewCases;
  return <Shell actor={actor} section="work">
    {profileError === "1" && <p className="notice error" role="alert">That pilot profile could not be opened. Return to the pilot admin and try again.</p>}
    <header className="workspace-heading queue-heading">
      <h1>Work queue</h1>
      <div className="workspace-toolbar queue-toolbar">
        <nav className="workspace-views" aria-label="Case views">
          <Link href="/" aria-current={tab === "assigned" ? "page" : undefined}>
            Needs action{assigned.length > 0 && <span className="queue-count" aria-label={`${assigned.length} cases`}>{assigned.length}</span>}
          </Link>
          <Link href="/?view=mine" aria-current={tab === "mine" ? "page" : undefined}>My requests</Link>
          {canReview && <Link href="/?view=history" aria-current={tab === "history" ? "page" : undefined}>Review cases</Link>}
        </nav>
        <Link href="/processes" className="button button-primary">{requestManagerId(actor) ? "Start a request" : "Browse processes"}</Link>
      </div>
    </header>
    <section className="panel workspace-surface" aria-label="Requests">
      {visible.length ? <ul className="queue-list">
        {visible.map((item) => <li key={item.id}>
          <Link href={`/cases/${item.id}?from=${tab}`} className="queue-row">
            <span className="queue-title"><strong>{processTitle(item.name)}</strong>
              {!item.isRequester && <span>{item.requesterName}</span>}
            </span>
            <span className="queue-state"><Status value={item.status} />
              {item.assignedName && <span className="queue-assignee">Assigned to {item.needsAction ? "you" : item.assignedName}</span>}
            </span>
            <time dateTime={item.updatedAt}>Updated {formatDate(item.updatedAt)}</time>
          </Link>
        </li>)}
      </ul> : <div className="empty">
        <h2>{tab === "assigned" ? "Nothing needs your attention" : tab === "mine" ? "You haven’t submitted any requests" : "No other review cases"}</h2>
      </div>}
    </section>
  </Shell>;
}
