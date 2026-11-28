"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { answerProcessQuestion } from "../../app/actions";

export function AssignedQuestionForm({ question }: { question: {
  id: number; processId: string; questionIndex: number; revision: number;
  fields: { key: string; label: string }[];
} }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [target, setTarget] = useState("process");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("processId", question.processId);
    data.set("expectedRevision", String(question.revision));
    data.set("questionIndex", String(question.questionIndex));
    data.set("answer", answer);
    data.set("target", target);
    try {
      const result = await answerProcessQuestion(data);
      if (!result.resolved) {
        setError(result.error ?? "Could not record the answer.");
        return;
      }
      router.push("/work");
      router.refresh();
    } catch {
      setError("Could not record the answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack" onSubmit={(event) => void submit(event)}>
    {error && <p className="notice error" role="alert">{error}</p>}
    <label>Answer<textarea rows={5} maxLength={4000} required value={answer}
      onChange={(event) => setAnswer(event.target.value)} disabled={busy} /></label>
    <label>Applies to<select value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy}>
      <option value="process">Process details</option><option value="routing">Routing</option>
      {question.fields.map((field) => <option key={field.key} value={`field:${field.key}`}>Field: {field.label || field.key}</option>)}
    </select></label>
    <div><button className="button button-primary" disabled={busy || !answer.trim()}>{busy ? "Recording…" : "Record answer"}</button></div>
  </form>;
}
