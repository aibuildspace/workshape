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
  const { view, process: selectedProcess, q } = await searchParams;
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
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const rows = [...published, ...drafts].sort((first, second) => first.name.localeCompare(second.name))
    .filter((item) => !query || [item.name, item.purpose, item.ownerName]
      .some((value) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
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
        {actor.role === "function_owner" && <><Link href="/processes/new?start=import#import-process" className="button button-secondary">Import JSON</Link>
          <Link href="/processes/new" className="button button-primary">New process</Link></>}
      </div>
    </header>
    <section className="panel workspace-surface" aria-label={map ? "Published process map" : "Processes"}>
      {map ? <ProcessMap key={selectedId ?? "map"} initialSelectedId={selectedId} canSubmit={canSubmit}
        processes={published.map(({ id, name, ownerName, version, canEdit }) => ({ id, name, ownerName, version, canEdit }))}
        links={listProcessLinks().filter(({ sourceId, targetId }) => publishedIds.has(sourceId) && publishedIds.has(targetId))} /> : <>
        <div className="case-table-toolbar process-table-toolbar">
          <form action="/processes" className="case-table-filters">
            <label>Search processes<input type="search" name="q" defaultValue={query} maxLength={100}
              placeholder="Name, purpose, or owner" /></label>
            <button className="button button-secondary" type="submit">Search</button>
            {query && <Link className="text-link" href="/processes">Clear</Link>}
          </form>
        </div>
        <p className="case-table-count" role="status">{rows.length} {rows.length === 1 ? "process" : "processes"} in this view</p>
        {rows.length ? <><p className="case-table-scroll-hint">Scroll sideways to see all columns.</p>
          <div className="case-table-scroll"><table className="case-table process-table">
            <caption className="sr-only">Published processes and drafts you can edit</caption>
            <thead><tr><th scope="col">Process</th><th scope="col">Owner</th><th scope="col">Version</th>
              <th scope="col">State</th><th scope="col">Actions</th></tr></thead>
            <tbody>{rows.map((item) => <tr key={item.id}>
              <td><strong>{item.name}</strong>{item.purpose && <small>{item.purpose}</small>}
                <span className="mobile-process-state">{item.version === null ? "Draft" :
                  `Published version ${item.version}${item.dirty ? " · Draft changes" : ""}`}</span>
                <span className="process-mobile-actions">
                  {item.version !== null && <Link className="text-link" href={`/processes/${item.id}/request`}>
                    {canSubmit ? "Start request" : "View form"}<span className="sr-only"> for {item.name}</span></Link>}
                  {item.canEdit && <Link className="text-link" href={`/processes/${item.id}/edit`}>
                    Edit<span className="sr-only"> {item.name}</span></Link>}
                  {item.version !== null && <a className="text-link" href={`/processes/${item.id}/export`}>
                    Export<span className="sr-only"> {item.name} JSON</span></a>}
                </span></td>
              <td>{item.ownerName}</td>
              <td>{item.version ?? "—"}</td>
              <td>{item.version === null ? "Draft" : item.dirty ? "Published · Draft changes" : "Published"}</td>
              <td><div className="process-table-actions">
                {item.version !== null && <Link className="text-link" href={`/processes/${item.id}/request`}>
                  {canSubmit ? "Start request" : "View form"}<span className="sr-only"> for {item.name}</span></Link>}
                {item.canEdit && <Link className="text-link" href={`/processes/${item.id}/edit`}>
                  Edit<span className="sr-only"> {item.name}</span></Link>}
                {item.version !== null && <a className="text-link" href={`/processes/${item.id}/export`}>
                  Export<span className="sr-only"> {item.name} JSON</span></a>}
              </div></td>
            </tr>)}</tbody>
          </table></div></> : <div className="empty"><h2>{query ? "No processes match your search" : "No processes yet"}</h2>
          <p>{query ? "Try a different name, purpose, or owner." : actor.role === "function_owner" ?
            "Create a process to start drafting its form and routing." : "Published processes will appear here."}</p>
        </div>}</>}
    </section>
  </Shell>;
}
