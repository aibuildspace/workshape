"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProcess } from "../../app/actions";
import { aiDraftSchema, fieldTypes, needsHr, type Draft, type EditorInput } from "@/lib/process";
import { ProcessPreview } from "./process-preview";
import { RequestFields } from "./request-fields";

type Account = { id: string; name: string };
type Field = Draft["fields"][number];

const typeLabels: Record<Field["type"], string> = {
  text: "Short text", textarea: "Long text", date: "Date", select: "Dropdown",
};

export function ProcessEditor({ initial, accounts, canPublish, publishedVersion }: {
  initial: EditorInput; accounts: Account[]; canPublish: boolean; publishedVersion: number | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [version, setVersion] = useState(publishedVersion);
  const [savedDraft, setSavedDraft] = useState(initial.id ? JSON.stringify(initial) : "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
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
  const busy = saving || generating;
  const unsaved = savedDraft !== JSON.stringify(input);

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

  function report(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
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
      setInput((current) => ({ ...current, draft: result.process, questions: result.questions }));
      setSamples({});
      setNotice(result.questions.length
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

  return <>
    <div className="page-heading">
      <div><h1>{input.id ? "Edit process" : "New process"}</h1>
        <p>{version ? `Published version ${version}` : "Draft"}{unsaved && " · Unsaved changes"}
          {!canPublish && ownerName && ` · Owned by ${ownerName}`}
          {input.id && version && <> · <Link className="text-link" href={`/processes?view=map&process=${input.id}`}>View on map</Link></>}
        </p></div>
      <div className="button-group">
        {input.id && version && <Link className="button button-text" href={`/processes/${input.id}/request`}>Published form</Link>}
        <button className="button button-secondary" type="button" onClick={() => save(false)} disabled={busy}>Save draft</button>
        {canPublish && <button className="button button-primary" type="button" onClick={() => save(true)} disabled={busy}>Publish</button>}
      </div>
    </div>
    {error && <p ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <div className="editor-grid">
      <div className="panel editor-record">
        <details className="editor-section editor-ai" open={!initial.id && !initial.draft.name}>
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
        </details>
        {input.questions.length > 0 && <section className="editor-section editor-questions">
            <strong>Open questions</strong><ul>{input.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
            <button type="button" className="button button-secondary" disabled={busy}
              onClick={() => setInput({ ...input, questions: [] })}>Mark questions resolved</button>
        </section>}
        <fieldset className="editor-fields" disabled={busy}>
          <section className="editor-section">
            <h2>Process details</h2>
            <div className="stack">
              <label>Process name<input value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Purpose<textarea value={draft.purpose} rows={2} maxLength={1000} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></label>
              {canPublish && <label>Process owner<select value={input.ownerId} onChange={(event) => setInput({ ...input, ownerId: event.target.value })}>
                  {accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
                </select></label>}
            </div>
          </section>
          <section className="editor-section">
            <div className="section-heading"><h2>Intake fields</h2><button type="button" className="button button-secondary"
              onClick={addField} disabled={draft.fields.length >= 20}>Add field</button></div>
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
          <section className="editor-section">
            <h2>Routing</h2>
            <p className="muted">Every request goes to the employee’s assigned manager first.</p>
            <div className="stack">
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(rule)} onChange={(event) => {
                  setDraft({ ...draft, escalation: event.target.checked ? { field: "", operator: "equals", value: "" } : null });
                }} />Send approved exceptions to HR
              </label>
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
      <aside className="panel editor-preview" aria-label="Process preview">
        <div className="workspace-views editor-preview-views" role="group" aria-label="Preview options">
          <button type="button" aria-pressed={previewView === "intake"} onClick={() => setPreviewView("intake")}>Intake preview</button>
          <button type="button" aria-pressed={previewView === "routing"} onClick={() => setPreviewView("routing")}>Routing preview</button>
        </div>
        <div className="editor-section">
          {previewView === "routing" ? <ProcessPreview draft={draft} hrName={hrName} /> :
            draft.fields.length ? <div className="stack">
              <RequestFields fields={draft.fields} values={samples}
                onValueChange={(key, value) => setSamples((current) => ({ ...current, [key]: value }))} />
              {rule && routedField && rule.value && Object.hasOwn(samples, rule.field) && samples[rule.field] && <p className="notice" role="status">
                {needsHr(draft, samples) ? "If the manager approves, this request goes to HR." : "The manager makes the final decision on this request."}
              </p>}
            </div> : <p className="muted">Add fields to preview the form.</p>}
        </div>
      </aside>
    </div>
  </>;
}
