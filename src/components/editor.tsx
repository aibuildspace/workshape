"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { answerProcessQuestion, assignDraftQuestion, revokeDraftQuestionAssignment, saveProcess } from "../../app/actions";
import { aiDraftSchema, definitionSchema, fieldTypes, needsHr, processFileSchema, ruleLabel, type Draft, type EditorInput } from "@/lib/process";
import { draftFromTemplate, processTemplates } from "@/lib/process-templates";
import { ProcessPreview } from "./process-preview";
import { RequestFields } from "./request-fields";

type Account = { id: string; name: string };
type Field = Draft["fields"][number];

const typeLabels: Record<Field["type"], string> = {
  text: "Short text", textarea: "Long text", date: "Date", select: "Dropdown",
};

type QuestionResolution = { id: number; question: string; answer: string; targetKind: "process" | "routing" | "field";
  targetKey: string | null; targetLabel: string; resolvedBy: string; resolvedAt: string; when: string };
type QuestionAssignment = { id: number; questionIndex: number; question: string; assigneeName: string;
  assignedBy: string; assignedAt: string; expiresAt: string; revokedBy: string | null;
  revokedAt: string | null; completedAt: string | null; expired: boolean };

function formatEditorTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short",
    timeZone: "Australia/Sydney" }).format(new Date(value));
}

