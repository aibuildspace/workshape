"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addAccount } from "../../app/actions";

export function AccountForm({ managers }: { managers: { id: string; name: string; email: string }[] }) {
  const [state, action, pending] = useActionState(addAccount, {});
  const [role, setRole] = useState("employee");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.createdId) { formRef.current?.reset(); setRole("employee"); router.refresh(); }
  }, [state.createdId, router]);
  return <form ref={formRef} className="stack account-form" action={action}>
    <label>Name<input name="name" maxLength={100} required /></label>
    <label>Email<input name="email" type="email" autoComplete="off" maxLength={254} required /></label>
    <label>Role<select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
      <option value="employee">Employee</option><option value="manager">Manager</option>
      <option value="hr">HR reviewer</option><option value="function_owner">HR function owner</option>
    </select></label>
    {role === "employee" && <label>Assigned manager<select name="managerEmail" required defaultValue="">
      <option value="">Choose a manager</option>
      {managers.map((manager) => <option value={manager.email} key={manager.id}>{manager.name} · {manager.email}</option>)}
    </select></label>}
    {role === "employee" && managers.length === 0 && <p className="notice">Create a manager account before adding an employee.</p>}
    <label>Temporary password<input name="password" type="password" autoComplete="new-password" minLength={15} maxLength={256} required /></label>
    <p className="field-hint">Use at least 15 characters. Share it through an approved private channel. The person can change it in My account.</p>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    {state.success && <p className="notice success" role="status">{state.success}</p>}
    <div><button className="button button-primary" disabled={pending || (role === "employee" && managers.length === 0)}>
      {pending ? "Creating…" : "Create account"}</button></div>
  </form>;
}
