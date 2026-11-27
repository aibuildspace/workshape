import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./db";

export const roles = ["employee", "manager", "hr", "function_owner"] as const;
export type Role = (typeof roles)[number];
export type Actor = { id: string; name: string; email: string; role: Role; manager_id: string | null };

export function requestManagerId(actor: Pick<Actor, "id" | "manager_id">) {
  return actor.manager_id === actor.id ? null : actor.manager_id;
}

const accountSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(100),
  role: z.enum(roles),
  password: z.string().min(12).max(256),
  managerEmail: z.email().optional(),
  oauthSubject: z.string().trim().min(1).max(250).optional(),
});

export const roleLabel: Record<Role, string> = {
  employee: "Employee", manager: "Manager", hr: "HR reviewer", function_owner: "HR function owner",
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function passwordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64);
}

const actorColumns = "u.id, u.name, u.email, u.role, u.manager_id";

export function hasAccounts() {
  return Boolean(db().prepare("SELECT 1 FROM users LIMIT 1").get());
}

export function accountByEmail(email: string) {
  return db().prepare(`SELECT ${actorColumns} FROM users u WHERE email = ?`)
    .get(email.toLowerCase().trim()) as Actor | undefined;
}

export function actorBySubject(subject: string) {
  return db().prepare(`SELECT ${actorColumns} FROM users u WHERE oauth_subject = ?`).get(subject) as Actor | undefined;
}

export function createAccount(input: z.input<typeof accountSchema>) {
  const data = accountSchema.parse(input);
  const manager = data.managerEmail ? accountByEmail(data.managerEmail) : undefined;
  if (data.managerEmail && manager?.role !== "manager") throw new Error("Choose an existing manager account.");
  const salt = randomBytes(16).toString("hex");
  const id = randomUUID();
  db().prepare(`
    INSERT INTO users(id, email, name, role, manager_id, password_hash, oauth_subject)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.email.toLowerCase(), data.name, data.role, manager?.id ?? null,
    salt + ":" + passwordHash(data.password, salt).toString("hex"), data.oauthSubject ?? null);
  return id;
}

export function authenticate(email: string, password: string) {
  if (email.length > 254 || password.length > 256) return;
  const user = db().prepare(`SELECT ${actorColumns}, password_hash FROM users u WHERE email = ?`)
    .get(email.toLowerCase().trim()) as (Actor & { password_hash: string }) | undefined;
  const [salt, expected] = user?.password_hash.split(":") ?? ["0".repeat(32), "0".repeat(128)];
  const valid = timingSafeEqual(passwordHash(password, salt), Buffer.from(expected, "hex"));
  if (valid && user) {
    const { id, name, email, role, manager_id } = user;
    return { id, name, email, role, manager_id };
  }
}

export const sessionDuration = 8 * 60 * 60;

export function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db().prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(digest(token), userId, Date.now() + sessionDuration * 1000);
  return token;
}

export function revokeSession(token: string) {
  db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(digest(token));
}

export function actorForSession(token: string) {
  return db().prepare(`
    SELECT ${actorColumns} FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(digest(token), Date.now()) as Actor | undefined;
}

export function issueMcpToken(userId: string) {
  const token = "wsh_" + randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM mcp_tokens WHERE expires_at < ?").run(Date.now());
  db().prepare("INSERT INTO mcp_tokens VALUES (?, ?, ?)").run(digest(token), userId, Date.now() + sessionDuration * 1000);
  return token;
}

export function actorForMcpToken(token: string) {
  return db().prepare(`
    SELECT ${actorColumns} FROM mcp_tokens t JOIN users u ON t.user_id = u.id
    WHERE t.token_hash = ? AND t.expires_at > ?
  `).get(digest(token), Date.now()) as Actor | undefined;
}

export function accountById(id: string) {
  return db().prepare(`SELECT ${actorColumns} FROM users u WHERE id = ?`).get(id) as Actor | undefined;
}
