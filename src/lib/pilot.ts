import { createHash, randomBytes } from "node:crypto";
import { createAccount, sessionDuration, type Actor } from "./accounts";
import { db, transaction } from "./db";

const profiles = [
  { key: "admin", name: "Pilot admin", role: "function_owner" },
  { key: "manager", name: "Jordan Lee", role: "manager" },
  { key: "hr", name: "Sam Patel", role: "hr" },
  { key: "employee", name: "Alex Morgan", role: "employee", manager: "manager" },
  { key: "other-employee", name: "Taylor Reed", role: "employee", manager: "manager" },
] as const;

const profileEmail = (key: string) => key + "@pilot.workshape.invalid";
type PilotProfile = Actor & { profile_key: string };
const profileSelect = `SELECT p.profile_key, u.id, u.name, u.email, u.role, u.manager_id
  FROM pilot_profiles p JOIN users u ON u.id = p.user_id`;

export function pilotProfiles() {
  return (db().prepare(profileSelect + " ORDER BY p.rowid").all() as PilotProfile[]).map((profile) => ({ ...profile }));
}

export function seedPilotProfiles() {
  return transaction(() => {
    for (const profile of profiles) {
      if (db().prepare("SELECT 1 FROM pilot_profiles WHERE profile_key = ?").get(profile.key)) continue;
      const userId = createAccount({
        email: profileEmail(profile.key), name: profile.name, role: profile.role,
        managerEmail: "manager" in profile ? profileEmail(profile.manager) : undefined,
        password: randomBytes(32).toString("base64url"),
      });
      db().prepare("INSERT INTO pilot_profiles VALUES (?, ?)").run(profile.key, userId);
    }
    return pilotProfiles();
  });
}

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function startPilotSession() {
  if (!db().prepare("SELECT 1 FROM pilot_profiles WHERE profile_key = 'admin'").get()) return;
  const token = randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM pilot_sessions WHERE expires_at <= ?").run(Date.now());
  db().prepare("INSERT INTO pilot_sessions VALUES (?, 'admin', ?)").run(digest(token), Date.now() + sessionDuration * 1000);
  return token;
}

export function pilotActor(token: string) {
  return db().prepare(profileSelect + ` JOIN pilot_sessions s ON s.profile_key = p.profile_key
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(digest(token), Date.now()) as PilotProfile | undefined;
}

export function switchPilotProfile(token: string, target: string) {
  const changed = db().prepare(`UPDATE pilot_sessions SET profile_key = ?
    WHERE token_hash = ? AND expires_at > ?
    AND (profile_key = 'admin' OR ? = 'admin')
    AND EXISTS (SELECT 1 FROM pilot_profiles WHERE profile_key = ?)`)
    .run(target, digest(token), Date.now(), target, target);
  return changed.changes === 1;
}

export function revokePilotSession(token: string) {
  db().prepare("DELETE FROM pilot_sessions WHERE token_hash = ?").run(digest(token));
}
