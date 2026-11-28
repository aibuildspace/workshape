"use client";

import { useActionState, useState } from "react";
import { changeOwnPassword } from "../../app/actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, {});
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  return <form className="stack" action={action}>
    <label>Current password<input name="currentPassword" type="password" autoComplete="current-password"
      value={current} onChange={(event) => setCurrent(event.target.value)} required /></label>
    <label>New password<input name="nextPassword" type="password" autoComplete="new-password"
      minLength={15} maxLength={256} value={next} onChange={(event) => setNext(event.target.value)} required /></label>
    <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password"
      minLength={15} maxLength={256} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
    <p className="field-hint">Use at least 15 characters. Changing your password signs you out of every browser and local MCP client.</p>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <div><button className="button button-primary" disabled={pending}>{pending ? "Changing password…" : "Change password"}</button></div>
  </form>;
}
