import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignIn } from "@/components/forms";
import { hasAccounts } from "@/lib/accounts";
import { currentActor } from "@/lib/web-auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentActor()) redirect("/");
  const { passwordChanged } = await searchParams;
  return <main className="login-screen">
    <div className="login-panel">
      <Brand />
      <h1>Sign in to Workshape</h1>
      <p className="muted">Access your requests and process workspace.</p>
      {passwordChanged === "1" && <p className="notice success" role="status">Password changed. Sign in with your new password.</p>}
      {!hasAccounts() && <p className="notice">No accounts exist yet. An administrator must create the first HR function owner with <code>npm run account -- add</code> on the server. See the setup steps in the README.</p>}
      <SignIn />
    </div>
  </main>;
}
