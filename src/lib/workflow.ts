import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requestManagerId, type Actor } from "./accounts";
import { db, transaction } from "./db";
import { definitionSchema, draftSchema, needsHr, type Draft, type EditorInput } from "./process";

export class WorkflowError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function missing() {
  return new WorkflowError("This record is unavailable or you do not have access.", 404);
}

function now() {
  return new Date().toISOString();
}

type ProcessRow = {
  id: string; owner_id: string; owner_name: string; draft: string; hr_reviewer_id: string | null;
  questions: string; revision: number; published_version: number | null; published_revision: number | null;
  updated_at: string;
};

type VersionRow = {
  process_id: string; version: number; definition: string; hr_reviewer_id: string | null;
  owner_name: string; published_at: string;
};

export const statuses = {
  manager_review: "Manager review",
  hr_review: "HR review",
  needs_information: "Waiting for information",
  approved: "Approved",
  declined: "Declined",
} as const;

type CaseStatus = keyof typeof statuses;
export type ReviewDecision = "approve" | "decline" | "request_information" | "respond";

type CaseRow = {
  id: string; process_id: string; version: number; requester_id: string; requester_name: string;
  manager_id: string; hr_reviewer_id: string | null; assigned_id: string | null; assigned_name: string | null;
  answers: string; definition: string; status: CaseStatus; resume_status: "manager_review" | "hr_review" | null;
  created_at: string; updated_at: string;
};

type CaseEvent = { id: number; kind: string; note: string; actor_name: string; created_at: string };
const processSelect = "SELECT p.*, u.name AS owner_name FROM processes p JOIN users u ON u.id = p.owner_id";
const versionSelect = `SELECT v.*, u.name AS owner_name FROM process_versions v
  JOIN users u ON u.id = v.owner_id`;
const caseSelect = `SELECT c.*, requester.name AS requester_name, assignee.name AS assigned_name, v.definition
  FROM cases c JOIN users requester ON requester.id = c.requester_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_id
  JOIN process_versions v ON v.process_id = c.process_id AND v.version = c.version`;

function getProcessRow(id: string) {
  return db().prepare(processSelect + " WHERE p.id = ?").get(id) as ProcessRow | undefined;
}

function canEditProcess(actor: Actor, row: ProcessRow) {
  return actor.role === "function_owner" || row.owner_id === actor.id;
}

function parseDraft(value: string): Draft {
  return draftSchema.parse(JSON.parse(value));
}

function parseVersion(row: VersionRow) {
  return { id: row.process_id, version: row.version, definition: parseDraft(row.definition),
    ownerName: row.owner_name, publishedAt: row.published_at };
}

export function listPublishedProcesses() {
  const rows = db().prepare(versionSelect + ` JOIN processes p
    ON p.id = v.process_id AND p.published_version = v.version ORDER BY v.published_at DESC`).all() as VersionRow[];
  return rows.map(parseVersion);
}

export function publishedProcess(id: string) {
  const row = db().prepare(versionSelect + ` JOIN processes p ON p.id = v.process_id
    AND p.published_version = v.version WHERE p.id = ?`).get(id) as VersionRow | undefined;
  if (!row) throw missing();
  return parseVersion(row);
}

export function listEditableProcesses(actor: Actor) {
  const rows = db().prepare(processSelect + " WHERE u.id = ? OR ? = 'function_owner' ORDER BY p.updated_at DESC")
    .all(actor.id, actor.role) as ProcessRow[];
  return rows.map((row) => ({
    id: row.id, name: parseDraft(row.draft).name || "Untitled process", ownerName: row.owner_name,
    version: row.published_version, dirty: row.revision !== row.published_revision, updatedAt: row.updated_at,
  }));
}

export function editableProcess(actor: Actor, id: string): EditorInput & { publishedVersion: number | null; hasChanges: boolean } {
  const row = getProcessRow(id);
  if (!row || !canEditProcess(actor, row)) throw missing();
  return {
    id, draft: parseDraft(row.draft), ownerId: row.owner_id,
    hrReviewerId: row.hr_reviewer_id ?? "", questions: JSON.parse(row.questions) as string[],
    revision: row.revision, publishedVersion: row.published_version,
    hasChanges: row.revision !== row.published_revision,
  };
}

