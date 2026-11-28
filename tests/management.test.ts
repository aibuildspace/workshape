import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { accountByEmail, createAccount, type Actor, type Role } from "../src/lib/accounts";
import { db } from "../src/lib/db";
import { managementCsv } from "../src/lib/management";
import type { EditorInput } from "../src/lib/process";
import { caseDetail, decideCase, listCases, listManagedProcesses, managedClarificationReasons,
  managedProcess, managedProcessTrends, requestStatus,
  saveDefinition, submitRequest } from "../src/lib/workflow";

process.env.WORKSHAPE_DB = ":memory:";

function user(role: Role, name: string, managerEmail?: string): Actor {
  const email = `${name}@management.test`;
  createAccount({ email, name, role, managerEmail, password: "Test account password only" });
  return accountByEmail(email)!;
}

function processDraft(ownerId: string, name: string): EditorInput {
  return { id: null, revision: 0, ownerId, hrReviewerId: "", questions: [],
    draft: { name, purpose: "Review a request.", fields: [
      { key: "reason", label: "Reason", type: "text", required: true, options: [] },
    ], escalation: null } };
}

test("management aggregates are scoped to the current process owner and never grant case access", () => {
  const functionOwner = user("function_owner", "portfolio-owner");
  const firstOwner = user("hr", "first-owner");
  const secondOwner = user("hr", "second-owner");
  const unrelatedHr = user("hr", "unrelated-hr");
  const manager = user("manager", "line-manager");
  const employee = user("employee", "requester", manager.email);
  const outsider = user("employee", "outsider", manager.email);
  const first = saveDefinition(functionOwner, processDraft(firstOwner.id, "Travel request"), true);
  const second = saveDefinition(functionOwner, processDraft(secondOwner.id, "Equipment request"), true);
  const caseId = submitRequest(employee, { processId: first.id, version: 1,
    answers: { reason: "A trip" }, requestKey: randomUUID() }).id;
  const anchor = new Date("2026-11-28T12:00:00.000Z");
  db().prepare("UPDATE cases SET updated_at = ? WHERE id = ?").run("2026-11-26T12:00:00.000Z", caseId);

  assert.equal(listManagedProcesses(functionOwner, anchor).length, 2);
  const owned = listManagedProcesses(firstOwner, anchor);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].id, first.id);
  assert.equal(owned[0].totalCases, 1);
  assert.equal(owned[0].activeCases, 1);
  assert.equal(owned[0].waiting48h, 1);
  assert.equal(managedProcess(secondOwner, second.id, anchor).totalCases, 0);
  assert.throws(() => managedProcess(firstOwner, second.id, anchor), /unavailable/);
  assert.throws(() => managedProcessTrends(firstOwner, second.id, anchor), /unavailable/);
  assert.throws(() => managedClarificationReasons(firstOwner, second.id), /unavailable/);
  assert.deepEqual(listManagedProcesses(unrelatedHr, anchor), []);
  for (const denied of [manager, employee, outsider]) {
    assert.throws(() => listManagedProcesses(denied, anchor), /unavailable/);
    assert.throws(() => managedProcess(denied, first.id, anchor), /unavailable/);
    assert.throws(() => managedProcessTrends(denied, first.id, anchor), /unavailable/);
    assert.throws(() => managedClarificationReasons(denied, first.id), /unavailable/);
  }

  // Process ownership exposes aggregate counts, while the shared case operations still deny access.
  assert.equal(listCases(firstOwner).length, 0);
  assert.throws(() => caseDetail(firstOwner, caseId), /unavailable/);
  assert.throws(() => requestStatus(firstOwner, caseId), /unavailable/);
  assert.throws(() => decideCase(firstOwner, caseId, 1, "approve", ""), /unavailable/);
  assert.equal(listCases(manager).length, 1);
  assert.equal(Object.hasOwn(managedProcessTrends(firstOwner, first.id, anchor), "events"), false);

  const csv = managementCsv(owned);
  assert.match(csv, /Travel request/);
  for (const sensitive of [caseId, "requester", "line-manager", "A trip"]) assert.equal(csv.includes(sensitive), false);
  assert.equal(csv.includes("Equipment request"), false);

  decideCase(manager, caseId, caseDetail(manager, caseId).events.at(-1)!.id, "request_information", "Please explain.",
    undefined, "missing_detail");
  const changed = managedProcess(firstOwner, first.id, new Date());
  assert.equal(changed.needsInformation, 1);
  assert.equal(changed.clarifiedCases, 1);
  assert.equal(changed.managerReview, 0);
  assert.equal(managedClarificationReasons(firstOwner, first.id).find((item) => item.code === "missing_detail")?.cases, null);
  assert.equal(managedClarificationReasons(firstOwner, first.id).find((item) => item.code === "other")?.cases, 0);
  for (let index = 0; index < 4; index++) {
    const next = submitRequest(employee, { processId: first.id, version: 1,
      answers: { reason: `Trip ${index}` }, requestKey: randomUUID() });
    decideCase(manager, next.id, caseDetail(manager, next.id).events.at(-1)!.id,
      "request_information", "Please explain.", undefined, "missing_detail");
  }
  assert.equal(managedClarificationReasons(firstOwner, first.id).find((item) => item.code === "missing_detail")?.cases, 5);
});
