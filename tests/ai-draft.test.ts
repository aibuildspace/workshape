import assert from "node:assert/strict";
import test from "node:test";
import { definitionSchema, prepareAiDraft } from "../src/lib/process";

test("an incomplete generated draft remains editable and fails publication validation", () => {
  const result = prepareAiDraft({
    process: { name: "Flexible work", purpose: "Review schedule requests.", fields: [], escalation: null },
    questions: ["Which details should employees provide?"],
  });
  assert.deepEqual(result.process.fields, []);
  assert.deepEqual(result.questions, ["Add between 1 and 20 fields.", "Which details should employees provide?"]);
  assert.equal(definitionSchema.safeParse(result.process).success, false);
});

test("technical key repair preserves a uniquely identified routing field", () => {
  const result = prepareAiDraft({
    process: {
      name: "Flexible work", purpose: "Review schedule requests.",
      fields: [{ key: "Work Location", label: "Work location", type: "select", required: true,
        options: [" Domestic", "International", "International "] }],
      escalation: { field: "Work Location", operator: "equals", value: " International " },
    },
    questions: [],
  });
  assert.deepEqual(result.process.fields[0].options, ["Domestic", "International"]);
  assert.deepEqual(result.process.escalation, {
    field: result.process.fields[0].key, operator: "equals", value: "International",
  });
  assert.equal(definitionSchema.safeParse(result.process).success, true);
  assert.deepEqual(result.questions, []);
});

test("duplicate field keys leave the affected routing rule unresolved", () => {
  const field = { key: "location", label: "Work location", type: "select" as const, required: true, options: ["Domestic", "International"] };
  const result = prepareAiDraft({
    process: {
      name: "Flexible work", purpose: "Review schedule requests.",
      fields: [field, { ...field, label: "Manager location" }],
      escalation: { field: "location", operator: "equals", value: "International" },
    },
    questions: [],
  });
  assert.equal(new Set(result.process.fields.map(({ key }) => key)).size, 2);
  assert.equal(result.process.escalation?.field, "");
  assert.match(result.questions.join(" "), /required dropdown/);
  assert.equal(definitionSchema.safeParse(result.process).success, false);
});