export function listProcessLinks() {
  const rows = db().prepare(`SELECT links.source_id, links.target_id FROM process_links links
    JOIN processes source ON source.id = links.source_id
    JOIN processes target ON target.id = links.target_id
    WHERE source.published_version IS NOT NULL AND target.published_version IS NOT NULL
    ORDER BY links.source_id, links.target_id`).all() as { source_id: string; target_id: string }[];
  return rows.map(({ source_id, target_id }) => ({ sourceId: source_id, targetId: target_id }));
}

export function updateProcessLink(actor: Actor, sourceId: string, targetId: string, operation: "link" | "unlink") {
  if (sourceId === targetId) throw new WorkflowError("Choose two different processes.");
  return transaction(() => {
    const source = getProcessRow(sourceId);
    if (!source?.published_version || !getProcessRow(targetId)?.published_version) {
      throw new WorkflowError("Both processes must be published.");
    }
    if (!canEditProcess(actor, source)) {
      throw new WorkflowError("Only the source process owner or HR function owner can change this link.", 403);
    }
    const result = operation === "link"
      ? db().prepare(`INSERT INTO process_links VALUES (?, ?, ?) ON CONFLICT(source_id, target_id) DO NOTHING`)
        .run(sourceId, targetId, actor.id)
      : db().prepare("DELETE FROM process_links WHERE source_id = ? AND target_id = ?")
        .run(sourceId, targetId);
    return result.changes > 0;
  });
}

export function hrAccounts() {
  const rows = db().prepare("SELECT id, name, role FROM users WHERE role IN ('hr','function_owner') ORDER BY name")
    .all() as Pick<Actor, "id" | "name" | "role">[];
  return rows.map((row) => ({ ...row }));
}

const editorSchema = z.object({
  id: z.uuid().nullable(), revision: z.number().int().nonnegative(),
  draft: draftSchema, ownerId: z.uuid(), hrReviewerId: z.union([z.uuid(), z.literal("")]),
  questions: z.array(z.string().max(400)).max(15),
});

