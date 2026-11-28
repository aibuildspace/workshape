import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorForSession } from "./accounts";

export const sessionCookie = "workshape_session";

export async function currentActor() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return;
  return actorForSession(token);
}

export async function requireActor() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}
