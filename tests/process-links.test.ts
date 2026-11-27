import assert from "node:assert/strict";
import test from "node:test";
import { accountByEmail, createAccount } from "../src/lib/accounts";
import { listProcessLinks, saveDefinition, suggestedProcesses, updateProcessLink } from "../src/lib/workflow";

process.env.WORKSHAPE_DB = ":memory:";

test("published links are directed, idempotent and managed by the source owner", () => {
  function account(name: string, role: "function_owner" | "hr" | "employee") {
    const email = name + "@fixture.invalid";
    createAccount({ email, name, role, password: "Synthetic test account password" });
    return accountByEmail(email)!;
  }

  const admin = account("admin", "function_owner");
  const owner = account("source-owner", "hr");
  const employee = account("employee", "employee");
  function process(name: string, ownerId: string, publish: boolean) {
    return saveDefinition(admin, { id: null, revision: 0, ownerId, hrReviewerId: "", questions: [],
      draft: { name, purpose: "Collect request details.", escalation: null,
        fields: [{ key: "details", label: "Details", type: "text", required: true, options: [] }] },
    }, publish).id;
  }

  const source = process("Employee onboarding", owner.id, true);
  const target = process("Equipment request", admin.id, true);
  const draft = process("Unpublished draft", owner.id, false);

  assert.throws(() => updateProcessLink(employee, source, target, "link"), /Only the source process owner/);
  assert.throws(() => updateProcessLink(owner, source, draft, "link"), /Both processes must be published/);
  assert.throws(() => updateProcessLink(admin, source, source, "link"), /two different processes/);
  assert.equal(updateProcessLink(owner, source, target, "link"), true);
  assert.equal(updateProcessLink(admin, source, target, "link"), false);
  assert.deepEqual(listProcessLinks(), [{ sourceId: source, targetId: target }]);
  assert.deepEqual(suggestedProcesses(source).map((item) => item.id), [target]);
  assert.deepEqual(suggestedProcesses(target), []);
  assert.throws(() => updateProcessLink(employee, source, target, "unlink"), /Only the source process owner/);
  assert.equal(updateProcessLink(admin, source, target, "unlink"), true);
  assert.deepEqual(listProcessLinks(), []);
});
