import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { accountByEmail, createAccount, roles, type Actor } from "../src/lib/accounts";
import { db } from "../src/lib/db";
import type { EditorInput } from "../src/lib/process";
import { assignProcessQuestion, assignedProcessQuestion, caseDetail, decideCase, editableProcess, listAssignedProcessQuestions,
  listAccounts, listCases, listNotifications, ownershipHistory, processQuestionAssignments, processQuestionHistory,
  provisionAccount, publishedProcess, readNotification, requestStatus, resolveProcessQuestion,
  revokeProcessQuestionAssignment, saveDefinition, submitRequest } from "../src/lib/workflow";

process.env.WORKSHAPE_DB = ":memory:";

function user(role: (typeof roles)[number], name: string, managerEmail?: string): Actor {
  const email = name + "@fixture.invalid";
  createAccount({ email, name, role, managerEmail, password: "Test account password only" });
  return accountByEmail(email)!;
}

test("published routes, case permissions, idempotent submissions, and pinned versions", () => {
  const owner = user("function_owner", "owner");
  const manager = user("manager", "manager");
  const hr = user("hr", "reviewer");
  const employee = user("employee", "employee", manager.email);
  const unrelated = user("employee", "unrelated", manager.email);

  const draft: EditorInput = {
    id: null, revision: 0, ownerId: hr.id, hrReviewerId: hr.id, questions: [],
    draft: { name: "Flexible work", purpose: "Review work locations.", fields: [
      { key: "location", label: "Location", type: "select", required: true, options: ["Domestic", "International"] },
    ], escalation: { field: "location", operator: "equals", value: "International" } },
  };

  assert.throws(() => saveDefinition(employee, draft, true), /function owner/);
  const saved = saveDefinition(owner, draft, false);
  assert.throws(() => publishedProcess(saved.id), /unavailable/);
  const delegated = editableProcess(hr, saved.id);
  assert.throws(() => saveDefinition(hr, delegated, true), /function owner/);
  const { id, version } = saveDefinition(owner, delegated, true);
  assert.equal(version, 1);
  assert.equal(publishedProcess(id).hrReviewerName, hr.name);

  const intake = { processId: id, version: 1, requestKey: randomUUID(), answers: { location: "Domestic" } };
  const routine = submitRequest(employee, intake);
  assert.equal(listNotifications(manager).at(0)?.kind, "New request assigned to you");
  assert.equal(listNotifications(unrelated).length, 0);
  const alertId = listNotifications(manager).at(0)!.id;
  assert.throws(() => readNotification(unrelated, alertId), /unavailable/);
  assert.equal(readNotification(manager, alertId), routine.id);
  assert.equal(listNotifications(manager).length, 0);
  assert.deepEqual(submitRequest(employee, intake), { id: routine.id, created: false });
  assert.throws(() => submitRequest(employee, { ...intake, answers: { location: "International" } }), /already used/);
  assert.throws(() => requestStatus(unrelated, routine.id), /unavailable/);
  assert.throws(() => requestStatus(hr, routine.id), /unavailable/);
  assert.equal(caseDetail(manager, routine.id).canReview, true);
  assert.equal(caseDetail(employee, routine.id).canReview, false);
  decideCase(manager, routine.id, caseDetail(manager, routine.id).events.at(-1)!.id, "approve", "");
  assert.equal(requestStatus(employee, routine.id).status, "approved");

  const exception = submitRequest(employee, { ...intake, requestKey: randomUUID(), answers: { location: "International" } });
  const managerEvent = caseDetail(manager, exception.id).events.at(-1)!.id;
  assert.throws(() => decideCase(manager, exception.id, managerEvent, "request_information", "Confirm the location."),
    /Choose why more information/);
  assert.throws(() => decideCase(manager, exception.id, managerEvent, "request_information", "Confirm the location.",
    undefined, "untrusted_code"), /Choose why more information/);
  decideCase(manager, exception.id, managerEvent, "request_information", "Confirm the location.",
    undefined, "confirm_answer");
  assert.equal(requestStatus(employee, exception.id).status, "needs_information");
  assert.equal(caseDetail(employee, exception.id).events.at(-1)?.clarificationReason, "Confirm or correct an answer");
  decideCase(employee, exception.id, caseDetail(employee, exception.id).events.at(-1)!.id, "respond", "Confirmed.", { location: "International" });
  assert.throws(() => decideCase(manager, exception.id, managerEvent, "approve", ""), /changed/);
  decideCase(manager, exception.id, caseDetail(manager, exception.id).events.at(-1)!.id, "approve", "");
  assert.equal(requestStatus(hr, exception.id).status, "hr_review");
  decideCase(hr, exception.id, caseDetail(hr, exception.id).events.at(-1)!.id, "approve", "");
  assert.equal(requestStatus(employee, exception.id).status, "approved");

  const corrected = submitRequest(employee, { ...intake, requestKey: randomUUID() });
  decideCase(manager, corrected.id, caseDetail(manager, corrected.id).events.at(-1)!.id,
    "request_information", "Please confirm the location.", undefined, "missing_detail");
  assert.equal(listNotifications(manager).some((item) => item.caseId === corrected.id), false);
  assert.equal(listNotifications(employee).at(0)?.kind, "More information requested");
  const responseEvent = caseDetail(employee, corrected.id).events.at(-1)!.id;
  assert.throws(() => decideCase(unrelated, corrected.id, responseEvent, "respond", "Changed.",
    { location: "International" }), /unavailable/);
  assert.throws(() => decideCase(employee, corrected.id, responseEvent, "respond", "Changed.",
    { location: "Invalid" }), /valid option/);
  decideCase(employee, corrected.id, responseEvent, "respond", "The location is international.",
    { location: "International" });
  const correctedDetail = caseDetail(manager, corrected.id);
  assert.equal(correctedDetail.answers.location, "International");
  assert.deepEqual(correctedDetail.events.at(-1)?.changes,
    [{ key: "location", before: "Domestic", after: "International" }]);
  assert.equal(listCases(manager).filter((item) => item.id === corrected.id).length, 1);
  decideCase(manager, corrected.id, correctedDetail.events.at(-1)!.id, "approve", "");
  assert.equal(requestStatus(hr, corrected.id).status, "hr_review");
  assert.equal(caseDetail(manager, corrected.id).hrReviewerName, hr.name);
  assert.equal(listNotifications(hr).at(0)?.kind, "Request assigned for HR review");
  assert.equal(Object.hasOwn(requestStatus(employee, corrected.id), "answers"), false);
  assert.equal(listCases(unrelated).length, 0);

  const edited = editableProcess(owner, id);
  edited.draft.fields[0].label = "Updated location";
  assert.equal(saveDefinition(owner, edited, true).version, 2);
  assert.equal(publishedProcess(id).definition.fields[0].label, "Updated location");
  assert.equal(caseDetail(employee, exception.id).definition.fields[0].label, "Location");
  assert.throws(() => submitRequest(employee, { ...intake, requestKey: randomUUID() }), /version is unavailable/);
  assert.deepEqual(submitRequest(employee, intake), { id: routine.id, created: false });
});

