import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorForSession } from "./accounts";
import { pilotActor } from "./pilot";

export const sessionCookie = "workshape_session";

export async function localPilotEnabled() {
  if (process.env.NODE_ENV !== "development" || process.env.WORKSHAPE_LOCAL_PILOT !== "1" || process.env.WORKSHAPE_PUBLIC_URL) {
    return false;
  }
  const host = (await headers()).get("host") ?? "";
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host);
}

export async function currentPilotActor() {
  if (!(await localPilotEnabled())) return;
  const token = (await cookies()).get(sessionCookie)?.value;
  return token ? pilotActor(token) : undefined;
}

export async function currentActor() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return;
  return actorForSession(token) ?? (await currentPilotActor());
}

export async function requireActor() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}
