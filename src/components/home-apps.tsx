"use client";

import Link from "next/link";
import { useState } from "react";

export type HomeApp = { id: string; name: string; purpose: string; ownerName: string;
  version: number; canEdit: boolean };

export function HomeApps({ apps, canSubmit, canCreate }: {
  apps: HomeApp[]; canSubmit: boolean; canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const visible = search ? apps.filter((app) =>
    `${app.name} ${app.purpose} ${app.ownerName}`.toLocaleLowerCase().includes(search)) : apps;
  return <section className="panel home-apps" aria-labelledby="home-apps-title">
    <div className="home-panel-heading"><div><p className="home-eyebrow">Explore</p><h2 id="home-apps-title">Apps</h2></div>
      <Link className="text-link" href="/processes">View all processes <span aria-hidden="true">→</span></Link></div>
    {apps.length > 0 && <div className="home-app-search">
      <label className="sr-only" htmlFor="home-app-query">Search apps</label>
      <input id="home-app-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Search apps by name or purpose" autoComplete="off" />
      <p className="sr-only" role="status">{visible.length} {visible.length === 1 ? "app" : "apps"} found</p>
    </div>}
    {visible.length ? <ul className="home-app-list">{visible.map((app) => <li key={app.id} className="home-app-row">
      <div className="home-app-icon" aria-hidden="true">{app.name.slice(0, 1).toUpperCase()}</div>
      <div className="home-app-copy"><h3>{app.name}</h3><p>{app.purpose}</p>
        <small>{app.ownerName} · Version {app.version}</small></div>
      <div className="home-app-actions">
        <Link className="button button-secondary" href={`/processes/${app.id}/request?from=home`}>
          {canSubmit ? "Start request" : "View form"}<span className="sr-only"> for {app.name}</span></Link>
        {app.canEdit && <Link className="button button-text" href={`/processes/${app.id}/edit`}>
          Edit<span className="sr-only"> {app.name}</span></Link>}
      </div>
    </li>)}</ul> : <div className="home-empty"><h3>{apps.length ? "No apps match your search" : "No published apps yet"}</h3>
      <p>{apps.length ? "Try a different name or keyword." : canCreate ?
        "Create and publish a process to make it available here." : "Published processes will appear here when they are ready."}</p>
      {apps.length ? <button className="button button-secondary" type="button" onClick={() => setQuery("")}>Clear search</button> :
        canCreate && <Link className="button button-primary" href="/processes/new">Create process</Link>}
    </div>}
  </section>;
}