test("only the function owner can list and create accounts", () => {
  const owner = user("function_owner", "account-owner");
  const employee = user("employee", "account-employee");
  const input = { name: "New manager", email: "new-manager@fixture.invalid", role: "manager" as const,
    password: "Synthetic password only" };
  assert.throws(() => listAccounts(employee), /unavailable/);
  assert.throws(() => provisionAccount(employee, input), /Only an HR function owner/);
  const id = provisionAccount(owner, input);
  assert.equal(listAccounts(owner).find((item) => item.id === id)?.email, input.email);
  assert.throws(() => provisionAccount(owner, input), /already exists/);
  assert.throws(() => provisionAccount(owner, { ...input, role: "employee", email: "no-manager@fixture.invalid" }),
    /Choose a manager/);
});

test("function owner transfers process ownership with a recorded history", () => {
  const admin = user("function_owner", "transfer-admin");
  const firstOwner = user("hr", "transfer-first");
  const nextOwner = user("hr", "transfer-next");
  const created = saveDefinition(admin, { id: null, revision: 0, ownerId: firstOwner.id,
    hrReviewerId: "", questions: [], draft: { name: "Transfer test", purpose: "Check owner changes.",
      fields: [{ key: "reason", label: "Reason", type: "text", required: true, options: [] }], escalation: null } }, false);
  assert.equal(ownershipHistory(firstOwner, created.id).at(0)?.toName, firstOwner.name);
  const input = editableProcess(admin, created.id);
  input.ownerId = nextOwner.id;
  saveDefinition(admin, input, false);
  const history = ownershipHistory(admin, created.id);
  assert.deepEqual(history.map((event) => [event.fromName, event.toName]),
    [[firstOwner.name, nextOwner.name], [null, firstOwner.name]]);
  assert.throws(() => editableProcess(firstOwner, created.id), /unavailable/);
  assert.throws(() => ownershipHistory(firstOwner, created.id), /unavailable/);
  assert.equal(editableProcess(nextOwner, created.id).ownerId, nextOwner.id);
  assert.throws(() => saveDefinition(nextOwner, editableProcess(nextOwner, created.id), true), /function owner/);
});

