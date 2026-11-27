import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let connection: DatabaseSync | undefined;

export function db() {
  if (connection) return connection;
  const location = process.env.WORKSHAPE_DB || "data/workshape.sqlite";
  if (location !== ":memory:") {
    mkdirSync(dirname(resolve(/* turbopackIgnore: true */ location)), { recursive: true, mode: 0o700 });
  }
  const database = new DatabaseSync(location);
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'hr', 'function_owner')),
      manager_id TEXT REFERENCES users(id),
      password_hash TEXT NOT NULL,
      oauth_subject TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pilot_profiles (
      profile_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS pilot_sessions (
      token_hash TEXT PRIMARY KEY,
      profile_key TEXT NOT NULL REFERENCES pilot_profiles(profile_key),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS processes (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      draft TEXT NOT NULL,
      hr_reviewer_id TEXT REFERENCES users(id),
      questions TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      published_version INTEGER,
      published_revision INTEGER,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS process_versions (
      process_id TEXT NOT NULL REFERENCES processes(id),
      version INTEGER NOT NULL,
      definition TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      hr_reviewer_id TEXT REFERENCES users(id),
      published_by TEXT NOT NULL REFERENCES users(id),
      published_at TEXT NOT NULL,
      PRIMARY KEY (process_id, version)
    );
    CREATE TABLE IF NOT EXISTS process_links (
      source_id TEXT NOT NULL REFERENCES processes(id),
      target_id TEXT NOT NULL REFERENCES processes(id),
      created_by TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (source_id, target_id),
      CHECK (source_id <> target_id)
    );
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      requester_id TEXT NOT NULL REFERENCES users(id),
      manager_id TEXT NOT NULL REFERENCES users(id),
      hr_reviewer_id TEXT REFERENCES users(id),
      answers TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('manager_review','hr_review','needs_information','approved','declined')),
      resume_status TEXT CHECK (resume_status IN ('manager_review','hr_review')),
      assigned_id TEXT REFERENCES users(id),
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (requester_id, idempotency_key),
      FOREIGN KEY (process_id, version) REFERENCES process_versions(process_id, version)
    );
    CREATE TABLE IF NOT EXISTS case_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES cases(id),
      actor_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cases_requester ON cases(requester_id);
    CREATE INDEX IF NOT EXISTS cases_assigned ON cases(assigned_id);
    CREATE INDEX IF NOT EXISTS case_events_case ON case_events(case_id, id);
  `);
  connection = database;
  return database;
}

export function transaction<T>(work: () => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
