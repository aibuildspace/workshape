import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { accountByEmail, createAccount, type Actor, type Role } from "../src/lib/accounts";
import { caseCsv } from "../src/lib/case-table";
import { db } from "../src/lib/db";
import type { EditorInput } from "../src/lib/process";
import { caseDelegationCandidates, caseDetail, decideCase, delegateCase, listCases,
  listNotifications, requestStatus, revokeCaseDelegation, saveDefinition, submitRequest } from "../src/lib/workflow";

process.env.WORKSHAPE_DB = ":memory:";

function user(role: Role, name: string, managerEmail?: string): Actor {
  const email = `${name}@delegation.test`;
  createAccount({ email, name, role, managerEmail, password: "Test account password only" });
  return accountByEmail(email)!;
}

function submit(owner: Actor, requester: Actor, reviewer: Actor, answer = "Routine") {
  const input: EditorInput = { id: null, revision: 0, ownerId: owner.id, hrReviewerId: reviewer.id,
    questions: [], draft: { name: "Review test", purpose: "Check delegation.", fields: [
      { key: "kind", label: "Kind", type: "select", required: true, options: ["Routine", "Exception"] },
    ], escalation: { field: "kind", operator: "equals", value: "Exception" } } };
  const { id, version } = saveDefinition(owner, input, true);
  return submitRequest(requester, { processId: id, version: version!, answers: { kind: answer }, requestKey: randomUUID() }).id;
}