test("draft questions require recorded answers before publication", () => {
  const admin = user("function_owner", "question-admin");
  const owner = user("hr", "question-owner");
  const unrelated = user("hr", "question-unrelated");
  const created = saveDefinition(admin, { id: null, revision: 0, ownerId: owner.id, hrReviewerId: "",
    questions: ["Which reason is required?"], draft: { name: "Question process", purpose: "Clarify intake.",
      fields: [{ key: "reason", label: "Reason", type: "text", required: true, options: [] }], escalation: null } }, false);
  const draft = editableProcess(admin, created.id);
  assert.throws(() => saveDefinition(admin, { ...draft, questions: [] }, false), /Answer open questions/);
  assert.throws(() => saveDefinition(admin, { ...draft, questions: [] }, true), /Answer open questions/);
  assert.throws(() => saveDefinition(admin, draft, true), /open questions/);
  assert.throws(() => processQuestionHistory(unrelated, created.id), /unavailable/);
  const answer = { processId: created.id, expectedRevision: created.revision, questionIndex: 0,
    answer: "Collect a short business reason.", target: "field:reason" };
  assert.throws(() => resolveProcessQuestion(unrelated, answer), /unavailable/);
  assert.throws(() => resolveProcessQuestion(owner, { ...answer, target: "field:unknown" }), /current intake field/);
  const resolution = resolveProcessQuestion(owner, answer);
  assert.equal(resolution.targetLabel, "Reason");
  assert.equal(editableProcess(owner, created.id).questions.length, 0);
  assert.equal(processQuestionHistory(admin, created.id)[0].answer, answer.answer);
  assert.equal(processQuestionHistory(owner, created.id)[0].resolvedBy, owner.name);
  assert.throws(() => resolveProcessQuestion(owner, answer), /newer draft/);
  assert.equal(saveDefinition(admin, editableProcess(admin, created.id), true).version, 1);
});

