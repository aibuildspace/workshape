"use client";

import { useActionState, useId, useState } from "react";
import { login, reviewRequest, sendRequest } from "../../app/actions";
import { clarificationReasons } from "@/lib/clarification";
import type { Draft } from "@/lib/process";
import { RequestFields } from "./request-fields";
import { RequestOutcome } from "./request-outcome";

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

export function RequestForm({ processId, version, definition, hrReviewerName, managerName, requestKey, requesterId, fromHome }: {
  processId: string; version: number; definition: Draft; hrReviewerName: string | null; managerName: string;
  requestKey: string; requesterId: string; fromHome: boolean;
}) {
  const [state, formAction, pending] = useActionState(sendRequest.bind(null, processId, version, requestKey, requesterId, fromHome), {});
  const [values, setValues] = useState<Record<string, string>>({});
  return <form className="stack" action={formAction}>
    <RequestFields fields={definition.fields} values={values}
      onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
    <RequestOutcome definition={definition} values={values} hrReviewerName={hrReviewerName} managerName={managerName} />
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <div><button className="button button-primary" disabled={pending}>{pending ? "Submitting…" : "Submit request"}</button></div>
  </form>;
}

export function ReviewForm({ id, eventId, respond, returnView, returnQuery, sendsToHr, hrReviewerName, fields, answers }: {
  id: string; eventId: number; respond: boolean; returnView: "home" | "assigned" | "mine" | "history"; returnQuery: string;
  sendsToHr: boolean; hrReviewerName: string | null;
  fields?: Draft["fields"]; answers?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(reviewRequest.bind(null, id, eventId, returnView, returnQuery), {});
  const [note, setNote] = useState("");
  const [corrected, setCorrected] = useState(answers ?? {});
  const noteVisibilityId = useId();
  const [decision, setDecision] = useState(respond ? "respond" : "");
  const [clarificationReason, setClarificationReason] = useState("");
  const actions: Record<string, string> = {
    respond: "Send information", approve: sendsToHr ? `Approve and send to ${hrReviewerName ?? "HR"}` : "Approve request",
    decline: "Decline request", request_information: "Request information",
  };
  const noteLabel = respond ? "Additional information" : decision === "decline" ? "Reason for declining" :
    decision === "request_information" ? "What information do you need?" : "Decision note";
  return <form className="stack case-action-form" action={formAction}>
    {respond && fields && <fieldset className="correction-fields">
      <legend>Review and correct submitted information</legend>
      <p className="field-hint">Update any answers that need correction. Previous and corrected answers stay in the case history, visible to the requester and reviewers.</p>
      <div className="stack"><RequestFields fields={fields} values={corrected}
        onValueChange={(key, value) => setCorrected((current) => ({ ...current, [key]: value }))} /></div>
    </fieldset>}
    {respond ? <input type="hidden" name="decision" value="respond" /> :
      <label>Decision<select name="decision" required value={decision} onChange={(event) => setDecision(event.target.value)}>
        <option value="">Select a decision</option><option value="approve">{sendsToHr ? `Approve and send to ${hrReviewerName ?? "HR"}` : "Approve"}</option>
        <option value="decline">Decline</option><option value="request_information">Request information</option>
      </select></label>}
    {decision === "approve" && sendsToHr && <p className="notice" role="status">
      This approval sends the request to {hrReviewerName ?? "the assigned HR reviewer"} for a final decision.
    </p>}
    {decision === "request_information" && <label>Why more information is needed
      <select name="clarificationReason" required value={clarificationReason}
        onChange={(event) => setClarificationReason(event.target.value)}>
        <option value="">Choose a reason</option>
        {clarificationReasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
      </select>
      <small className="muted">This category appears in the shared case history and aggregate process reporting.</small>
    </label>}
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
