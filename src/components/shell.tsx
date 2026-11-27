import Link from "next/link";
import type { ReactNode } from "react";
import { changePilotProfile, logout } from "../../app/actions";
import { roleLabel, type Actor } from "@/lib/accounts";
import { pilotProfiles } from "@/lib/pilot";
import { currentPilotActor } from "@/lib/web-auth";
import { Brand } from "./brand";

export async function Shell({ actor, section, children }: { actor: Actor; section: "work" | "processes"; children: ReactNode }) {
  const pilot = await currentPilotActor();
  return <div className="workspace">
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" aria-label="Workshape home"><Brand /></Link>
        <nav aria-label="Main navigation">
          <Link href="/" aria-current={section === "work" ? "page" : undefined}>Work queue</Link>
          <Link href="/processes" aria-current={section === "processes" ? "page" : undefined}>Processes</Link>
        </nav>
        <div className="user-area">
          <div className="user-avatar" aria-hidden="true">{actor.name.trim().slice(0, 1).toUpperCase()}</div>
          <div className="user-name"><strong>{actor.name}</strong><small>{roleLabel[actor.role]}</small></div>
          <form action={logout}><button className="button button-text" type="submit">Sign out</button></form>
        </div>
      </div>
    </header>
    {pilot && <aside className="pilot-bar" aria-label="Local pilot profile">
      <div className="pilot-inner">
        <p><strong>Local pilot</strong> · {pilot.profile_key === "admin" ? "Pilot admin" : `Acting as ${actor.name} (${roleLabel[actor.role]})`}</p>
        {pilot.profile_key === "admin" ? <form action={changePilotProfile}>
          <label htmlFor="pilot-profile">Seeded profile</label>
          <select id="pilot-profile" name="profile" required defaultValue="">
            <option value="">Choose a profile</option>
            {pilotProfiles().filter((profile) => profile.profile_key !== "admin").map((profile) =>
              <option key={profile.profile_key} value={profile.profile_key}>{profile.name} · {roleLabel[profile.role]}</option>)}
          </select>
          <button className="button button-secondary">Switch profile</button>
        </form> : <form action={changePilotProfile}>
          <input type="hidden" name="profile" value="admin" />
          <button className="button button-secondary">Return to pilot admin</button>
        </form>}
      </div>
    </aside>}
    <main className="page">{children}</main>
  </div>;
}
