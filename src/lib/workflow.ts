import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAccount, requestManagerId, roles, type Actor } from "./accounts";
import { clarificationReasonLabel, clarificationReasons, validClarificationReason } from "./clarification";
import { db, transaction } from "./db";
import { calculateManagementTrends, managementPrivacyFloor, type ManagementCase, type ManagementEvent } from "./management-metrics";
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
  owner_name: string; hr_reviewer_name: string | null; published_at: string;
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
  planned_hr_reviewer_name: string | null; delegated_by_name: string | null;
  answers: string; definition: string; status: CaseStatus; resume_status: "manager_review" | "hr_review" | null;
  created_at: string; updated_at: string;
};

type CaseEvent = { id: number; kind: string; note: string; clarification_reason: string | null;
  actor_name: string; created_at: string;
  previous_answers: string | null; updated_answers: string | null };
const processSelect = "SELECT p.*, u.name AS owner_name FROM processes p JOIN users u ON u.id = p.owner_id";
const versionSelect = `SELECT v.*, u.name AS owner_name, reviewer.name AS hr_reviewer_name FROM process_versions v
  JOIN users u ON u.id = v.owner_id
  LEFT JOIN users reviewer ON reviewer.id = v.hr_reviewer_id`;
const caseSelect = `SELECT c.*, requester.name AS requester_name, assignee.name AS assigned_name,
  planned_hr.name AS planned_hr_reviewer_name, grantor.name AS delegated_by_name, v.definition
  FROM cases c JOIN users requester ON requester.id = c.requester_id
  LEFT JOIN users assignee ON assignee.id = c.assigned_id
  JOIN process_versions v ON v.process_id = c.process_id AND v.version = c.version
  LEFT JOIN users planned_hr ON planned_hr.id = v.hr_reviewer_id
  LEFT JOIN case_delegations active_grant ON active_grant.case_id = c.id AND active_grant.ended_at IS NULL
  LEFT JOIN users grantor ON grantor.id = active_grant.delegator_id`;
const caseVisibility = `(? IN (c.requester_id, c.manager_id, c.hr_reviewer_id) OR
  (c.assigned_id = ? AND EXISTS (SELECT 1 FROM case_delegations d WHERE d.case_id = c.id
    AND d.delegate_id = ? AND d.ended_at IS NULL AND d.expires_at > ? AND d.step = c.status)))`;

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
    ownerName: row.owner_name, hrReviewerName: row.hr_reviewer_name, publishedAt: row.published_at };
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

type ManagedProcessRow = ProcessRow & {
  total_cases: number; manager_review: number; hr_review: number; needs_information: number;
  approved: number; declined: number; waiting_48h: number; clarified_cases: number;
};

