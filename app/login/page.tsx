import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignIn } from "@/components/forms";
import { hasAccounts } from "@/lib/accounts";
import { pilotProfiles } from "@/lib/pilot";
import { currentActor, localPilotEnabled } from "@/lib/web-auth";
import { enterLocalPilot } from "../actions";

export default async function LoginPage() {
  if (await currentActor()) redirect("/");
  const pilot = await localPilotEnabled();
  if (pilot) return <main className="login-screen"><div className="login-panel">
    <Brand />
    <h1>Open the local pilot</h1>
    <p className="muted">Use the pilot admin to switch between seeded profiles.</p>
    {pilotProfiles().some((profile) => profile.profile_key === "admin") ?
      <form action={enterLocalPilot}><button className="button button-primary">Open as pilot admin</button></form> :
      <p className="notice">Run <code>npm run seed:pilot</code>, then reload this page.</p>}
  </div></main>;
  return <main className="login-screen">
    <div className="login-panel">
      <Brand />
      <h1>Sign in to Workshape</h1>
      <p className="muted">Access your requests and process workspace.</p>
      {!hasAccounts() && <p className="notice">No accounts have been provisioned. Create the first HR function owner using the account setup instructions in the project README.</p>}
      <SignIn />
    </div>
  </main>;
}
