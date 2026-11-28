import assert from "node:assert/strict";
import test from "node:test";
import { definitionSchema, needsHr } from "../src/lib/process";
import { draftFromTemplate, processTemplates } from "../src/lib/process-templates";

test("starter templates produce valid, independent process drafts", () => {
  assert.equal(new Set(processTemplates.map((item) => item.id)).size, processTemplates.length);
  for (const template of processTemplates) {
    const draft = draftFromTemplate(template.id);
    assert.ok(draft);
    assert.equal(definitionSchema.safeParse(draft).success, true, template.id);
    draft.fields[0].label = "Changed in one draft";
    assert.notEqual(draftFromTemplate(template.id)?.fields[0].label, "Changed in one draft");
  }
  assert.equal(draftFromTemplate("missing"), undefined);
});

test("template decision paths match their described routes", () => {
  const flexible = draftFromTemplate("flexible-work")!;
  assert.equal(needsHr(flexible, { work_location: "International" }), true);
  assert.equal(needsHr(flexible, { work_location: "Domestic" }), false);
  const leave = draftFromTemplate("leave")!;
  assert.equal(leave.escalation, null);
  const exception = draftFromTemplate("policy-exception")!;
  assert.equal(needsHr(exception, { request_category: "Policy exception" }), true);
  assert.equal(needsHr(exception, { request_category: "Standard request" }), false);
});