test("a question delegation grants only its active assignee the answer action", () => {
  const admin = user("function_owner", "delegate-admin");
  const owner = user("hr", "delegate-owner");
  const colleague = user("hr", "delegate-colleague");
  const other = user("hr", "delegate-other");
  const employee = user("employee", "delegate-employee");
  const created = saveDefinition(admin, { id: null, revision: 0, ownerId: owner.id, hrReviewerId: "",
    questions: ["First question?", "Second question?"], draft: { name: "Delegation process", purpose: "Check scoped access.",
      fields: [{ key: "reason", label: "Reason", type: "text", required: true, options: [] }], escalation: null } }, false);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const grant = { processId: created.id, expectedRevision: created.revision, questionIndex: 1,
    assigneeId: colleague.id, expiresAt };
  assert.throws(() => assignProcessQuestion(other, grant), /unavailable/);
  assert.throws(() => assignProcessQuestion(owner, { ...grant, assigneeId: employee.id }), /HR colleague/);
  assert.throws(() => assignProcessQuestion(owner, { ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() }), /expiry/);
  const assignment = assignProcessQuestion(owner, grant);
  assert.throws(() => saveDefinition(owner, { ...editableProcess(owner, created.id),
    questions: ["Second question?", "First question?"] }, false), /removing or moving/);
  assert.equal(listAssignedProcessQuestions(colleague).length, 1);
  assert.equal(listAssignedProcessQuestions(other).length, 0);
  assert.equal(assignedProcessQuestion(colleague, assignment.id).question, "Second question?");
  assert.throws(() => assignedProcessQuestion(other, assignment.id), /unavailable/);
  assert.throws(() => editableProcess(colleague, created.id), /unavailable/);
  assert.throws(() => processQuestionHistory(colleague, created.id), /unavailable/);
  assert.throws(() => processQuestionAssignments(colleague, created.id), /unavailable/);
  assert.throws(() => resolveProcessQuestion(other, { processId: created.id, expectedRevision: created.revision,
    questionIndex: 1, answer: "No access", target: "process" }), /unavailable/);
  assert.throws(() => revokeProcessQuestionAssignment(other, assignment.id), /unavailable/);
  resolveProcessQuestion(owner, { processId: created.id, expectedRevision: created.revision,
    questionIndex: 0, answer: "First answer", target: "process" });
  assert.equal(assignedProcessQuestion(colleague, assignment.id).questionIndex, 0);
  assert.throws(() => resolveProcessQuestion(colleague, { processId: created.id, expectedRevision: created.revision,
    questionIndex: 0, answer: "Stale", target: "process" }), /newer draft/);
  resolveProcessQuestion(colleague, { processId: created.id, expectedRevision: created.revision + 1,
    questionIndex: 0, answer: "Second answer", target: "field:reason" });
  assert.equal(listAssignedProcessQuestions(colleague).length, 0);
  assert.equal(processQuestionHistory(owner, created.id)[0].resolvedBy, colleague.name);
  assert.throws(() => assignedProcessQuestion(colleague, assignment.id), /unavailable/);
  assert.equal(processQuestionAssignments(owner, created.id)[0].completedAt !== null, true);

  const another = saveDefinition(admin, { id: null, revision: 0, ownerId: owner.id, hrReviewerId: "",
    questions: ["Pending?"], draft: { name: "Revocation process", purpose: "Check revocation.",
      fields: [{ key: "reason", label: "Reason", type: "text", required: true, options: [] }], escalation: null } }, false);
  const revoked = assignProcessQuestion(owner, { ...grant, processId: another.id, expectedRevision: another.revision, questionIndex: 0 });
  revokeProcessQuestionAssignment(owner, revoked.id);
  assert.throws(() => assignedProcessQuestion(colleague, revoked.id), /unavailable/);
  assert.equal(listAssignedProcessQuestions(colleague).length, 0);
  assert.throws(() => resolveProcessQuestion(colleague, { processId: another.id, expectedRevision: another.revision,
    questionIndex: 0, answer: "After revocation", target: "process" }), /unavailable/);
  const expired = assignProcessQuestion(owner, { ...grant, processId: another.id,
    expectedRevision: another.revision, questionIndex: 0 });
  db().prepare("UPDATE process_question_assignments SET expires_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 1000).toISOString(), expired.id);
  assert.equal(listAssignedProcessQuestions(colleague).length, 0);
  assert.throws(() => assignedProcessQuestion(colleague, expired.id), /unavailable/);
  assert.throws(() => resolveProcessQuestion(colleague, { processId: another.id, expectedRevision: another.revision,
    questionIndex: 0, answer: "After expiry", target: "process" }), /unavailable/);
});