export function listManagedProcesses(actor: Actor, asOf = new Date()) {
  if (actor.role !== "function_owner" && actor.role !== "hr") throw missing();
  const threshold = new Date(asOf.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const rows = db().prepare(`SELECT p.*, owner.name AS owner_name,
    count(c.id) AS total_cases,
    count(c.id) FILTER (WHERE c.status = 'manager_review') AS manager_review,
    count(c.id) FILTER (WHERE c.status = 'hr_review') AS hr_review,
    count(c.id) FILTER (WHERE c.status = 'needs_information') AS needs_information,
    count(c.id) FILTER (WHERE c.status = 'approved') AS approved,
    count(c.id) FILTER (WHERE c.status = 'declined') AS declined,
    count(c.id) FILTER (WHERE c.status IN ('manager_review', 'hr_review', 'needs_information')
      AND c.updated_at <= ?) AS waiting_48h,
    count(c.id) FILTER (WHERE EXISTS (SELECT 1 FROM case_events e
      WHERE e.case_id = c.id AND e.kind = 'Information requested')) AS clarified_cases
    FROM processes p JOIN users owner ON owner.id = p.owner_id
    LEFT JOIN cases c ON c.process_id = p.id
    WHERE ? = 'function_owner' OR p.owner_id = ?
    GROUP BY p.id ORDER BY p.updated_at DESC`).all(threshold, actor.role, actor.id) as ManagedProcessRow[];
  return rows.map((row) => ({
    id: row.id, name: parseDraft(row.draft).name || "Untitled process", ownerName: row.owner_name,
    version: row.published_version, hasUnpublishedChanges: row.published_version !== null && row.revision !== row.published_revision,
    openQuestions: (JSON.parse(row.questions) as string[]).length, updatedAt: row.updated_at,
    totalCases: row.total_cases, managerReview: row.manager_review, hrReview: row.hr_review,
    needsInformation: row.needs_information, approved: row.approved, declined: row.declined,
    waiting48h: row.waiting_48h, clarifiedCases: row.clarified_cases,
    activeCases: row.manager_review + row.hr_review + row.needs_information,
  }));
}

export function managedProcess(actor: Actor, id: string, asOf = new Date()) {
  const item = listManagedProcesses(actor, asOf).find((process) => process.id === id);
  if (!item) throw missing();
  return item;
}

export function managedProcessTrends(actor: Actor, id: string, asOf = new Date()) {
  managedProcess(actor, id, asOf);
  const cases = db().prepare(`SELECT id, created_at AS createdAt, updated_at AS updatedAt, status
    FROM cases WHERE process_id = ? AND created_at <= ? ORDER BY created_at`)
    .all(id, asOf.toISOString()) as ManagementCase[];
  const events = db().prepare(`SELECT events.case_id AS caseId, events.kind,
    events.created_at AS at FROM case_events events JOIN cases c ON c.id = events.case_id
    WHERE c.process_id = ? AND events.created_at <= ? ORDER BY events.case_id, events.id`)
    .all(id, asOf.toISOString()) as ManagementEvent[];
  return calculateManagementTrends(cases, events, asOf);
}

export function managedClarificationReasons(actor: Actor, id: string) {
  managedProcess(actor, id);
  const rows = db().prepare(`SELECT events.clarification_reason AS code,
    count(DISTINCT events.case_id) AS cases
    FROM case_events events JOIN cases c ON c.id = events.case_id
    WHERE c.process_id = ? AND events.kind = 'Information requested'
    GROUP BY events.clarification_reason`).all(id) as { code: string | null; cases: number }[];
  const counts = new Map(rows.map((row) => [row.code, row.cases]));
  const safe = (count: number) => count === 0 || count >= managementPrivacyFloor ? count : null;
  return [
    ...clarificationReasons.map((reason) => ({ code: reason.code, label: reason.label,
      cases: safe(counts.get(reason.code) ?? 0) })),
    ...(counts.get(null) ? [{ code: "earlier", label: "Earlier requests without a category",
      cases: safe(counts.get(null)!) }] : []),
  ];
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

export function ownershipHistory(actor: Actor, id: string) {
  const row = getProcessRow(id);
  if (!row || !canEditProcess(actor, row)) throw missing();
  return db().prepare(`SELECT events.id, previous.name AS fromName, current.name AS toName,
    changed.name AS changedBy, events.changed_at AS changedAt
    FROM process_ownership_events events
    LEFT JOIN users previous ON previous.id = events.from_owner_id
    JOIN users current ON current.id = events.to_owner_id
    JOIN users changed ON changed.id = events.changed_by
    WHERE events.process_id = ? ORDER BY events.id DESC`).all(id) as {
      id: number; fromName: string | null; toName: string; changedBy: string; changedAt: string;
    }[];
}

export function processQuestionHistory(actor: Actor, id: string) {
  const row = getProcessRow(id);
  if (!row || !canEditProcess(actor, row)) throw missing();
  return db().prepare(`SELECT resolutions.id, resolutions.question, resolutions.answer,
    resolutions.target_kind AS targetKind, resolutions.target_key AS targetKey,
    resolutions.target_label AS targetLabel, users.name AS resolvedBy,
    resolutions.resolved_at AS resolvedAt
    FROM process_question_resolutions resolutions
    JOIN users ON users.id = resolutions.resolved_by
    WHERE resolutions.process_id = ? ORDER BY resolutions.id DESC`).all(id) as {
      id: number; question: string; answer: string; targetKind: "process" | "routing" | "field";
      targetKey: string | null; targetLabel: string; resolvedBy: string; resolvedAt: string;
    }[];
}

type QuestionAssignmentRow = {
  id: number; process_id: string; question_index: number; question: string; assignee_id: string;
  assigned_by: string; assigned_at: string; expires_at: string; revoked_by: string | null;
  revoked_at: string | null; completed_at: string | null;
};

export function processQuestionAssignments(actor: Actor, id: string) {
  const row = getProcessRow(id);
  if (!row || !canEditProcess(actor, row)) throw missing();
  return db().prepare(`SELECT assignments.id, assignments.question_index AS questionIndex,
    assignments.question, assignee.name AS assigneeName, grantor.name AS assignedBy,
    assignments.assigned_at AS assignedAt, assignments.expires_at AS expiresAt,
    revoker.name AS revokedBy, assignments.revoked_at AS revokedAt,
    assignments.completed_at AS completedAt
    FROM process_question_assignments assignments
    JOIN users assignee ON assignee.id = assignments.assignee_id
    JOIN users grantor ON grantor.id = assignments.assigned_by
    LEFT JOIN users revoker ON revoker.id = assignments.revoked_by
    WHERE assignments.process_id = ? ORDER BY assignments.id DESC`).all(id) as {
      id: number; questionIndex: number; question: string; assigneeName: string; assignedBy: string;
      assignedAt: string; expiresAt: string; revokedBy: string | null;
      revokedAt: string | null; completedAt: string | null;
    }[];
}

export function assignProcessQuestion(actor: Actor, raw: {
  processId: string; expectedRevision: number; questionIndex: number; assigneeId: string; expiresAt: string;
}) {
  const parsed = z.object({ processId: z.uuid(), expectedRevision: z.number().int().nonnegative(),
    questionIndex: z.number().int().nonnegative(), assigneeId: z.uuid(),
    expiresAt: z.iso.datetime({ offset: true }) }).safeParse(raw);
  if (!parsed.success) throw new WorkflowError("Choose an HR colleague and a valid expiry time.");
  const input = parsed.data;
  const expiry = Date.parse(input.expiresAt);
  if (expiry <= Date.now() || expiry > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    throw new WorkflowError("Choose an expiry within the next 90 days.");
  }
  const expiresAt = new Date(expiry).toISOString();
  return transaction(() => {
    const row = getProcessRow(input.processId);
    if (!row || !canEditProcess(actor, row)) throw missing();
    if (row.revision !== input.expectedRevision) throw new WorkflowError("The draft changed. Reload before assigning this question.", 409);
    const question = (JSON.parse(row.questions) as string[])[input.questionIndex];
    if (!question) throw new WorkflowError("This question is no longer open.", 409);
    const assignee = db().prepare("SELECT id, name, role FROM users WHERE id = ?").get(input.assigneeId) as
      Pick<Actor, "id" | "name" | "role"> | undefined;
    if (!assignee || !["hr", "function_owner"].includes(assignee.role)) {
      throw new WorkflowError("Choose an existing HR colleague.");
    }
    const assignedAt = now();
    db().prepare(`UPDATE process_question_assignments SET revoked_by = ?, revoked_at = ?
      WHERE process_id = ? AND question_index = ? AND revoked_at IS NULL AND completed_at IS NULL`)
      .run(actor.id, assignedAt, row.id, input.questionIndex);
    const result = db().prepare(`INSERT INTO process_question_assignments
      (process_id, question_index, question, assignee_id, assigned_by, assigned_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(row.id, input.questionIndex, question, assignee.id,
        actor.id, assignedAt, expiresAt);
    return { id: Number(result.lastInsertRowid), questionIndex: input.questionIndex, question,
      assigneeName: assignee.name, assignedBy: actor.name, assignedAt, expiresAt,
      revokedBy: null, revokedAt: null, completedAt: null };
  });
}

export function revokeProcessQuestionAssignment(actor: Actor, assignmentId: number) {
  if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0) throw missing();
  return transaction(() => {
    const assignment = db().prepare("SELECT * FROM process_question_assignments WHERE id = ?")
      .get(assignmentId) as QuestionAssignmentRow | undefined;
    const row = assignment && getProcessRow(assignment.process_id);
    if (!row || !canEditProcess(actor, row)) throw missing();
    if (assignment.revoked_at || assignment.completed_at) throw new WorkflowError("This assignment is no longer active.", 409);
    const revokedAt = now();
    db().prepare("UPDATE process_question_assignments SET revoked_by = ?, revoked_at = ? WHERE id = ?")
      .run(actor.id, revokedAt, assignmentId);
    return { id: assignmentId, revokedBy: actor.name, revokedAt };
  });
}

export function listAssignedProcessQuestions(actor: Actor) {
  const rows = db().prepare(`SELECT assignments.id, assignments.question, assignments.expires_at AS expiresAt,
    processes.draft, processes.id AS processId
    FROM process_question_assignments assignments JOIN processes ON processes.id = assignments.process_id
    WHERE assignments.assignee_id = ? AND assignments.revoked_at IS NULL AND assignments.completed_at IS NULL
      AND assignments.expires_at > ? ORDER BY assignments.expires_at, assignments.id`)
    .all(actor.id, now()) as { id: number; question: string; expiresAt: string; draft: string; processId: string }[];
  return rows.map(({ draft, ...row }) => ({ ...row, processName: parseDraft(draft).name || "Untitled process" }));
}

export function assignedProcessQuestion(actor: Actor, assignmentId: number) {
  if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0) throw missing();
  const assignment = db().prepare("SELECT * FROM process_question_assignments WHERE id = ?")
    .get(assignmentId) as QuestionAssignmentRow | undefined;
  if (!assignment || assignment.assignee_id !== actor.id || assignment.revoked_at || assignment.completed_at ||
      assignment.expires_at <= now()) throw missing();
  const row = getProcessRow(assignment.process_id);
  if (!row || (JSON.parse(row.questions) as string[])[assignment.question_index] !== assignment.question) throw missing();
  const draft = parseDraft(row.draft);
  return { id: assignment.id, question: assignment.question, questionIndex: assignment.question_index,
    processId: row.id, processName: draft.name || "Untitled process", revision: row.revision,
    fields: draft.fields.map(({ key, label }) => ({ key, label })), expiresAt: assignment.expires_at };
}

export function resolveProcessQuestion(actor: Actor, raw: {
  processId: string; expectedRevision: number; questionIndex: number; answer: string; target: string;
}) {
  const parsed = z.object({ processId: z.uuid(), expectedRevision: z.number().int().nonnegative(),
    questionIndex: z.number().int().nonnegative(), answer: z.string().trim().min(1).max(4000),
    target: z.string().max(100) }).safeParse(raw);
  if (!parsed.success) throw new WorkflowError("Enter an answer and choose where it applies.");
  const input = parsed.data;
  return transaction(() => {
    const row = getProcessRow(input.processId);
    if (!row) throw missing();
    const assignment = db().prepare(`SELECT * FROM process_question_assignments
      WHERE process_id = ? AND question_index = ? AND assignee_id = ?
        AND revoked_at IS NULL AND completed_at IS NULL AND expires_at > ?`)
      .get(row.id, input.questionIndex, actor.id, now()) as QuestionAssignmentRow | undefined;
    if (!canEditProcess(actor, row) && !assignment) throw missing();
    if (row.revision !== input.expectedRevision) {
      throw new WorkflowError("Someone saved a newer draft. Reload the editor before answering this question.", 409);
    }
    const questions = JSON.parse(row.questions) as string[];
    const question = questions[input.questionIndex];
    if (!question) throw new WorkflowError("This question is no longer open. Reload the editor.", 409);
    if (!canEditProcess(actor, row) && assignment?.question !== question) throw missing();
    const definition = parseDraft(row.draft);
    let targetKind: "process" | "routing" | "field";
    let targetKey: string | null = null;
    let targetLabel: string;
    if (input.target === "process") {
      targetKind = "process";
      targetLabel = "Process details";
    } else if (input.target === "routing") {
      targetKind = "routing";
      targetLabel = "Routing";
    } else if (input.target.startsWith("field:")) {
      targetKey = input.target.slice(6);
      const field = definition.fields.find((item) => item.key === targetKey);
      if (!field) throw new WorkflowError("Choose a current intake field for this answer.");
      targetKind = "field";
      targetLabel = field.label || field.key;
    } else {
      throw new WorkflowError("Choose where this answer applies.");
    }
    questions.splice(input.questionIndex, 1);
    const resolvedAt = now();
    const result = db().prepare(`INSERT INTO process_question_resolutions
      (process_id, question, answer, target_kind, target_key, target_label, resolved_by, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(row.id, question, input.answer, targetKind, targetKey,
        targetLabel, actor.id, resolvedAt);
    db().prepare("UPDATE processes SET questions = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(questions), row.revision + 1, resolvedAt, row.id);
    db().prepare(`UPDATE process_question_assignments SET completed_at = ? WHERE process_id = ?
      AND question_index = ? AND revoked_at IS NULL AND completed_at IS NULL`)
      .run(resolvedAt, row.id, input.questionIndex);
    db().prepare(`UPDATE process_question_assignments SET question_index = question_index - 1
      WHERE process_id = ? AND question_index > ? AND revoked_at IS NULL AND completed_at IS NULL`)
      .run(row.id, input.questionIndex);
    return { id: Number(result.lastInsertRowid), revision: row.revision + 1, question,
      answer: input.answer, targetKind, targetKey, targetLabel, resolvedBy: actor.name, resolvedAt };
  });
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

export function listAccounts(actor: Actor) {
  if (actor.role !== "function_owner") throw missing();
  const rows = db().prepare("SELECT id, name, email, role, manager_id AS managerId FROM users ORDER BY name")
    .all() as { id: string; name: string; email: string; role: Actor["role"]; managerId: string | null }[];
  return rows.map((row) => ({ ...row }));
}

export function provisionAccount(actor: Actor, input: {
  name: string; email: string; role: Actor["role"]; password: string; managerEmail?: string;
}) {
  if (actor.role !== "function_owner") throw new WorkflowError("Only an HR function owner can add accounts.", 403);
  const parsed = z.object({ name: z.string().trim().min(1).max(100), email: z.email().max(254),
    role: z.enum(roles), password: z.string().min(15).max(256), managerEmail: z.email().optional() }).safeParse(input);
  if (!parsed.success) throw new WorkflowError("Enter a valid name, email, role, and password of at least 15 characters.");
  if (parsed.data.role === "employee" && !parsed.data.managerEmail) {
    throw new WorkflowError("Choose a manager for the employee.");
  }
  if (parsed.data.role !== "employee" && parsed.data.managerEmail) {
    throw new WorkflowError("Only employee accounts can have a manager.");
  }
  if (db().prepare("SELECT 1 FROM users WHERE email = ?").get(parsed.data.email.toLowerCase())) {
    throw new WorkflowError("An account with that email already exists.", 409);
  }
  try { return createAccount(parsed.data); }
  catch { throw new WorkflowError("The account could not be created. Check the manager and try again."); }
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
    if (previous) {
      const openQuestions = JSON.parse(previous.questions) as string[];
      if (openQuestions.some((question, index) => input.questions[index] !== question)) {
        throw new WorkflowError("Answer open questions on the process before removing or moving them.", 409);
      }
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
    if (!previous || previous.owner_id !== input.ownerId) {
      db().prepare(`INSERT INTO process_ownership_events(process_id, from_owner_id, to_owner_id, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?)`).run(id, previous?.owner_id ?? null, input.ownerId, actor.id, now());
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

function recordEvent(caseId: string, actor: Actor, kind: string, note: string, clarificationReason: string | null = null) {
  return Number(db().prepare(`INSERT INTO case_events(case_id, actor_id, kind, note, clarification_reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(caseId, actor.id, kind, note, clarificationReason, now()).lastInsertRowid);
}

function notifyAssignment(caseId: string, assigneeId: string | null, actorId: string, kind: string) {
  db().prepare("UPDATE notifications SET read_at = ? WHERE case_id = ? AND read_at IS NULL").run(now(), caseId);
  if (!assigneeId || assigneeId === actorId) return;
  db().prepare("INSERT INTO notifications(user_id, case_id, kind, created_at) VALUES (?, ?, ?, ?)")
    .run(assigneeId, caseId, kind, now());
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
    notifyAssignment(id, managerId, actor.id, "New request assigned to you");
    return { id, created: true };
  });
}

function expireCaseDelegations() {
  const at = now();
  const expired = db().prepare(`SELECT d.id, d.case_id AS caseId, d.step,
    d.delegator_id AS delegatorId, d.delegate_id AS delegateId
    FROM case_delegations d WHERE d.ended_at IS NULL AND d.expires_at <= ?`).all(at) as {
      id: number; caseId: string; step: CaseStatus; delegatorId: string; delegateId: string;
    }[];
  if (!expired.length) return;
  const apply = () => {
    for (const item of expired) {
      const ended = db().prepare(`UPDATE case_delegations SET ended_at = ?, end_kind = 'expired'
        WHERE id = ? AND ended_at IS NULL`).run(at, item.id);
      if (!ended.changes) continue;
      const restored = db().prepare(`UPDATE cases SET assigned_id = ?, updated_at = ?
        WHERE id = ? AND status = ? AND assigned_id = ?`)
        .run(item.delegatorId, at, item.caseId, item.step, item.delegateId);
      if (restored.changes) notifyAssignment(item.caseId, item.delegatorId, item.delegateId, "Delegation expired; review returned to you");
    }
  };
  if (db().isTransaction) apply();
  else transaction(apply);
}

function caseForActor(actor: Actor, id: string) {
  expireCaseDelegations();
  const row = db().prepare(caseSelect + ` WHERE c.id = ? AND ${caseVisibility}`)
    .get(id, actor.id, actor.id, actor.id, now()) as CaseRow | undefined;
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
  expireCaseDelegations();
  const rows = db().prepare(caseSelect + ` WHERE ${caseVisibility} ORDER BY c.updated_at DESC`)
    .all(actor.id, actor.id, actor.id, now()) as CaseRow[];
  return rows.map((row) => ({
    ...summarizeCase(row), isRequester: row.requester_id === actor.id, needsAction: row.assigned_id === actor.id,
    delegatedByName: row.assigned_id === actor.id ? row.delegated_by_name : null,
  }));
}

export function listNotifications(actor: Actor) {
  expireCaseDelegations();
  return db().prepare(`SELECT n.id, n.case_id AS caseId, n.kind, n.created_at AS createdAt,
    n.read_at AS readAt FROM notifications n JOIN cases c ON c.id = n.case_id
    WHERE n.user_id = ? AND n.read_at IS NULL AND ${caseVisibility}
    ORDER BY n.id DESC LIMIT 30`).all(actor.id, actor.id, actor.id, actor.id, now()) as {
      id: number; caseId: string; kind: string; createdAt: string; readAt: string | null;
    }[];
}

export function readNotification(actor: Actor, notificationId: number) {
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) throw missing();
  expireCaseDelegations();
  return transaction(() => {
    const item = db().prepare(`SELECT n.case_id AS caseId FROM notifications n JOIN cases c ON c.id = n.case_id
      WHERE n.id = ? AND n.user_id = ? AND ${caseVisibility}`)
      .get(notificationId, actor.id, actor.id, actor.id, actor.id, now()) as { caseId: string } | undefined;
    if (!item) throw missing();
    db().prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(now(), notificationId);
    return item.caseId;
  });
}

type DelegationRow = { id: number; case_id: string; step: "manager_review" | "hr_review";
  delegator_id: string; delegate_id: string; expires_at: string };

function activeCaseDelegation(caseId: string) {
  return db().prepare(`SELECT id, case_id, step, delegator_id, delegate_id, expires_at
    FROM case_delegations WHERE case_id = ? AND ended_at IS NULL AND expires_at > ?`)
    .get(caseId, now()) as DelegationRow | undefined;
}

function originalReviewer(actor: Actor, row: CaseRow) {
  return row.status === "manager_review" ? row.manager_id === actor.id :
    row.status === "hr_review" && row.hr_reviewer_id === actor.id;
}

export function caseDelegationCandidates(actor: Actor, id: string) {
  const row = caseForActor(actor, id);
  if (!originalReviewer(actor, row) || row.assigned_id !== actor.id || activeCaseDelegation(id)) throw missing();
  const roles = row.status === "manager_review" ? ["manager"] : ["hr", "function_owner"];
  const candidates = db().prepare(`SELECT id, name FROM users WHERE role IN (${roles.map(() => "?").join(",")})
    AND id NOT IN (?, ?) ORDER BY name`).all(...roles, actor.id, row.requester_id) as { id: string; name: string }[];
  return candidates.map(({ id, name }) => ({ id, name }));
}

export function delegateCase(actor: Actor, input: {
  caseId: string; expectedEvent: number; delegateId: string; expiresAt: string;
}) {
  const parsed = z.object({ caseId: z.uuid(), expectedEvent: z.number().int().nonnegative(),
    delegateId: z.uuid(), expiresAt: z.iso.datetime({ offset: true }) }).safeParse(input);
  if (!parsed.success) throw new WorkflowError("Choose an eligible colleague and a valid expiry time.");
  const expires = Date.parse(parsed.data.expiresAt);
  if (expires <= Date.now() || expires > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    throw new WorkflowError("Set an expiry within the next 30 days.");
  }
  return transaction(() => {
    const row = caseForActor(actor, input.caseId);
    if (!originalReviewer(actor, row) || row.assigned_id !== actor.id || activeCaseDelegation(input.caseId)) {
      throw new WorkflowError("Only the current recorded reviewer can delegate this review step.", 403);
    }
    const last = db().prepare("SELECT max(id) AS id FROM case_events WHERE case_id = ?")
      .get(input.caseId) as { id: number };
    if (last.id !== input.expectedEvent) throw new WorkflowError("This case has changed. Reload it before delegating.", 409);
    const candidate = db().prepare(`SELECT id, name, role FROM users WHERE id = ?`).get(input.delegateId) as
      { id: string; name: string; role: Actor["role"] } | undefined;
    if (!candidate || candidate.id === actor.id || candidate.id === row.requester_id ||
      (row.status === "manager_review" ? candidate.role !== "manager" :
        candidate.role !== "hr" && candidate.role !== "function_owner")) {
      throw new WorkflowError("Choose an eligible reviewer for this step.");
    }
    const at = now();
    const created = db().prepare(`INSERT INTO case_delegations
      (case_id, step, delegator_id, delegate_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(input.caseId, row.status, actor.id, candidate.id, at, input.expiresAt);
    db().prepare("UPDATE cases SET assigned_id = ?, updated_at = ? WHERE id = ?")
      .run(candidate.id, at, input.caseId);
    recordEvent(input.caseId, actor, "Review delegated", `Delegated to ${candidate.name} until ${input.expiresAt}.`);
    notifyAssignment(input.caseId, candidate.id, actor.id, "Review delegated to you");
    return { id: Number(created.lastInsertRowid) };
  });
}

export function revokeCaseDelegation(actor: Actor, input: { delegationId: number; expectedEvent: number }) {
  if (!Number.isSafeInteger(input.delegationId) || input.delegationId < 1 ||
    !Number.isSafeInteger(input.expectedEvent) || input.expectedEvent < 0) throw missing();
  return transaction(() => {
    const grant = db().prepare(`SELECT id, case_id, step, delegator_id, delegate_id, expires_at
      FROM case_delegations WHERE id = ? AND ended_at IS NULL AND expires_at > ?`)
      .get(input.delegationId, now()) as DelegationRow | undefined;
    if (!grant) throw missing();
    const row = caseForActor(actor, grant.case_id);
    if (grant.delegator_id !== actor.id || row.status !== grant.step || row.assigned_id !== grant.delegate_id) {
      throw new WorkflowError("Only the recorded reviewer can revoke this active delegation.", 403);
    }
    const last = db().prepare("SELECT max(id) AS id FROM case_events WHERE case_id = ?")
      .get(grant.case_id) as { id: number };
    if (last.id !== input.expectedEvent) throw new WorkflowError("This case has changed. Reload it before revoking.", 409);
    const at = now();
    db().prepare(`UPDATE case_delegations SET ended_at = ?, end_kind = 'revoked' WHERE id = ?`).run(at, grant.id);
    db().prepare("UPDATE cases SET assigned_id = ?, updated_at = ? WHERE id = ?")
      .run(actor.id, at, grant.case_id);
    recordEvent(grant.case_id, actor, "Delegation revoked", "Review returned to the recorded reviewer.");
    notifyAssignment(grant.case_id, actor.id, grant.delegate_id, "Delegated review returned to you");
    return { caseId: grant.case_id };
  });
}

export function caseDetail(actor: Actor, id: string) {
  const row = caseForActor(actor, id);
  const activeDelegation = activeCaseDelegation(id);
  const delegationHistory = db().prepare(`SELECT d.id, grantor.name AS delegatorName,
    delegate.name AS delegateName, d.created_at AS createdAt, d.expires_at AS expiresAt,
    d.ended_at AS endedAt, d.end_kind AS endKind
    FROM case_delegations d JOIN users grantor ON grantor.id = d.delegator_id
    JOIN users delegate ON delegate.id = d.delegate_id
    WHERE d.case_id = ? ORDER BY d.id DESC`).all(id) as {
      id: number; delegatorName: string; delegateName: string; createdAt: string;
      expiresAt: string; endedAt: string | null; endKind: string | null;
    }[];
  const events = db().prepare(`SELECT e.id, e.kind, e.note, e.clarification_reason, e.created_at, u.name AS actor_name,
    changes.previous_answers, changes.updated_answers FROM case_events e
    JOIN users u ON e.actor_id = u.id LEFT JOIN case_answer_changes changes ON changes.event_id = e.id
    WHERE e.case_id = ? ORDER BY e.id`).all(id) as CaseEvent[];
  return {
    ...summarizeCase(row), definition: parseDraft(row.definition), answers: JSON.parse(row.answers) as Record<string, string>,
    processId: row.process_id, isRequester: row.requester_id === actor.id,
    hrReviewerName: row.planned_hr_reviewer_name,
    events: events.map((event) => {
      const before = event.previous_answers ? JSON.parse(event.previous_answers) as Record<string, string> : {};
      const after = event.updated_answers ? JSON.parse(event.updated_answers) as Record<string, string> : {};
      return { id: event.id, kind: event.kind, note: event.note, actor_name: event.actor_name,
        clarificationReason: clarificationReasonLabel(event.clarification_reason),
        created_at: event.created_at, changes: Object.entries(after).filter(([key, value]) => before[key] !== value)
          .map(([key, value]) => ({ key, before: before[key] ?? "", after: value })) };
    }), delegationHistory, activeDelegation: activeDelegation ? {
      id: activeDelegation.id, delegatorName: delegationHistory.find((item) => item.id === activeDelegation.id)?.delegatorName ?? "Recorded reviewer",
      delegateName: delegationHistory.find((item) => item.id === activeDelegation.id)?.delegateName ?? "Delegate",
      expiresAt: activeDelegation.expires_at,
    } : null,
    canDelegate: originalReviewer(actor, row) && row.assigned_id === actor.id && !activeDelegation,
    canRevokeDelegation: activeDelegation?.delegator_id === actor.id,
    isActingDelegate: activeDelegation?.delegate_id === actor.id,
    canReview: row.assigned_id === actor.id && (row.status === "manager_review" || row.status === "hr_review"),
    canRespond: row.assigned_id === actor.id && row.status === "needs_information",
  };
}

export function requestForMcp(actor: Actor, id: string) {
  const item = caseDetail(actor, id);
  const last = item.events.at(-1);
  return {
    id: item.id, processId: item.processId, processName: item.name, version: item.version,
    status: item.status, requesterName: item.requesterName, assignedName: item.assignedName,
    fields: item.definition.fields.map((field) => ({
      key: field.key, label: field.label, type: field.type, required: field.required,
      options: field.options, value: item.answers[field.key] ?? "",
    })),
    pendingQuestion: item.status === "needs_information" && last?.kind === "Information requested" ? {
      reason: last.clarificationReason, note: last.note, askedBy: last.actor_name,
    } : null,
    history: item.events.map((event) => ({
      kind: event.kind, actorName: event.actor_name, at: event.created_at,
      note: event.note, clarificationReason: event.clarificationReason, changes: event.changes,
    })),
    availableAction: item.canRespond && last ? { name: "respond_to_request", expectedEvent: last.id } : null,
  };
}

export function decideCase(actor: Actor, id: string, expectedEvent: number, decision: ReviewDecision, rawNote: string,
  correctedAnswers?: Record<string, string>, rawClarificationReason?: string) {
  const note = rawNote.trim();
  if (note.length > 4000) throw new WorkflowError("Keep the note under 4,000 characters.");
  if (decision !== "approve" && !note) throw new WorkflowError("Enter a note for this action.");
  if (decision === "request_information" && !validClarificationReason(rawClarificationReason ?? "")) {
    throw new WorkflowError("Choose why more information is needed.");
  }
  return transaction(() => {
    const row = caseForActor(actor, id);
    const last = db().prepare("SELECT max(id) AS id FROM case_events WHERE case_id = ?").get(id) as { id: number };
    if (row.assigned_id !== actor.id) throw new WorkflowError("This case is not assigned to you.", 403);
    if (last.id !== expectedEvent) throw new WorkflowError("This case has changed. Reload it before making a decision.", 409);
    const delegation = activeCaseDelegation(id);
    let status: CaseStatus;
    let assigned: string | null = null;
    let hr = row.hr_reviewer_id;
    let resume: CaseRow["resume_status"] = null;
    let event: string;
    let updatedAnswers: string | null = null;

    if (decision === "respond" && row.status === "needs_information" && row.resume_status) {
      if (!correctedAnswers) throw new WorkflowError("Reopen the case and complete the response form.");
      updatedAnswers = JSON.stringify(normalizeAnswers(parseDraft(row.definition), correctedAnswers));
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

    db().prepare("UPDATE cases SET status = ?, assigned_id = ?, hr_reviewer_id = ?, resume_status = ?, answers = ?, updated_at = ? WHERE id = ?")
      .run(status, assigned, hr, resume, updatedAnswers ?? row.answers, now(), id);
    if (delegation && delegation.delegate_id === actor.id) {
      db().prepare(`UPDATE case_delegations SET ended_at = ?, end_kind = 'decision' WHERE id = ?`)
        .run(now(), delegation.id);
    }
    const eventId = recordEvent(id, actor, event, note,
      decision === "request_information" ? rawClarificationReason! : null);
    if (updatedAnswers && updatedAnswers !== row.answers) {
      db().prepare("INSERT INTO case_answer_changes(event_id, previous_answers, updated_answers) VALUES (?, ?, ?)")
        .run(eventId, row.answers, updatedAnswers);
    }
    notifyAssignment(id, assigned, actor.id, event === "Information requested" ? "More information requested" :
      event === "Information provided" ? "Request returned for review" : "Request assigned for HR review");
    return { actedAsDelegate: delegation?.delegate_id === actor.id };
  });
}
