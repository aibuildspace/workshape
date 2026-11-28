import assert from "node:assert/strict";
import test from "node:test";
import { accountByEmail, actorForMcpToken, actorForSession, authenticate, changePassword, createAccount, createSession,
  issueMcpToken, requestManagerId, resetPassword, revokeSession } from "../src/lib/accounts";

process.env.WORKSHAPE_DB = ":memory:";

test("individual accounts authenticate through revocable sessions", () => {
  const password = "A test-only password with sufficient length";
  createAccount({ email: "owner@accounts.test", name: "Owner", role: "function_owner", password });
  createAccount({ email: "manager@accounts.test", name: "Manager", role: "manager", password });
  createAccount({ email: "employee@accounts.test", name: "Employee", role: "employee",
    managerEmail: "manager@accounts.test", password });

  assert.equal(authenticate("owner@accounts.test", "wrong password"), undefined);
  const owner = authenticate("owner@accounts.test", password)!;
  const employee = authenticate("employee@accounts.test", password)!;
  assert.equal(owner.role, "function_owner");
  assert.equal(requestManagerId(employee), accountByEmail("manager@accounts.test")?.id);

  const token = createSession(employee.id);
  assert.equal(actorForSession(token)?.id, employee.id);
  assert.equal(actorForSession("not-a-session"), undefined);
  revokeSession(token);
  assert.equal(actorForSession(token), undefined);
});

test("password changes verify the current password and revoke all local credentials", () => {
  const original = "Original password for this test";
  const changed = "Changed password for this test";
  const recovered = "Recovery password for this test";
  const id = createAccount({ email: "change@accounts.test", name: "Change Test", role: "hr", password: original });
  const actor = accountByEmail("change@accounts.test")!;
  const firstSession = createSession(id);
  const secondSession = createSession(id);
  const firstMcpToken = issueMcpToken(id);

  assert.throws(() => changePassword(actor, "incorrect", changed), /current password is incorrect/);
  assert.throws(() => changePassword(actor, original, original), /different/);
  assert.throws(() => changePassword(actor, original, "too short"), /between 15 and 256/);
  assert.equal(actorForSession(firstSession)?.id, id);
  assert.equal(actorForMcpToken(firstMcpToken)?.id, id);

  changePassword(actor, original, changed);
  assert.equal(authenticate(actor.email, original), undefined);
  assert.equal(authenticate(actor.email, changed)?.id, id);
  assert.equal(actorForSession(firstSession), undefined);
  assert.equal(actorForSession(secondSession), undefined);
  assert.equal(actorForMcpToken(firstMcpToken), undefined);

  const recoverySession = createSession(id);
  const recoveryMcpToken = issueMcpToken(id);
  assert.throws(() => resetPassword("missing@accounts.test", recovered), /Account not found/);
  resetPassword(actor.email, recovered);
  assert.equal(authenticate(actor.email, changed), undefined);
  assert.equal(authenticate(actor.email, recovered)?.id, id);
  assert.equal(actorForSession(recoverySession), undefined);
  assert.equal(actorForMcpToken(recoveryMcpToken), undefined);
});
