"use client";

import { useActionState, useEffect, useState } from "react";
import { delegateReviewCase, revokeDelegatedReview } from "../../app/actions";

function oneWeekFromNow() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function CaseDelegationForm({ caseId, eventId, candidates }: {
  caseId: string; eventId: number; candidates: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(delegateReviewCase, {});
  const [delegateId, setDelegateId] = useState("");
  const [localExpiry, setLocalExpiry] = useState("");
  useEffect(() => { setLocalExpiry(oneWeekFromNow()); }, []);
  const expiry = localExpiry && Number.isFinite(Date.parse(localExpiry)) ? new Date(localExpiry).toISOString() : "";
  return <form className="stack" action={action}>
    <input type="hidden" name="caseId" value={caseId} />
    <input type="hidden" name="expectedEvent" value={eventId} />
    <input type="hidden" name="expiresAt" value={expiry} />
    <p className="field-hint">The colleague will see this case’s answers and shared notes and may decide this review step until the expiry time. You can revoke the handoff. They cannot delegate it again.</p>
    {candidates.length ? <>
      <label>Delegate to<select name="delegateId" value={delegateId} required disabled={pending}
        onChange={(event) => setDelegateId(event.target.value)}>
        <option value="">Choose a colleague</option>
        {candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <label>Access expires<input type="datetime-local" value={localExpiry} required disabled={pending}
        onChange={(event) => setLocalExpiry(event.target.value)} /></label>
      <p className="field-hint">Set for one week by default. Choose any time within the next 30 days.</p>
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
      <div><button className="button button-secondary" disabled={pending || !delegateId || !expiry}>
        {pending ? "Delegating…" : "Delegate review"}</button></div>
    </> : <p className="field-hint">There is no other eligible reviewer for this step. Ask an administrator to add one.</p>}
  </form>;
}

export function RevokeCaseDelegation({ delegationId, eventId }: { delegationId: number; eventId: number }) {
  const [state, action, pending] = useActionState(revokeDelegatedReview, {});
  return <form action={action}>
    <input type="hidden" name="delegationId" value={delegationId} />
    <input type="hidden" name="expectedEvent" value={eventId} />
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <button className="button button-secondary" disabled={pending}>{pending ? "Reclaiming…" : "Reclaim review"}</button>
  </form>;
}
