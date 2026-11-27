"use client";

import { useActionState, useId, useState } from "react";
import { login, reviewRequest, sendRequest } from "../../app/actions";
import type { Draft } from "@/lib/process";
import { RequestFields } from "./request-fields";

export function SignIn() {
  const [state, formAction, pending] = useActionState(login, {});
  const [email, setEmail] = useState("");
  return <form className="stack" action={formAction}>
    <label>Email<input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}

export function RequestForm({ processId, version, fields, requestKey, requesterId }: { processId: string; version: number; fields: Draft["fields"]; requestKey: string; requesterId: string }) {
  const [state, formAction, pending] = useActionState(sendRequest.bind(null, processId, version, requestKey, requesterId), {});
  const [values, setValues] = useState<Record<string, string>>({});
  return <form className="stack" action={formAction}>
    <RequestFields fields={fields} values={values}
      onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <div><button className="button button-primary" disabled={pending}>{pending ? "Submitting…" : "Submit request"}</button></div>
  </form>;
}

export function ReviewForm({ id, eventId, respond, returnView, sendsToHr }: {
  id: string; eventId: number; respond: boolean; returnView: "assigned" | "mine" | "history"; sendsToHr: boolean;
}) {
  const [state, formAction, pending] = useActionState(reviewRequest.bind(null, id, eventId, returnView), {});
  const [note, setNote] = useState("");
  const noteVisibilityId = useId();
  const [decision, setDecision] = useState(respond ? "respond" : "");
  const actions: Record<string, string> = {
    respond: "Send information", approve: sendsToHr ? "Approve and send to HR" : "Approve request",
    decline: "Decline request", request_information: "Request information",
  };
  const noteLabel = respond ? "Additional information" : decision === "decline" ? "Reason for declining" :
    decision === "request_information" ? "What information do you need?" : "Decision note";
  return <form className="stack case-action-form" action={formAction}>
    {respond ? <input type="hidden" name="decision" value="respond" /> :
      <label>Decision<select name="decision" required value={decision} onChange={(event) => setDecision(event.target.value)}>
        <option value="">Select a decision</option><option value="approve">{sendsToHr ? "Approve and send to HR" : "Approve"}</option>
        <option value="decline">Decline</option><option value="request_information">Request information</option>
      </select></label>}
    {decision && <label>
      <span>{noteLabel}{decision === "approve" && <small className="optional">Optional</small>}</span>
      <textarea rows={3} name="note" value={note} onChange={(event) => setNote(event.target.value)}
        maxLength={4000} required={decision !== "approve"} aria-describedby={noteVisibilityId} />
      <small className="muted" id={noteVisibilityId}>Visible to the requester and reviewers on this case.</small>
    </label>}
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <div><button className={`button ${decision === "decline" ? "button-danger" : "button-primary"}`}
      disabled={pending || !decision}>{pending ? "Saving…" : actions[decision] ?? "Record decision"}</button></div>
  </form>;
}
