import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { accountByEmail, createAccount } from "../src/lib/accounts";
import { caseDetail, decideCase, listCases, requestForMcp, saveDefinition, submitRequest } from "../src/lib/workflow";

process.env.WORKSHAPE_DB = ":memory:";

test("MCP case detail gives participants response context and denies unrelated people", () => {
  createAccount({ name: "Owner", email: "owner@mcp.test", role: "function_owner", password: "Test password only 123" });
  createAccount({ name: "Manager", email: "manager@mcp.test", role: "manager", password: "Test password only 123" });
  createAccount({ name: "Requester", email: "requester@mcp.test", role: "employee",
    managerEmail: "manager@mcp.test", password: "Test password only 123" });
  createAccount({ name: "Other", email: "other@mcp.test", role: "employee",
    managerEmail: "manager@mcp.test", password: "Test password only 123" });
  const owner = accountByEmail("owner@mcp.test")!;
  const manager = accountByEmail("manager@mcp.test")!;
  const requester = accountByEmail("requester@mcp.test")!;
  const other = accountByEmail("other@mcp.test")!;
  const saved = saveDefinition(owner, { id: null, revision: 0, ownerId: owner.id, hrReviewerId: "",
    questions: [], draft: { name: "MCP test", purpose: "Check case participation.",
      fields: [{ key: "schedule", label: "Schedule", type: "text", required: true, options: [] }],
      escalation: null } }, true);
  const caseId = submitRequest(requester, { processId: saved.id, version: saved.version!,
    answers: { schedule: "Tuesday" }, requestKey: randomUUID() }).id;
  const first = requestForMcp(requester, caseId);
  assert.equal(first.availableAction, null);
  assert.equal(first.fields[0].value, "Tuesday");
  assert.equal(listCases(other).some((item) => item.id === caseId), false);
  assert.throws(() => requestForMcp(other, caseId), /unavailable/);
  assert.throws(() => requestForMcp(owner, caseId), /unavailable/);

  decideCase(manager, caseId, caseDetail(manager, caseId).events.at(-1)!.id,
    "request_information", "Please confirm the schedule.", undefined, "confirm_answer");
  const pending = requestForMcp(requester, caseId);
  assert.equal(pending.pendingQuestion?.note, "Please confirm the schedule.");
  assert.equal(pending.availableAction?.name, "respond_to_request");
  assert.equal(requestForMcp(manager, caseId).availableAction, null);
  assert.throws(() => decideCase(other, caseId, pending.availableAction!.expectedEvent,
    "respond", "Tuesday every week", { schedule: "Tuesday every week" }), /unavailable/);
  decideCase(requester, caseId, pending.availableAction!.expectedEvent,
    "respond", "Tuesday every week", { schedule: "Tuesday every week" });
  assert.equal(requestForMcp(requester, caseId).fields[0].value, "Tuesday every week");
  assert.throws(() => decideCase(requester, caseId, pending.availableAction!.expectedEvent,
    "respond", "Duplicate", { schedule: "Tuesday every week" }), /not assigned|changed/);
});