export function saveDefinition(actor: Actor, raw: EditorInput, publish: boolean) {
  const parsed = editorSchema.safeParse(raw);
  if (!parsed.success || JSON.stringify(raw).length > 25_000) {
    throw new WorkflowError("The process draft is invalid or too large.");
  }
  const input = parsed.data;
  const cleanDraft: Draft = {
    name: input.draft.name.trim(), purpose: input.draft.purpose.trim(),
    fields: input.draft.fields.map((field) => ({
      ...field, label: field.label.trim(), options: field.type === "select" ? field.options.map((item) => item.trim()) : [],
    })),
    escalation: input.draft.escalation,
  };
  if (publish) {
    if (actor.role !== "function_owner") throw new WorkflowError("Only an HR function owner can publish.", 403);
    const valid = definitionSchema.safeParse(cleanDraft);
    if (!valid.success) throw new WorkflowError(valid.error.issues.map((issue) => issue.message).join(" "));
    if (input.questions.length) throw new WorkflowError("Resolve and clear the open questions before publishing.");
    if (cleanDraft.escalation && !input.hrReviewerId) throw new WorkflowError("Assign an HR reviewer for exceptions.");
  }

  const id = input.id ?? randomUUID();
  return transaction(() => {
    const previous = input.id ? getProcessRow(input.id) : undefined;
    if (input.id && !previous) throw missing();
    if (actor.role !== "function_owner" && (!previous || previous.owner_id !== actor.id || input.ownerId !== actor.id)) {
      throw new WorkflowError("You do not have permission to change this process.", 403);
    }
    if (previous && previous.revision !== input.revision) {
      throw new WorkflowError("Someone saved a newer draft. Reload the editor before trying again.", 409);
    }
    const eligible = new Set(hrAccounts().map((item) => item.id));
    if (!eligible.has(input.ownerId) || (input.hrReviewerId && !eligible.has(input.hrReviewerId))) {
      throw new WorkflowError("Choose an existing HR owner and reviewer.");
    }

    const definition = JSON.stringify(cleanDraft);
    const questions = JSON.stringify(input.questions);
    const reviewer = input.hrReviewerId || null;
    const changed = !previous || previous.draft !== definition || previous.questions !== questions ||
      previous.owner_id !== input.ownerId || previous.hr_reviewer_id !== reviewer;
    const revision = (previous?.revision ?? 0) + Number(changed);
    const published = previous?.published_version ?? null;
    const nextVersion = publish && revision !== previous?.published_revision ? (published ?? 0) + 1 : published;
    if (previous) {
      db().prepare(`UPDATE processes SET draft = ?, owner_id = ?, hr_reviewer_id = ?, questions = ?,
        revision = ?, published_version = ?, published_revision = ?, updated_at = ? WHERE id = ?`)
        .run(definition, input.ownerId, reviewer, questions, revision, nextVersion,
          publish ? revision : previous.published_revision, now(), id);
    } else {
      db().prepare(`INSERT INTO processes(id, owner_id, draft, hr_reviewer_id, questions, revision,
        published_version, published_revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.ownerId, definition, reviewer, questions, revision, nextVersion, publish ? revision : null, now());
    }
    if (publish && nextVersion !== null && nextVersion !== published) {
      db().prepare("INSERT INTO process_versions VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, nextVersion, definition, input.ownerId, reviewer, actor.id, now());
    }
    return { id, version: nextVersion, revision };
  });
}

function normalizeAnswers(definition: Draft, answers: unknown) {
  const parsed = z.record(z.string(), z.string().max(4000)).safeParse(answers);
  if (!parsed.success) throw new WorkflowError("The submitted answers are invalid.");
  const data = parsed.data;
  const fields = new Set(definition.fields.map((field) => field.key));
  if (Object.keys(data).some((key) => !fields.has(key))) {
    throw new WorkflowError("The submission includes fields that do not belong to this form.");
  }
  const entries = definition.fields.map((field) => {
    const value = (Object.hasOwn(data, field.key) ? data[field.key] : "").trim();
    if (field.required && !value) throw new WorkflowError(`Enter ${field.label}.`);
    if (value && field.type === "select" && !field.options.includes(value)) {
      throw new WorkflowError(`Choose a valid option for ${field.label}.`);
    }
    if (value && field.type === "date" && !z.iso.date().safeParse(value).success) {
      throw new WorkflowError(`Enter a valid date for ${field.label}.`);
    }
    return [field.key, value] as const;
  });
  return Object.fromEntries(entries);
}

function recordEvent(caseId: string, actor: Actor, kind: string, note: string) {
  db().prepare("INSERT INTO case_events(case_id, actor_id, kind, note, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(caseId, actor.id, kind, note, now());
}

export function submitRequest(actor: Actor, input: { processId: string; version: number; answers: Record<string, string>; requestKey: string }) {
  if (!z.uuid().safeParse(input.requestKey).success) throw new WorkflowError("The submission identifier is invalid.");
  return transaction(() => {
    const existing = db().prepare("SELECT id, process_id, version, answers FROM cases WHERE requester_id = ? AND idempotency_key = ?")
      .get(actor.id, input.requestKey) as { id: string; process_id: string; version: number; answers: string } | undefined;
    const row = db().prepare(versionSelect + ` JOIN processes p ON p.id = v.process_id
      WHERE v.process_id = ? AND v.version = ? AND (p.published_version = v.version OR ? = 1)`)
      .get(input.processId, input.version, Number(Boolean(existing))) as VersionRow | undefined;
    if (!row) throw new WorkflowError("This form version is unavailable. Reopen the current form and try again.", 409);
    const answers = JSON.stringify(normalizeAnswers(parseDraft(row.definition), input.answers));
    if (existing) {
      if (existing.process_id !== input.processId || existing.version !== input.version || existing.answers !== answers) {
        throw new WorkflowError("This submission identifier was already used for a different request.", 409);
      }
      return { id: existing.id, created: false };
    }
    const managerId = requestManagerId(actor);
    if (!managerId) {
      throw new WorkflowError("Your account needs an assigned manager before you can submit a request.", 409);
    }
    const id = randomUUID();
    const at = now();
    db().prepare(`INSERT INTO cases(id, process_id, version, requester_id, manager_id, hr_reviewer_id, answers,
      status, assigned_id, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 'manager_review', ?, ?, ?, ?)`)
      .run(id, row.process_id, row.version, actor.id, managerId, answers, managerId, input.requestKey, at, at);
    recordEvent(id, actor, "Submitted", "");
    return { id, created: true };
  });
}

function caseForActor(actor: Actor, id: string) {
  const row = db().prepare(caseSelect + " WHERE c.id = ? AND ? IN (c.requester_id, c.manager_id, c.hr_reviewer_id)")
    .get(id, actor.id) as CaseRow | undefined;
  if (!row) throw missing();
  return row;
}

function summarizeCase(row: CaseRow) {
  return {
    id: row.id, name: parseDraft(row.definition).name, status: row.status, version: row.version,
    requesterName: row.requester_name, assignedName: row.assigned_name, updatedAt: row.updated_at,
  };
}

export function requestStatus(actor: Actor, id: string) {
  return summarizeCase(caseForActor(actor, id));
}

export function suggestedProcesses(sourceId: string) {
  const rows = db().prepare(versionSelect + `
    JOIN processes p ON p.id = v.process_id AND p.published_version = v.version
    JOIN process_links links ON links.target_id = p.id
    WHERE links.source_id = ? ORDER BY v.published_at DESC`).all(sourceId) as VersionRow[];
  return rows.map(parseVersion);
}

export function listCases(actor: Actor) {
  const rows = db().prepare(caseSelect + " WHERE ? IN (c.requester_id, c.manager_id, c.hr_reviewer_id) ORDER BY c.updated_at DESC")
    .all(actor.id) as CaseRow[];
  return rows.map((row) => ({
    ...summarizeCase(row), isRequester: row.requester_id === actor.id, needsAction: row.assigned_id === actor.id,
  }));
}

export function caseDetail(actor: Actor, id: string) {
  const row = caseForActor(actor, id);
  const events = db().prepare(`SELECT e.id, e.kind, e.note, e.created_at, u.name AS actor_name
    FROM case_events e JOIN users u ON e.actor_id = u.id WHERE e.case_id = ? ORDER BY e.id`).all(id) as CaseEvent[];
  return {
    ...summarizeCase(row), definition: parseDraft(row.definition), answers: JSON.parse(row.answers) as Record<string, string>,
    processId: row.process_id, isRequester: row.requester_id === actor.id,
    events, canReview: row.assigned_id === actor.id && (row.status === "manager_review" || row.status === "hr_review"),
    canRespond: row.assigned_id === actor.id && row.status === "needs_information",
  };
}

export function decideCase(actor: Actor, id: string, expectedEvent: number, decision: ReviewDecision, rawNote: string) {
  const note = rawNote.trim();
  if (note.length > 4000) throw new WorkflowError("Keep the note under 4,000 characters.");
  if (decision !== "approve" && !note) throw new WorkflowError("Enter a note for this action.");
  return transaction(() => {
    const row = caseForActor(actor, id);
    const last = db().prepare("SELECT max(id) AS id FROM case_events WHERE case_id = ?").get(id) as { id: number };
    if (row.assigned_id !== actor.id) throw new WorkflowError("This case is not assigned to you.", 403);
    if (last.id !== expectedEvent) throw new WorkflowError("This case has changed. Reload it before making a decision.", 409);
    let status: CaseStatus;
    let assigned: string | null = null;
    let hr = row.hr_reviewer_id;
    let resume: CaseRow["resume_status"] = null;
    let event: string;

    if (decision === "respond" && row.status === "needs_information" && row.resume_status) {
      status = row.resume_status;
      assigned = status === "manager_review" ? row.manager_id : hr;
      event = "Information provided";
    } else if (decision !== "respond" && (row.status === "manager_review" || row.status === "hr_review")) {
      if (decision === "request_information") {
        status = "needs_information";
        resume = row.status;
        assigned = row.requester_id;
        event = "Information requested";
      } else if (decision === "decline") {
        status = "declined";
        event = "Declined";
      } else if (row.status === "manager_review" && needsHr(parseDraft(row.definition), JSON.parse(row.answers))) {
        const version = db().prepare("SELECT hr_reviewer_id FROM process_versions WHERE process_id = ? AND version = ?")
          .get(row.process_id, row.version) as { hr_reviewer_id: string | null };
        if (!version.hr_reviewer_id || version.hr_reviewer_id === row.requester_id) {
          throw new WorkflowError("This version needs an eligible HR reviewer. Contact the process owner.", 409);
        }
        status = "hr_review";
        hr = version.hr_reviewer_id;
        assigned = hr;
        event = "Manager approved and sent to HR";
      } else {
        status = "approved";
        event = "Approved";
      }
    } else {
      throw new WorkflowError("This action is unavailable at the current step.", 409);
    }

    db().prepare("UPDATE cases SET status = ?, assigned_id = ?, hr_reviewer_id = ?, resume_status = ?, updated_at = ? WHERE id = ?")
      .run(status, assigned, hr, resume, now(), id);
    recordEvent(id, actor, event, note);
  });
}
