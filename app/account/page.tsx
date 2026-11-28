import { PasswordForm } from "@/components/password-form";
import { Shell } from "@/components/shell";
import { roleLabel } from "@/lib/accounts";
import { requireActor } from "@/lib/web-auth";

export default async function AccountPage() {
  const actor = await requireActor();
  return <Shell actor={actor} section="account">
    <header className="workspace-heading"><h1>My account</h1></header>
    <section className="panel content-panel narrow-panel" aria-labelledby="account-details-title">
      <h2 id="account-details-title">Account details</h2>
      <p><strong>{actor.name}</strong><br />{actor.email}<br />{roleLabel[actor.role]}</p>
    </section>
    <section className="panel content-panel narrow-panel" aria-labelledby="change-password-title">
      <h2 id="change-password-title">Change password</h2>
      <PasswordForm />
    </section>
  </Shell>;
}