export function ProcessEditor({ initial, accounts, canPublish, aiAvailable, publishedVersion, publishedDefinition, ownershipEvents, questionHistory, questionAssignments, initialStartMode = "template" }: {
  initial: EditorInput; accounts: Account[]; canPublish: boolean; aiAvailable: boolean; publishedVersion: number | null; publishedDefinition?: Draft;
  ownershipEvents: { id: number; fromName: string | null; toName: string; changedBy: string; when: string }[];
  questionHistory: QuestionResolution[];
  questionAssignments: QuestionAssignment[];
  initialStartMode?: "template" | "import";
}) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [version, setVersion] = useState(publishedVersion);
  const [savedDraft, setSavedDraft] = useState(JSON.stringify(initial));
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<"template" | "ai" | "import" | "blank">(initialStartMode);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [questionTargets, setQuestionTargets] = useState<Record<number, string>>({});
  const [resolutions, setResolutions] = useState(questionHistory);
  const [assignments, setAssignments] = useState(questionAssignments);
  const [assignmentPeople, setAssignmentPeople] = useState<Record<number, string>>({});
  const [assignmentExpiry, setAssignmentExpiry] = useState<Record<number, string>>({});
  const [saving, startSaving] = useTransition();
  const [previewView, setPreviewView] = useState<"intake" | "routing">("intake");
  const [samples, setSamples] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const draft = input.draft;
  const rule = draft.escalation;
  const routeFields = draft.fields.filter((field) => field.required && field.type === "select");
  const routedField = routeFields.find((field) => field.key === rule?.field);
  const hrName = accounts.find((account) => account.id === input.hrReviewerId)?.name ?? "";
  const ownerName = accounts.find((account) => account.id === input.ownerId)?.name;
  const busy = saving || generating || resolvingIndex !== null;
  const unsaved = savedDraft !== JSON.stringify(input);
  const readiness = definitionSchema.safeParse(draft);
  const publishIssues = [
    ...(!readiness.success ? readiness.error.issues.map((issue) => issue.message) : []),
    ...(input.questions.length ? ["Resolve the open questions."] : []),
    ...(rule && !input.hrReviewerId ? ["Assign an HR reviewer for exceptions."] : []),
  ];
  const definitionIssues = readiness.success ? [] : readiness.error.issues;
  const setupSteps = [
    { id: "process-details", label: "Details", complete: !definitionIssues.some((issue) => issue.path[0] === "name" || issue.path[0] === "purpose"),
      hint: "Name the process and explain when employees should use it." },
    { id: "intake-fields", label: "Intake fields", complete: !definitionIssues.some((issue) => issue.path[0] === "fields"),
      hint: "Add the information employees need to provide." },
    { id: "decision-path", label: "Decision path", complete: !definitionIssues.some((issue) => issue.path[0] === "escalation") && (!rule || Boolean(input.hrReviewerId)),
      hint: "Check the manager route and assign an HR reviewer for exceptions." },
    { id: "draft-questions", label: "Open questions", complete: input.questions.length === 0,
      hint: "Record an answer for every open drafting question." },
  ];
  const nextStep = setupSteps.find((step) => !step.complete);
  const publishReady = publishIssues.length === 0;
  const priorFields = new Map(publishedDefinition?.fields.map((field) => [field.key, field]));
  const currentFields = new Map(draft.fields.map((field) => [field.key, field]));
  const changes = publishedDefinition ? [
    ...draft.fields.filter((field) => !priorFields.has(field.key)).map((field) => `Added field: ${field.label || field.key}`),
    ...publishedDefinition.fields.filter((field) => !currentFields.has(field.key)).map((field) => `Removed field: ${field.label}`),
    ...draft.fields.filter((field) => priorFields.has(field.key) &&
      JSON.stringify(field) !== JSON.stringify(priorFields.get(field.key))).map((field) => `Changed field: ${field.label || field.key}`),
    ...(draft.name !== publishedDefinition.name ? ["Changed process name"] : []),
    ...(draft.purpose !== publishedDefinition.purpose ? ["Changed purpose"] : []),
    ...(JSON.stringify(rule) !== JSON.stringify(publishedDefinition.escalation) ? ["Changed routing: " + ruleLabel(draft)] : []),
  ] : [];

  function tryRoute(exception: boolean) {
    if (!rule || !routedField) return;
    const choice = exception
      ? routedField.options.find((option) => (rule.operator === "equals" ? option === rule.value : option !== rule.value))
      : routedField.options.find((option) => (rule.operator === "equals" ? option !== rule.value : option === rule.value));
    if (!choice) return;
    setSamples((current) => ({ ...current, [rule.field]: choice }));
    setPreviewView("intake");
  }

  function setDraft(next: Draft) {
    setInput((current) => ({ ...current, draft: next }));
    setNotice("");
  }

  function changeField(key: string, change: Partial<Field>) {
    setDraft({ ...draft, fields: draft.fields.map((field) => field.key === key ? { ...field, ...change } : field) });
    if (change.type || change.options) setSamples((current) => ({ ...current, [key]: "" }));
  }

  function removeField(key: string) {
    setDraft({ ...draft, fields: draft.fields.filter((field) => field.key !== key), escalation: rule?.field === key ? null : rule });
    setSamples((current) => ({ ...current, [key]: "" }));
  }

  function addField() {
    const key = "field_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    setDraft({ ...draft, fields: [...draft.fields, { key, label: "", type: "text", required: false, options: [] }] });
  }

  function enableHrRoute() {
    if (draft.fields.length < 20) {
      let key = "request_category";
      let suffix = 2;
      while (draft.fields.some((field) => field.key === key)) key = `request_category_${suffix++}`;
      setDraft({ ...draft, fields: [...draft.fields,
        { key, label: "Request category", type: "select", required: true, options: ["Standard request", "Exception"] }],
        escalation: { field: key, operator: "equals", value: "Exception" } });
      setNotice("Added a required Request category field. Review its choices and select an HR reviewer.");
    } else {
      report("Remove a field before adding HR review. The form already has 20 fields.");
      return;
    }
    setPreviewView("routing");
  }

  function useTemplate(id: string) {
    const next = draftFromTemplate(id);
    if (!next) return;
    if ((draft.name || draft.purpose || draft.fields.length || input.questions.length) &&
      !window.confirm("Replace this unsaved form and routing with the selected template?")) return;
    setInput((current) => ({ ...current, draft: next, questions: [] }));
    setSelectedTemplate(id);
    setSamples({});
    setError("");
    setNotice("Template loaded as an editable draft. Review the fields, routing, and HR reviewer before publishing.");
    setPreviewView("routing");
  }

  function chooseStartMode(mode: "template" | "ai" | "import" | "blank") {
    if (mode === "blank" && (draft.name || draft.purpose || draft.fields.length || input.questions.length)) {
      if (!window.confirm("Clear the unsaved form, routing, and questions to start blank?")) return;
      setInput((current) => ({ ...current, draft: { name: "", purpose: "", fields: [], escalation: null }, questions: [] }));
      setSelectedTemplate(null);
      setSamples({});
      setNotice("Blank draft ready. Add details and intake fields below.");
    }
    setStartMode(mode);
  }

  function report(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function exportDefinition() {
    const valid = definitionSchema.safeParse(draft);
    if (!valid.success) {
      report("Complete the publish checks before exporting this definition.");
      return;
    }
    const content = JSON.stringify({ format: "workshape-process", version: 1, definition: valid.data }, null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "process")}.workshape.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importDefinition(file: File | undefined) {
    if (!file) return;
    if (file.size > 256_000) {
      report("Choose a Workshape JSON definition smaller than 256 KB.");
      return;
    }
    try {
      const parsed = processFileSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        report("This file is not a valid Workshape process definition. Check the file and try again.");
        return;
      }
      if ((draft.name || draft.purpose || draft.fields.length) &&
        !window.confirm("Replace the form and routing in this editor with the imported definition?")) return;
      setInput((current) => ({ ...current, draft: parsed.data.definition }));
      setSelectedTemplate(null);
      setSamples({});
      setError("");
      setNotice("Definition imported as an editable draft. Review ownership and the HR reviewer, then save or publish.");
    } catch {
      report("Could not read this JSON file. Choose a Workshape process definition and try again.");
    }
  }

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((draft.name || draft.purpose || draft.fields.length) && !window.confirm("Replace the form and routing in this editor with a new AI draft?")) return;
    setError("");
    setNotice("");
    setGenerating(true);
    try {
      const response = await fetch("/api/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, processId: input.id }),
      });
      const body = await response.json();
      if (!response.ok) {
        report(typeof body.error === "string" ? body.error : "OpenAI could not generate a draft.");
        return;
      }
      const result = aiDraftSchema.parse(body);
      const questions = [...new Set([...input.questions, ...result.questions])];
      if (questions.length > 15) {
        report("Resolve existing questions before generating another draft.");
        return;
      }
      setInput((current) => ({ ...current, draft: result.process, questions }));
      setSelectedTemplate(null);
      setSamples({});
      setNotice(questions.length
        ? "Draft generated. Review the open questions below before publishing."
        : "Draft generated. Review its fields and routing before publishing.");
    } catch {
      report("Could not generate a draft. Try again or continue manually.");
    } finally {
      setGenerating(false);
    }
  }

  function save(publish: boolean) {
    setError("");
    setNotice("");
    startSaving(async () => {
      try {
        const result = await saveProcess(input, publish);
        if (!result.saved) {
          report(result.error ?? "Could not save the process.");
          return;
        }
        const next = { ...input, id: result.saved.id, revision: result.saved.revision };
        setInput(next);
        setSavedDraft(JSON.stringify(next));
        setVersion(result.saved.version);
        setNotice(publish ? `Version ${result.saved.version} is published.` : "Draft saved.");
        if (!input.id) window.history.replaceState(null, "", `/processes/${next.id}/edit`);
        else router.refresh();
      } catch {
        report("The process could not be saved. Try again.");
      }
    });
  }

  async function resolveQuestion(index: number) {
    if (!input.id || unsaved) {
      report("Save the draft before answering a question.");
      return;
    }
    setError("");
    setNotice("");
    setResolvingIndex(index);
    try {
      const data = new FormData();
      data.set("processId", input.id);
      data.set("expectedRevision", String(input.revision));
      data.set("questionIndex", String(index));
      data.set("answer", questionAnswers[index] ?? "");
      data.set("target", questionTargets[index] ?? "process");
      const result = await answerProcessQuestion(data);
      if (!result.resolved) {
        report(result.error ?? "Could not record the answer.");
        return;
      }
      const next = { ...input, revision: result.resolved.revision,
        questions: input.questions.filter((_, questionIndex) => questionIndex !== index) };
      setInput(next);
      setSavedDraft(JSON.stringify(next));
      setResolutions((current) => [{ ...result.resolved!, when: formatEditorTimestamp(result.resolved!.resolvedAt) }, ...current]);
      setAssignments((current) => current.map((item) => item.revokedAt || item.completedAt ? item :
        item.questionIndex === index ? { ...item, completedAt: result.resolved!.resolvedAt } :
        item.questionIndex > index ? { ...item, questionIndex: item.questionIndex - 1 } : item));
      setQuestionAnswers((current) => Object.fromEntries(Object.entries(current)
        .filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])));
      setQuestionTargets((current) => Object.fromEntries(Object.entries(current)
        .filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])));
      setNotice("Answer recorded. Review the draft before publishing.");
      router.refresh();
    } catch {
      report("Could not record the answer. Try again.");
    } finally {
      setResolvingIndex(null);
    }
  }

  async function assignQuestion(index: number) {
    if (!input.id || unsaved) { report("Save the draft before assigning a question."); return; }
    const localExpiry = assignmentExpiry[index];
    if (!localExpiry || Number.isNaN(Date.parse(localExpiry))) {
      report("Choose when this assignment expires.");
      return;
    }
    const expiresAt = new Date(localExpiry).toISOString();
    const data = new FormData();
    data.set("processId", input.id);
    data.set("expectedRevision", String(input.revision));
    data.set("questionIndex", String(index));
    data.set("assigneeId", assignmentPeople[index] ?? "");
    data.set("expiresAt", expiresAt);
    setError(""); setNotice(""); setResolvingIndex(index);
    try {
      const result = await assignDraftQuestion(data);
      if (!result.assignment) { report(result.error ?? "Could not assign the question."); return; }
      setAssignments((current) => [{ ...result.assignment!, expired: false }, ...current.map((item) =>
        item.questionIndex === index && !item.revokedAt && !item.completedAt
          ? { ...item, revokedBy: result.assignment!.assignedBy, revokedAt: result.assignment!.assignedAt } : item)]);
      setNotice(`Question assigned to ${result.assignment.assigneeName}.`);
      router.refresh();
    } catch { report("Could not assign the question. Try again."); }
    finally { setResolvingIndex(null); }
  }

  async function revokeAssignment(assignmentId: number) {
    const data = new FormData();
    data.set("assignmentId", String(assignmentId));
    setError(""); setNotice(""); setResolvingIndex(-1);
    try {
      const result = await revokeDraftQuestionAssignment(data);
      if (!result.revoked) { report(result.error ?? "Could not revoke the assignment."); return; }
      setAssignments((current) => current.map((item) => item.id === assignmentId
        ? { ...item, revokedBy: result.revoked!.revokedBy, revokedAt: result.revoked!.revokedAt } : item));
      setNotice("Question assignment revoked.");
      router.refresh();
    } catch { report("Could not revoke the assignment. Try again."); }
    finally { setResolvingIndex(null); }
  }

  return <>
    <div className="page-heading">
      <div><h1>{input.id ? "Edit process" : "New process"}</h1>
        <p>{version ? `Published version ${version}` : "Draft"}{unsaved && " · Unsaved changes"}
          {!canPublish && ownerName && ` · Owned by ${ownerName}`}
          {input.id && version && <> · <Link className="text-link" href={`/processes?view=map&process=${input.id}`}>View on map</Link></>}
        </p></div>
      <div className="button-group">
        {input.id && version && <Link className="button button-text" href={`/processes/${input.id}/request`}>Published form</Link>}
        <button className="button button-text" type="button" onClick={exportDefinition} disabled={busy || !readiness.success}>Export JSON</button>
        <button className="button button-secondary" type="button" onClick={() => save(false)} disabled={busy}>Save draft</button>
        {canPublish && <button className="button button-primary" type="button" onClick={() => save(true)}
          disabled={busy || !publishReady} aria-describedby="publish-readiness">Publish</button>}
      </div>
    </div>
    {error && <p ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <section className="panel editor-guide" aria-label="Process setup guide">
      <div><strong>Build and check</strong><p id="publish-readiness" role="status">
        {publishReady ? canPublish ? `Definition passes the checks. Preview the form and ${rule ? "both decision routes" : "decision path"}, then publish.`
          : "Definition passes the checks. The HR function owner can publish after reviewing the preview."
          : !input.id && !draft.name && !draft.fields.length ? "Choose how to start below, then complete the process details."
            : `Next: ${nextStep?.label}. ${nextStep?.hint} ${publishIssues.length} ${publishIssues.length === 1 ? "check" : "checks"} remaining.`}
      </p></div>
      <nav aria-label="Process setup steps">{setupSteps.map((step, index) =>
        step.id === "draft-questions" && step.complete ? <span key={step.id} className="editor-guide-step complete">
          {index + 1}. {step.label} <small>Done</small></span> :
          <a key={step.id} className={`editor-guide-step${step.complete ? " complete" : " needs-work"}`} href={`#${step.id}`}>
            {index + 1}. {step.label} <small>{step.complete ? "Done" : "To do"}</small></a>)}</nav>
    </section>
    <div className="editor-grid">
      <div className="panel editor-record">
        {!input.id && <section className="editor-section template-picker" aria-labelledby="start-method-title">
          <h2 id="start-method-title">Choose how to start</h2>
          <p className="muted">Each option creates an editable draft. Saving and publishing are separate steps.</p>
          <div className="start-methods" role="group" aria-label="Starting method">
            {([ ["template", "Template"], ["ai", "Draft with AI"], ["import", "Import JSON"], ["blank", "Start blank"] ] as const)
              .filter(([mode]) => aiAvailable || mode !== "ai")
              .map(([mode, label]) => <button key={mode} type="button" className="button button-secondary"
                aria-pressed={startMode === mode} disabled={busy} onClick={() => chooseStartMode(mode)}>{label}</button>)}
          </div>
          {startMode === "template" && <div className="template-grid">{processTemplates.map((template) => <article className={`template-card${selectedTemplate === template.id ? " template-card-selected" : ""}`} key={template.id}>
            <h3>{template.title}</h3><p>{template.description}</p>
            <small>{template.draft.fields.length} fields · {template.route}</small>
            <button type="button" className="button button-secondary" disabled={busy}
              onClick={() => useTemplate(template.id)}>{selectedTemplate === template.id ? "Template selected" : `Use ${template.title}`}</button>
          </article>)}</div>}
          {startMode === "blank" && <p className="start-method-help">Start with the process name and purpose, then add the fields employees will complete.</p>}
        </section>}
        {(input.id || startMode === "import") && <details id="import-process" className="editor-section editor-ai" open={!input.id}>
          <summary>Import process definition</summary>
          <p className="muted">Import a Workshape JSON file into this editor. Review the draft before saving or publishing.</p>
          <label>Workshape JSON file
            <input type="file" accept=".json,application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void importDefinition(file);
            }} disabled={busy} />
          </label>
        </details>}
        {aiAvailable && (input.id || startMode === "ai") && <details className="editor-section editor-ai" open={!input.id}>
          <summary>Draft with AI</summary>
          <form className="stack" onSubmit={generate}>
            <label>Describe the process
              <textarea rows={3} minLength={12} maxLength={6000} required value={description}
                onChange={(event) => setDescription(event.target.value)} disabled={busy}
                aria-describedby="description-hint" />
            </label>
            <p id="description-hint" className="field-hint">Include the fields, reviewer, and any exceptions.</p>
            <div><button className="button button-secondary" disabled={busy}>{generating ? "Generating draft…" : "Generate draft"}</button></div>
          </form>
        </details>}
        {(input.questions.length > 0 || resolutions.length > 0) && <section id="draft-questions" className="editor-section editor-questions">
          <h2>Draft questions</h2>
          {input.questions.length > 0 ? <>
            <p className="field-hint">Record an answer for each question. Update the relevant draft section, then publish.</p>
            {(!input.id || unsaved) && <p className="field-hint">Save the draft to answer these questions.</p>}
            <ol className="question-list">{input.questions.map((question, index) => {
              const assignment = assignments.find((item) => item.questionIndex === index && !item.revokedAt && !item.completedAt);
              return <li key={`${question}-${index}`}>
              <p><strong>{question}</strong></p>
              {assignment && <p className="question-assignment">Assigned to {assignment.assigneeName} until {formatEditorTimestamp(assignment.expiresAt)}
                  {assignment.expired && " · Expired"}
                  <button type="button" className="button button-text" disabled={busy} onClick={() => void revokeAssignment(assignment.id)}>Revoke</button></p>}
              <label>Answer<textarea rows={2} maxLength={4000} value={questionAnswers[index] ?? ""}
                onChange={(event) => setQuestionAnswers((current) => ({ ...current, [index]: event.target.value }))}
                disabled={busy} /></label>
              <label>Applies to<select value={questionTargets[index] ?? "process"} disabled={busy}
                onChange={(event) => setQuestionTargets((current) => ({ ...current, [index]: event.target.value }))}>
                <option value="process">Process details</option><option value="routing">Routing</option>
                {draft.fields.map((field) => <option key={field.key} value={`field:${field.key}`}>Field: {field.label || field.key}</option>)}
              </select></label>
              <button type="button" className="button button-secondary" disabled={busy || !input.id || unsaved || !(questionAnswers[index] ?? "").trim()}
                onClick={() => void resolveQuestion(index)}>{resolvingIndex === index ? "Recording…" : "Record answer"}</button>
              <div className="question-delegation"><p className="field-hint">Delegate this answer only. The assignee cannot edit or publish the process.</p>
                <label>Assign to<select value={assignmentPeople[index] ?? ""} disabled={busy}
                  onChange={(event) => setAssignmentPeople((current) => ({ ...current, [index]: event.target.value }))}>
                  <option value="">Choose an HR colleague</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select></label>
                <label>Access expires<input type="datetime-local" value={assignmentExpiry[index] ?? ""} disabled={busy}
                  onChange={(event) => setAssignmentExpiry((current) => ({ ...current, [index]: event.target.value }))} /></label>
                <button type="button" className="button button-secondary" disabled={busy || !input.id || unsaved || !assignmentPeople[index] || !assignmentExpiry[index]}
                  onClick={() => void assignQuestion(index)}>{assignment ? "Reassign question" : "Assign question"}</button>
              </div>
            </li>})}</ol>
          </> : <p className="field-hint">All questions have recorded answers.</p>}
          {resolutions.length > 0 && <details className="question-history"><summary>Answered questions ({resolutions.length})</summary>
            <ol>{resolutions.map((item) => <li key={item.id}><strong>{item.question}</strong>
              <p>{item.answer}</p><span>{item.targetLabel} · {item.resolvedBy} · {item.when}</span></li>)}</ol>
          </details>}
          {assignments.length > 0 && <details className="question-history"><summary>Assignment history ({assignments.length})</summary>
            <ol>{assignments.map((item) => <li key={item.id}><strong>{item.question}</strong>
              <p>{item.assigneeName} · Assigned by {item.assignedBy} · Expires {formatEditorTimestamp(item.expiresAt)}</p>
              <span>{item.completedAt ? "Answered" : item.revokedAt ? `Revoked by ${item.revokedBy}` :
                item.expired ? "Expired" : "Open"}</span></li>)}</ol>
          </details>}
        </section>}
        <fieldset className="editor-fields" disabled={busy}>
          <section id="process-details" className="editor-section">
            <h2>Process details</h2>
            <div className="stack">
              <label>Process name<input value={draft.name} maxLength={100} placeholder="e.g. Flexible work request"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Purpose<textarea value={draft.purpose} rows={2} maxLength={1000}
                placeholder="When should employees use this process, and what decision will it record?"
                onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></label>
              {canPublish && <><label>Process owner<select value={input.ownerId} onChange={(event) => setInput({ ...input, ownerId: event.target.value })}>
                  {accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
                </select></label><p className="field-hint">Saving a new owner transfers draft and link management. Only the HR function owner can publish.</p></>}
              {ownershipEvents.length > 0 && <details className="ownership-history">
                <summary>Ownership history</summary>
                <ol>{ownershipEvents.map((event) => <li key={event.id}>
                  <strong>{event.fromName ? `${event.fromName} → ${event.toName}` : `Assigned to ${event.toName}`}</strong>
                  <span>{event.changedBy} · {event.when}</span>
                </li>)}</ol>
              </details>}
            </div>
          </section>
          <section id="intake-fields" className="editor-section">
            <div className="section-heading"><h2>Intake fields</h2><button type="button" className="button button-secondary"
              onClick={addField} disabled={draft.fields.length >= 20}>Add field</button></div>
            <p className="field-hint">These questions appear on the employee’s request form. Mark only information needed to decide as required.</p>
            {!draft.fields.length && <p className="muted">No intake fields yet.</p>}
            <div className="editor-field-list">
              {draft.fields.map((field, index) => <fieldset className="field-card" key={field.key}>
                <legend className="sr-only">Field {index + 1}</legend>
                <div className="editor-field-row">
                  <label>Label<input value={field.label} maxLength={120} onChange={(event) => changeField(field.key, { label: event.target.value })} /></label>
                  <label>Type<select value={field.type} onChange={(event) => changeField(field.key, { type: event.target.value as Field["type"] })}>
                    {fieldTypes.map((type) => <option value={type} key={type}>{typeLabels[type]}</option>)}
                  </select></label>
                  <label className="checkbox"><input type="checkbox" checked={field.required} onChange={(event) => changeField(field.key, { required: event.target.checked })} />Required</label>
                  <button type="button" className="button button-text" aria-label={`Remove field ${index + 1}`} onClick={() => removeField(field.key)}>Remove</button>
                </div>
                {field.type === "select" && <label>Choices, one per line
                  <textarea rows={3} value={field.options.join("\n")} onChange={(event) => changeField(field.key, { options: event.target.value.split("\n") })} />
                </label>}
              </fieldset>)}
            </div>
          </section>
          <section id="decision-path" className="editor-section">
            <h2>Decision path</h2>
            <p className="muted">Every request starts with the employee’s manager. Choose where an approved request goes next.</p>
            <div className="workflow-visual" aria-label="Current workflow">
              <div className="workflow-step"><span>1 · Intake</span><strong>Employee submits</strong><small>{draft.fields.length} {draft.fields.length === 1 ? "field" : "fields"}</small></div>
              <div className="workflow-arrow" aria-hidden="true">→</div>
              <div className="workflow-step"><span>2 · Review</span><strong>Manager reviews</strong><small>Assigned manager</small></div>
              <div className="workflow-arrow" aria-hidden="true">→</div>
              <div className="workflow-branches"><p><strong>Routine or declined</strong> → Decision recorded</p>
                {rule && <p><strong>Approved exception</strong> → HR review ({hrName || "choose reviewer"}) → Decision recorded</p>}</div>
            </div>
            <div className="stack">
              <fieldset className="workflow-mode"><legend>After manager approval</legend><div className="workflow-options">
                <label className={`workflow-option${!rule ? " workflow-option-selected" : ""}`}><input type="radio" name="workflow-mode"
                  checked={!rule} onChange={() => { setDraft({ ...draft, escalation: null }); setPreviewView("routing"); }} />
                  <span><strong>Manager decides</strong><small>The manager’s approval is final.</small></span></label>
                <label className={`workflow-option${rule ? " workflow-option-selected" : ""}`}><input type="radio" name="workflow-mode"
                  checked={Boolean(rule)} onChange={enableHrRoute} />
                  <span><strong>HR reviews exceptions</strong><small>Approved requests matching a field choice go to HR.</small></span></label>
              </div></fieldset>
              {rule && <>
                <label>Routing field<select value={routedField?.key ?? ""} onChange={(event) => {
                  setDraft({ ...draft, escalation: { ...rule, field: event.target.value, value: "" } });
                }}><option value="">Choose a required dropdown</option>
                  {routeFields.map((field) => <option value={field.key} key={field.key}>{field.label || "Unlabeled field"}</option>)}</select></label>
                <div className="field-grid">
                  <label>Condition<select value={rule.operator}
                    onChange={(event) => setDraft({ ...draft, escalation: { ...rule, operator: event.target.value === "equals" ? "equals" : "does_not_equal" } })}>
                    <option value="equals">Is</option><option value="does_not_equal">Is not</option>
                  </select></label>
                  <label>Choice<select value={rule.value} onChange={(event) => setDraft({ ...draft, escalation: { ...rule, value: event.target.value } })}>
                    <option value="">Select a choice</option>
                    {[...new Set(routedField?.options.map((option) => option.trim()).filter(Boolean))].map((option) => <option key={option}>{option}</option>)}
                  </select></label>
                </div>
                <label>HR reviewer<select value={input.hrReviewerId} onChange={(event) => setInput({ ...input, hrReviewerId: event.target.value })}>
                  <option value="">Assign a reviewer</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
              </>}
            </div>
          </section>
        </fieldset>
      </div>
      <aside id="process-preview" className="panel editor-preview" aria-label="Process preview">
        <div className="workspace-views editor-preview-views" role="group" aria-label="Preview options">
          <button type="button" aria-pressed={previewView === "intake"} onClick={() => setPreviewView("intake")}>Intake preview</button>
          <button type="button" aria-pressed={previewView === "routing"} onClick={() => setPreviewView("routing")}>Routing preview</button>
        </div>
        <div className="editor-section">
          {rule && routedField && rule.value && <div className="button-group sample-actions">
            <button type="button" className="button button-secondary" onClick={() => tryRoute(false)}>Try routine route</button>
            <button type="button" className="button button-secondary" onClick={() => tryRoute(true)}>Try HR route</button>
          </div>}
          {previewView === "routing" ? <ProcessPreview draft={draft} hrName={hrName} /> :
            draft.fields.length ? <div className="stack">
              <RequestFields fields={draft.fields} values={samples}
                onValueChange={(key, value) => setSamples((current) => ({ ...current, [key]: value }))} />
              {rule && routedField && rule.value && Object.hasOwn(samples, rule.field) && samples[rule.field] && <p className="notice" role="status">
                {needsHr(draft, samples) ? "If the manager approves, this request goes to HR." : "The manager makes the final decision on this request."}
              </p>}
            </div> : <p className="muted">Add fields to preview the form.</p>}
        </div>
        <section className="editor-section publish-checks" aria-label="Publish checks">
          <h2>Publish checks</h2>
          {publishIssues.length ? <ul>{publishIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> :
            <p className="notice success">Definition is ready to publish. Review the form and decision path before publishing.</p>}
          {publishedDefinition && <>
            <h3>Form and routing changes from version {publishedVersion}</h3>
            {changes.length ? <ul>{changes.map((change, index) => <li key={index}>{change}</li>)}</ul> :
              <p className="muted">No form or routing changes.</p>}
          </>}
        </section>
      </aside>
    </div>
  </>;
}
