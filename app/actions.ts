"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, changePassword, createSession, PasswordError, revokeSession, sessionDuration, type Actor } from "@/lib/accounts";
import { assignProcessQuestion, decideCase, delegateCase, provisionAccount, readNotification, resolveProcessQuestion,
  revokeCaseDelegation, revokeProcessQuestionAssignment, saveDefinition, submitRequest, updateProcessLink, WorkflowError } from "@/lib/workflow";
import { requireActor, sessionCookie } from "@/lib/web-auth";
import type { EditorInput } from "@/lib/process";

export type ActionState = { error?: string; success?: string; createdId?: string };

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
  }
  jar.delete(sessionCookie);
  redirect("/login");
}

export async function changeOwnPassword(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const nextPassword = String(data.get("nextPassword") ?? "");
  if (nextPassword !== String(data.get("confirmPassword") ?? "")) {
    return { error: "The new passwords do not match." };
  }
  try {
    changePassword(actor, String(data.get("currentPassword") ?? ""), nextPassword);
  } catch (error) {
    if (error instanceof PasswordError) return { error: error.message };
    console.error("Workshape could not change an account password.");
    return { error: "The password could not be changed. Try again." };
  }
  (await cookies()).delete(sessionCookie);
  redirect("/login?passwordChanged=1");
}

export async function saveProcess(input: EditorInput, publish: boolean) {
  const actor = await requireActor();
  try {
    return { saved: saveDefinition(actor, input, publish === true) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function answerProcessQuestion(data: FormData) {
  const actor = await requireActor();
  try { return { resolved: resolveProcessQuestion(actor, {
    processId: String(data.get("processId") ?? ""), expectedRevision: Number(data.get("expectedRevision")),
    questionIndex: Number(data.get("questionIndex")), answer: String(data.get("answer") ?? ""),
    target: String(data.get("target") ?? ""),
  }) }; }
  catch (error) { return { error: message(error) }; }
}

export async function assignDraftQuestion(data: FormData) {
  const actor = await requireActor();
  try { return { assignment: assignProcessQuestion(actor, {
    processId: String(data.get("processId") ?? ""), expectedRevision: Number(data.get("expectedRevision")),
    questionIndex: Number(data.get("questionIndex")), assigneeId: String(data.get("assigneeId") ?? ""),
    expiresAt: String(data.get("expiresAt") ?? ""),
  }) }; }
  catch (error) { return { error: message(error) }; }
}

export async function revokeDraftQuestionAssignment(data: FormData) {
  const actor = await requireActor();
  try { return { revoked: revokeProcessQuestionAssignment(actor, Number(data.get("assignmentId"))) }; }
  catch (error) { return { error: message(error) }; }
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
  processId: string, version: number, requestKey: string, requesterId: string, fromHome: boolean,
  _state: ActionState, data: FormData,
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
  redirect(`/cases/${id}${fromHome === true ? "?from=home" : ""}`);
}

export async function reviewRequest(
  id: string, lastEvent: number, returnView: "home" | "assigned" | "mine" | "history", returnQuery: string,
  _state: ActionState, data: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = z.enum(["approve", "decline", "request_information", "respond"]).safeParse(data.get("decision"));
  if (!parsed.success) return { error: "Choose an action." };
  let actedAsDelegate = false;
  try {
    const answers = parsed.data === "respond" ? Object.fromEntries(
      [...data.entries()].filter(([key]) => key.startsWith("field:"))
        .map(([key, value]) => [key.slice(6), String(value)]),
    ) : undefined;
    actedAsDelegate = decideCase(actor, id, lastEvent, parsed.data, String(data.get("note") ?? ""), answers,
      String(data.get("clarificationReason") ?? "")).actedAsDelegate;
  } catch (error) {
    return { error: message(error) };
  }
  if (actedAsDelegate) redirect("/work?notice=delegated");
  const view = returnView === "home" || returnView === "mine" || returnView === "history" ? returnView : "assigned";
  redirect(`/cases/${id}?from=${view}${returnQuery ? `&return=${encodeURIComponent(returnQuery)}` : ""}`);
}

export async function delegateReviewCase(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const caseId = String(data.get("caseId") ?? "");
  try {
    delegateCase(actor, { caseId, expectedEvent: Number(data.get("expectedEvent")),
      delegateId: String(data.get("delegateId") ?? ""), expiresAt: String(data.get("expiresAt") ?? "") });
  } catch (error) { return { error: message(error) }; }
  redirect(`/cases/${caseId}`);
}

export async function revokeDelegatedReview(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let caseId: string;
  try {
    ({ caseId } = revokeCaseDelegation(actor, { delegationId: Number(data.get("delegationId")),
      expectedEvent: Number(data.get("expectedEvent")) }));
  } catch (error) { return { error: message(error) }; }
  redirect(`/cases/${caseId}`);
}

export async function openNotification(id: number) {
  const actor = await requireActor();
  let caseId: string;
  try { caseId = readNotification(actor, id); }
  catch { redirect("/work"); }
  redirect(`/cases/${caseId}`);
}

export async function addAccount(_state: ActionState, data: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const createdId = provisionAccount(actor, {
      name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""),
      role: String(data.get("role") ?? "") as Actor["role"],
      managerEmail: String(data.get("managerEmail") ?? "") || undefined,
      password: String(data.get("password") ?? ""),
    });
    return { success: "Account created. Share the credentials securely with the participant.", createdId };
  } catch (error) {
    return { error: message(error) };
  }
}
