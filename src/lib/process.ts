import { z } from "zod";

export const fieldTypes = ["text", "textarea", "date", "select"] as const;

export const draftFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(fieldTypes),
  required: z.boolean(),
  options: z.array(z.string()),
});

const escalationSchema = z.object({
  field: z.string(),
  operator: z.enum(["equals", "does_not_equal"]),
  value: z.string(),
});

export const draftSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  fields: z.array(draftFieldSchema),
  escalation: escalationSchema.nullable(),
});

export const aiDraftSchema = z.object({
  process: draftSchema,
  questions: z.array(z.string()),
});

export type Draft = z.infer<typeof draftSchema>;

export const definitionSchema = draftSchema.superRefine((draft, ctx) => {
  if (draft.name.trim().length === 0 || draft.name.length > 100) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "Enter a process name of up to 100 characters." });
  }
  if (draft.purpose.trim().length === 0 || draft.purpose.length > 1000) {
    ctx.addIssue({ code: "custom", path: ["purpose"], message: "Enter a purpose of up to 1,000 characters." });
  }
  if (draft.fields.length < 1 || draft.fields.length > 20) {
    ctx.addIssue({ code: "custom", path: ["fields"], message: "Add between 1 and 20 fields." });
  }
  const keys = new Set<string>();
  for (const [index, field] of draft.fields.entries()) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key) || keys.has(field.key)) {
      ctx.addIssue({ code: "custom", path: ["fields", index], message: "Every field needs a unique key." });
    }
    keys.add(field.key);
    if (field.label.trim().length === 0 || field.label.length > 120) {
      ctx.addIssue({ code: "custom", path: ["fields", index], message: "Enter a label of up to 120 characters for every field." });
    }
    if (field.type === "select" && (field.options.length < 2 || field.options.length > 30 ||
      new Set(field.options).size !== field.options.length || field.options.some((option) => !option.trim() || option.length > 100))) {
      ctx.addIssue({ code: "custom", path: ["fields", index], message: "Dropdowns need 2–30 unique choices of up to 100 characters." });
    }
  }
  if (draft.escalation) {
    const field = draft.fields.find((candidate) => candidate.key === draft.escalation?.field);
    if (!field?.required || field.type !== "select" || !field.options.includes(draft.escalation.value)) {
      ctx.addIssue({ code: "custom", path: ["escalation"], message: "Choose a required dropdown and one of its choices for HR routing." });
    }
  }
});

export function prepareAiDraft(output: z.infer<typeof aiDraftSchema>) {
  const { process } = output;
  const questions: string[] = [];
  const sourceFields = process.fields.slice(0, 20);
  if (process.fields.length > sourceFields.length) {
    questions.push("The draft exceeds 20 intake fields. Review which fields this process should collect.");
  }
  const reservedKeys = new Set(sourceFields.map(({ key }) => key.trim()));
  const usedKeys = new Set<string>();
  const fields = sourceFields.map((field, index) => {
    let key = field.key.trim();
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || usedKeys.has(key)) {
      let suffix = index + 1;
      do { key = `field_${suffix++}`; } while (reservedKeys.has(key) || usedKeys.has(key));
    }
    usedKeys.add(key);

    const options = field.type === "select" ? [...new Set(field.options.map((option) => option.trim()).filter(Boolean))] : [];
    if (options.length > 30) {
      questions.push(`Review the choices for "${field.label.trim() || `Field ${index + 1}`}". A dropdown supports up to 30 choices.`);
    }
    return { ...field, key, label: field.label.trim(), options: options.slice(0, 30) };
  });

  let escalation = process.escalation;
  if (escalation) {
    const matches = sourceFields.flatMap((field, index) => field.key.trim() === escalation?.field.trim() ? [fields[index]] : []);
    const field = matches.length === 1 ? matches[0] : undefined;
    escalation = { ...escalation, field: field?.key ?? "", value: escalation.value.trim() };
  }

  const draft = { name: process.name.trim(), purpose: process.purpose.trim(), fields, escalation };
  const readiness = definitionSchema.safeParse(draft);
  if (!readiness.success) {
    questions.push(...readiness.error.issues.map((issue) => issue.message));
  }
  questions.push(...output.questions);
  return {
    process: draft,
    questions: [...new Set(questions.map((question) => question.trim().slice(0, 400)).filter(Boolean))].slice(0, 15),
  };
}

export type EditorInput = {
  id: string | null;
  revision: number;
  draft: Draft;
  ownerId: string;
  hrReviewerId: string;
  questions: string[];
};

export function needsHr(definition: Draft, answers: Record<string, string>) {
  const rule = definition.escalation;
  if (!rule) return false;
  const matches = answers[rule.field] === rule.value;
  return rule.operator === "equals" ? matches : !matches;
}

export function ruleLabel(definition: Draft) {
  const rule = definition.escalation;
  if (!rule) return "The manager makes the final decision.";
  const field = definition.fields.find((item) => item.key === rule.field);
  const operator = rule.operator === "equals" ? "is" : "is not";
  return `${field?.label || "Routing field"} ${operator} ${rule.value || "the selected choice"}`;
}

export function processTitle(name: string) {
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name)) return name;
  return name.charAt(0).toUpperCase() + name.slice(1).replaceAll("_", " ");
}
