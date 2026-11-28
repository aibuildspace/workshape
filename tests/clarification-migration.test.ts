import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { db } from "../src/lib/db";

test("older case events remain readable when the clarification category column is added", () => {
  const directory = mkdtempSync(join(tmpdir(), "workshape-clarification-"));
  const path = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE case_events (id INTEGER PRIMARY KEY, case_id TEXT NOT NULL,
    actor_id TEXT NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL)`);
  legacy.prepare(`INSERT INTO case_events(id, case_id, actor_id, kind, note, created_at)
    VALUES (1, 'case', 'actor', 'Information requested', 'Legacy note', '2026-01-01T00:00:00.000Z')`).run();
  legacy.close();
  process.env.WORKSHAPE_DB = path;
  const upgraded = db();
  const row = upgraded.prepare("SELECT note, clarification_reason FROM case_events WHERE id = 1")
    .get() as { note: string; clarification_reason: string | null };
  assert.equal(row.note, "Legacy note");
  assert.equal(row.clarification_reason, null);
  upgraded.close();
  rmSync(directory, { recursive: true, force: true });
});