test("current reviewer can delegate one step and only the active delegate may decide it", () => {
  const owner = user("function_owner", "delegate-owner");
  const manager = user("manager", "delegate-manager");
  const colleague = user("manager", "delegate-colleague");
  const hr = user("hr", "delegate-hr");
  const employee = user("employee", "delegate-employee", manager.email);
  const stranger = user("employee", "delegate-stranger", manager.email);
  const caseId = submit(owner, employee, hr);
  const before = caseDetail(manager, caseId).events.at(-1)!.id;
  assert.throws(() => caseDetail(colleague, caseId), /unavailable/);
  assert.equal(listCases(colleague).length, 0);
  assert.throws(() => requestStatus(colleague, caseId), /unavailable/);
  assert.deepEqual(caseDelegationCandidates(manager, caseId).map((item) => item.id), [colleague.id]);
  assert.throws(() => caseDelegationCandidates(stranger, caseId), /unavailable/);
  assert.throws(() => delegateCase(stranger, { caseId, expectedEvent: before, delegateId: colleague.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString() }), /unavailable/);
  assert.throws(() => delegateCase(manager, { caseId, expectedEvent: before, delegateId: hr.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString() }), /eligible reviewer/);
  assert.throws(() => delegateCase(manager, { caseId, expectedEvent: before, delegateId: colleague.id,
    expiresAt: new Date(Date.now() + 31 * 86400000).toISOString() }), /next 30 days/);
  const grant = delegateCase(manager, { caseId, expectedEvent: before, delegateId: colleague.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(caseDetail(manager, caseId).canReview, false);
  assert.equal(caseDetail(manager, caseId).canRevokeDelegation, true);
  assert.equal(caseDetail(colleague, caseId).canReview, true);
  assert.equal(caseDetail(colleague, caseId).isActingDelegate, true);
  assert.equal(caseDetail(employee, caseId).activeDelegation?.delegateName, colleague.name);
  assert.equal(listCases(colleague).some((item) => item.id === caseId && item.needsAction), true);
  assert.equal(listCases(colleague).find((item) => item.id === caseId)?.delegatedByName, manager.name);
  assert.equal(listNotifications(colleague).some((item) => item.caseId === caseId), true);
  assert.equal(requestStatus(colleague, caseId).status, "manager_review");
  assert.equal(caseCsv(listCases(colleague)).includes(caseId), true);
  assert.throws(() => caseDelegationCandidates(colleague, caseId), /unavailable/);
  assert.throws(() => delegateCase(colleague, { caseId, expectedEvent: before, delegateId: manager.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString() }), /recorded reviewer/);
  assert.throws(() => decideCase(manager, caseId, before, "approve", ""), /not assigned/);
  assert.throws(() => decideCase(colleague, caseId, before, "approve", ""), /changed/);
  assert.throws(() => revokeCaseDelegation(stranger, { delegationId: grant.id,
    expectedEvent: before }), /unavailable/);
  const delegatedEvent = caseDetail(colleague, caseId).events.at(-1)!.id;
  assert.equal(decideCase(colleague, caseId, delegatedEvent, "approve", "").actedAsDelegate, true);
  assert.equal(requestStatus(employee, caseId).status, "approved");
  assert.throws(() => caseDetail(colleague, caseId), /unavailable/);
  assert.throws(() => requestStatus(colleague, caseId), /unavailable/);
  assert.equal(listCases(colleague).some((item) => item.id === caseId), false);
  assert.equal(caseDetail(manager, caseId).delegationHistory[0].endKind, "decision");
  assert.equal(caseDetail(manager, caseId).events.at(-1)?.actor_name, colleague.name);
});

test("grantor can reclaim review; expiry restores assignment and removes delegate list and status access", () => {
  const owner = user("function_owner", "reclaim-owner");
  const manager = user("manager", "reclaim-manager");
  const colleague = user("manager", "reclaim-colleague");
  const hr = user("hr", "reclaim-hr");
  const employee = user("employee", "reclaim-employee", manager.email);
  const caseId = submit(owner, employee, hr);
  const before = caseDetail(manager, caseId).events.at(-1)!.id;
  const grant = delegateCase(manager, { caseId, expectedEvent: before, delegateId: colleague.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString() });
  assert.throws(() => revokeCaseDelegation(manager, { delegationId: grant.id, expectedEvent: before }), /changed/);
  const delegatedEvent = caseDetail(manager, caseId).events.at(-1)!.id;
  revokeCaseDelegation(manager, { delegationId: grant.id, expectedEvent: delegatedEvent });
  assert.equal(caseDetail(manager, caseId).canReview, true);
  assert.equal(caseDetail(manager, caseId).delegationHistory[0].endKind, "revoked");
  assert.throws(() => caseDetail(colleague, caseId), /unavailable/);
  assert.equal(caseCsv(listCases(colleague)).includes(caseId), false);
  assert.throws(() => decideCase(colleague, caseId, delegatedEvent, "approve", ""), /unavailable/);

  const second = delegateCase(manager, { caseId, expectedEvent: caseDetail(manager, caseId).events.at(-1)!.id,
    delegateId: colleague.id, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  db().prepare("UPDATE case_delegations SET expires_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 1000).toISOString(), second.id);
  assert.equal(listCases(colleague).some((item) => item.id === caseId), false);
  assert.throws(() => requestStatus(colleague, caseId), /unavailable/);
  assert.equal(listNotifications(colleague).some((item) => item.caseId === caseId), false);
  assert.equal(listCases(manager).find((item) => item.id === caseId)?.needsAction, true);
  assert.equal(caseDetail(manager, caseId).delegationHistory[0].endKind, "expired");
});

test("HR review may be delegated only to an HR colleague or function owner", () => {
  const owner = user("function_owner", "hr-handoff-owner");
  const manager = user("manager", "hr-handoff-manager");
  const hr = user("hr", "hr-handoff-reviewer");
  const otherHr = user("hr", "hr-handoff-colleague");
  const employee = user("employee", "hr-handoff-employee", manager.email);
  const caseId = submit(owner, employee, hr, "Exception");
  decideCase(manager, caseId, caseDetail(manager, caseId).events.at(-1)!.id, "approve", "");
  const candidateIds = caseDelegationCandidates(hr, caseId).map((item) => item.id);
  assert.equal(candidateIds.includes(otherHr.id), true);
  assert.equal(candidateIds.includes(owner.id), true);
  assert.equal(candidateIds.includes(manager.id), false);
  const grant = delegateCase(hr, { caseId, expectedEvent: caseDetail(hr, caseId).events.at(-1)!.id,
    delegateId: otherHr.id, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(requestStatus(otherHr, caseId).status, "hr_review");
  assert.throws(() => revokeCaseDelegation(manager, { delegationId: grant.id,
    expectedEvent: caseDetail(hr, caseId).events.at(-1)!.id }), /recorded reviewer/);
});
