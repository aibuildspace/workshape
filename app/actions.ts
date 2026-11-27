"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, createSession, revokeSession, sessionDuration } from "@/lib/accounts";
import { revokePilotSession, startPilotSession, switchPilotProfile } from "@/lib/pilot";
import { decideCase, saveDefinition, submitRequest, updateProcessLink, WorkflowError } from "@/lib/workflow";
import { currentActor, localPilotEnabled, requireActor, sessionCookie } from "@/lib/web-auth";
import type { EditorInput } from "@/lib/process";

export type ActionState = { error?: string };

function message(error: unknown) {
  if (error instanceof WorkflowError) return error.message;
  console.error("Workshape could not complete a server action.");
  return "The operation could not be completed. Try again.";
}

export async function login(_state: ActionState, data: FormData): Promise<ActionState> {
  const email = String(data.get("email") ?? "");
  const actor = authenticate(email, String(data.get("password") ?? ""));
  if (!actor) return { error: "The email or password is incorrect." };
  (await cookies()).set(sessionCookie, createSession(actor.id), {
    httpOnly: true, secure: process.env.WORKSHAPE_PUBLIC_URL?.startsWith("https://") === true,
    sameSite: "lax", path: "/", maxAge: sessionDuration,
  });
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(sessionCookie)?.value;
  if (token) {
    revokeSession(token);
    revokePilotSession(token);
  }
  jar.delete(sessionCookie);
  redirect("/login");
}

export async function enterLocalPilot() {
  if (!(await localPilotEnabled())) redirect("/login");
  if (await currentActor()) redirect("/");
  const token = startPilotSession();
  if (!token) redirect("/login");
  (await cookies()).set(sessionCookie, token, {
    httpOnly: true, sameSite: "strict", path: "/", maxAge: sessionDuration,
  });
  redirect("/");
}

export async function changePilotProfile(data: FormData) {
  if (!(await localPilotEnabled())) redirect("/");
  const token = (await cookies()).get(sessionCookie)?.value;
  const target = data.get("profile");
  if (token && typeof target === "string" && target.length <= 40 && switchPilotProfile(token, target)) {
    redirect("/");
  }
  redirect("/?profileError=1");
}

export async function saveProcess(input: EditorInput, publish: boolean) {
  const actor = await requireActor();
  try {
    return { saved: saveDefinition(actor, input, publish === true) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function changeProcessLink(input: { sourceId: string; targetId: string; operation: "link" | "unlink" }) {
  const actor = await requireActor();
  const parsed = z.object({ sourceId: z.uuid(), targetId: z.uuid(), operation: z.enum(["link", "unlink"]) }).safeParse(input);
  if (!parsed.success) return { error: "Choose two published processes." };
  const { sourceId, targetId, operation } = parsed.data;
  try {
    return { changed: updateProcessLink(actor, sourceId, targetId, operation) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function sendRequest(
  processId: string, version: number, requestKey: string, requesterId: string, _state: ActionState, data: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  if (actor.id !== requesterId) return { error: "Your active profile changed. Reopen this form to continue." };
  const answers = Object.fromEntries(
    [...data.entries()].filter(([key]) => key.startsWith("field:"))
      .map(([key, value]) => [key.slice(6), String(value)]),
  );
  let id: string;
  try {
    ({ id } = submitRequest(actor, { processId, version, answers, requestKey }));
  } catch (error) {
    return { error: message(error) };
  }
  redirect(`/cases/${id}`);
}

export async function reviewRequest(
  id: string, lastEvent: number, returnView: "assigned" | "mine" | "history", _state: ActionState, data: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = z.enum(["approve", "decline", "request_information", "respond"]).safeParse(data.get("decision"));
  if (!parsed.success) return { error: "Choose an action." };
  try {
    decideCase(actor, id, lastEvent, parsed.data, String(data.get("note") ?? ""));
  } catch (error) {
    return { error: message(error) };
  }
  const view = returnView === "mine" || returnView === "history" ? returnView : "assigned";
  redirect(`/cases/${id}?from=${view}`);
}
