import Link from "next/link";
import { ProcessMap } from "@/components/process-map";
import { Shell } from "@/components/shell";
import { requestManagerId } from "@/lib/accounts";
import { processTitle } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { listEditableProcesses, listProcessLinks, listPublishedProcesses } from "@/lib/workflow";

export default async function ProcessesPage({ searchParams }: PageProps<"/processes">) {
  const actor = await requireActor();
  const canSubmit = Boolean(requestManagerId(actor));
  const { view, process: selectedProcess } = await searchParams;
  const map = view === "map";
  const editable = listEditableProcesses(actor);
  const editableById = new Map(editable.map((item) => [item.id, item]));
  const published = listPublishedProcesses()
    .map((item) => ({
      id: item.id, name: processTitle(item.definition.name), ownerName: item.ownerName,
      purpose: item.definition.purpose, version: item.version, canEdit: editableById.has(item.id),
      dirty: editableById.get(item.id)?.dirty ?? false,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
  const drafts = editable.filter((item) => item.version === null).map((item) => ({
    ...item, name: processTitle(item.name), purpose: "", canEdit: true,
  }));
  const rows = [...published, ...drafts];
  const publishedIds = new Set(published.map((item) => item.id));
  const selectedId = typeof selectedProcess === "string" && publishedIds.has(selectedProcess) ? selectedProcess : undefined;
  return <Shell actor={actor} section="processes">
    <header className="workspace-heading">
      <h1>Processes</h1>
      <div className="workspace-toolbar">
        <nav className="workspace-views" aria-label="Process views">
          <Link href="/processes" aria-current={!map ? "page" : undefined}>Process list</Link>
          <Link href="/processes?view=map" aria-current={map ? "page" : undefined}>Process map</Link>
        </nav>
        {actor.role === "function_owner" && <Link href="/processes/new" className="button button-primary">New process</Link>}
      </div>
    </header>
    <section className="panel workspace-surface" aria-label={map ? "Published process map" : "Processes"}>
      {map ? <ProcessMap key={selectedId ?? "map"} initialSelectedId={selectedId} canSubmit={canSubmit}
        processes={published.map(({ id, name, ownerName, version, canEdit }) => ({ id, name, ownerName, version, canEdit }))}
        links={listProcessLinks().filter(({ sourceId, targetId }) => publishedIds.has(sourceId) && publishedIds.has(targetId))} /> : rows.length ? <ul className="process-list">{rows.map((item) => <li key={item.id}>
          <div className="process-list-content">
            <h2>{item.name}</h2>
            {item.purpose && <p className="muted">{item.purpose}</p>}
          </div>
          <p className="process-meta">{item.ownerName}<span>{item.version === null ? "Draft" : `Version ${item.version}`}
            {item.version !== null && item.dirty && " · Unpublished changes"}</span></p>
          <div className="process-row-actions">
            {item.version !== null && <Link className="button button-secondary" href={`/processes/${item.id}/request`}>
              {canSubmit ? "Start request" : "View form"}<span className="sr-only"> for {item.name}</span>
            </Link>}
            {item.canEdit && <Link className="button button-text" href={`/processes/${item.id}/edit`}>Edit<span className="sr-only"> {item.name}</span></Link>}
          </div>
        </li>)}</ul> : <div className="empty"><h2>No processes yet</h2>
          <p>{actor.role === "function_owner" ? "Create a process to start drafting its form and routing." : "Published processes will appear here."}</p>
        </div>}
    </section>
  </Shell>;
}
