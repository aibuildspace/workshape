import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "../../app/actions";
import { roleLabel, type Actor } from "@/lib/accounts";
import { listEditableProcesses } from "@/lib/workflow";
import { Brand } from "./brand";

export async function Shell({ actor, section, children }: { actor: Actor; section: "home" | "work" | "processes" | "manage" | "accounts" | "account"; children: ReactNode }) {
  const showManagement = actor.role === "function_owner" || (actor.role === "hr" && listEditableProcesses(actor).length > 0);
  return <div className="workspace">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" aria-label="Workshape home"><Brand /></Link>
        <nav aria-label="Main navigation">
          <Link href="/" aria-current={section === "home" ? "page" : undefined}>Home</Link>
          <Link href="/work" aria-current={section === "work" ? "page" : undefined}>Work queue</Link>
          <Link href="/processes" aria-current={section === "processes" ? "page" : undefined}>Processes</Link>
          {showManagement && <Link href="/manage" aria-current={section === "manage" ? "page" : undefined}>Management</Link>}
          {actor.role === "function_owner" && <Link href="/accounts" aria-current={section === "accounts" ? "page" : undefined}>Accounts</Link>}
        </nav>
        <div className="user-area">
          <div className="user-avatar" aria-hidden="true">{actor.name.trim().slice(0, 1).toUpperCase()}</div>
          <div className="user-name"><strong>{actor.name}</strong><small>{roleLabel[actor.role]}</small></div>
          <Link className="topbar-account" href="/account" aria-current={section === "account" ? "page" : undefined}>My account</Link>
          <form action={logout}><button className="button button-text" type="submit">Sign out</button></form>
        </div>
      </div>
    </header>
    <main className="page" id="main-content" tabIndex={-1}>{children}</main>
  </div>;
}
