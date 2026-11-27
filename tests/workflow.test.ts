import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { accountByEmail, createAccount, roles, type Actor } from "../src/lib/accounts";
import type { EditorInput } from "../src/lib/process";
import { caseDetail, decideCase, editableProcess, publishedProcess, requestStatus, saveDefinition, submitRequest } from "../src/lib/workflow";

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

  const intake = { processId: id, version: 1, requestKey: randomUUID(), answers: { location: "Domestic" } };
  const routine = submitRequest(employee, intake);
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
  decideCase(manager, exception.id, managerEvent, "request_information", "Confirm the location.");
  assert.equal(requestStatus(employee, exception.id).status, "needs_information");
  decideCase(employee, exception.id, caseDetail(employee, exception.id).events.at(-1)!.id, "respond", "Confirmed.");
  assert.throws(() => decideCase(manager, exception.id, managerEvent, "approve", ""), /changed/);
  decideCase(manager, exception.id, caseDetail(manager, exception.id).events.at(-1)!.id, "approve", "");
  assert.equal(requestStatus(hr, exception.id).status, "hr_review");
  decideCase(hr, exception.id, caseDetail(hr, exception.id).events.at(-1)!.id, "approve", "");
  assert.equal(requestStatus(employee, exception.id).status, "approved");

  const edited = editableProcess(owner, id);
  edited.draft.fields[0].label = "Updated location";
  assert.equal(saveDefinition(owner, edited, true).version, 2);
  assert.equal(publishedProcess(id).definition.fields[0].label, "Updated location");
  assert.equal(caseDetail(employee, exception.id).definition.fields[0].label, "Location");
  assert.throws(() => submitRequest(employee, { ...intake, requestKey: randomUUID() }), /version is unavailable/);
  assert.deepEqual(submitRequest(employee, intake), { id: routine.id, created: false });
});
