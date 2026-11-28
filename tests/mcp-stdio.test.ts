import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { accountByEmail, createAccount, issueMcpToken } from "../src/lib/accounts";
import { db } from "../src/lib/db";
import { caseDetail, decideCase, saveDefinition, submitRequest } from "../src/lib/workflow";

const directory = mkdtempSync(join(tmpdir(), "workshape-stdio-"));
process.env.WORKSHAPE_DB = join(directory, "pilot.sqlite");

type RpcResponse = { id: number; result?: { tools?: { name: string }[]; structuredContent?: Record<string, unknown>;
  isError?: boolean; content?: { text: string }[] }; error?: { message: string } };

async function connect(tokenFile: string) {
  const root = process.cwd();
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath,
    [resolve(root, "scripts/mcp-stdio.mjs")], {
    cwd: tmpdir(), env: { ...process.env, WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS: "1",
      WORKSHAPE_MCP_TOKEN: "", WORKSHAPE_MCP_TOKEN_FILE: tokenFile },
    });
  let buffer = "";
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: RpcResponse) => void; reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> }>();
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      const response = JSON.parse(line) as RpcResponse;
      if (response.id === undefined) continue;
      const waiting = pending.get(response.id);
      if (waiting) {
        clearTimeout(waiting.timer);
        pending.delete(response.id);
        waiting.resolve(response);
      }
    }
  });
  child.on("exit", () => {
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("The stdio MCP server exited before replying."));
    }
    pending.clear();
  });
  function call(method: string, params: object) {
    const id = ++nextId;
    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, 5000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  const initialized = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {},
    clientInfo: { name: "workshape-test", version: "1" } });
  assert.equal(initialized.error, undefined);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  return { call, close: () => { child.stdin.end(); child.kill(); } };
}

test("local stdio serves the shared tools and rechecks participant access and token expiry", async () => {
  createAccount({ name: "Owner", email: "owner@stdio.test", role: "function_owner", password: "Test password only 123" });
  createAccount({ name: "Manager", email: "manager@stdio.test", role: "manager", password: "Test password only 123" });
  createAccount({ name: "Requester", email: "requester@stdio.test", role: "employee",
    managerEmail: "manager@stdio.test", password: "Test password only 123" });
  createAccount({ name: "Other", email: "other@stdio.test", role: "employee",
    managerEmail: "manager@stdio.test", password: "Test password only 123" });
  const owner = accountByEmail("owner@stdio.test")!;
  const manager = accountByEmail("manager@stdio.test")!;
  const requester = accountByEmail("requester@stdio.test")!;
  const other = accountByEmail("other@stdio.test")!;
  const saved = saveDefinition(owner, { id: null, revision: 0, ownerId: owner.id, hrReviewerId: "",
    questions: [], draft: { name: "Stdio test", purpose: "Check the transport.",
      fields: [{ key: "schedule", label: "Schedule", type: "text", required: true, options: [] }],
      escalation: null } }, true);
  const caseId = submitRequest(requester, { processId: saved.id, version: saved.version!,
    answers: { schedule: "Tuesday" }, requestKey: randomUUID() }).id;
  decideCase(manager, caseId, caseDetail(manager, caseId).events.at(-1)!.id,
    "request_information", "Confirm the schedule.", undefined, "confirm_answer");
  const requesterToken = issueMcpToken(requester.id);
  const otherToken = issueMcpToken(other.id);
  const requesterFile = join(directory, "requester.token");
  const otherFile = join(directory, "other.token");
  writeFileSync(requesterFile, requesterToken, { mode: 0o600 });
  writeFileSync(otherFile, otherToken, { mode: 0o600 });
  const mine = await connect(requesterFile);
  const stranger = await connect(otherFile);
  try {
    const tools = await mine.call("tools/list", {});
    assert.deepEqual(tools.result?.tools?.map((item) => item.name), ["list_processes", "get_process",
      "get_request_status", "list_my_requests", "get_request", "submit_request", "respond_to_request"]);
    const denied = await stranger.call("tools/call", { name: "get_request", arguments: { requestId: caseId } });
    assert.equal(denied.result?.isError, true);
    const detail = await mine.call("tools/call", { name: "get_request", arguments: { requestId: caseId } });
    const action = detail.result?.structuredContent?.availableAction as { expectedEvent: number };
    assert.equal((detail.result?.structuredContent?.pendingQuestion as { note: string }).note, "Confirm the schedule.");
    const response = await mine.call("tools/call", { name: "respond_to_request",
      arguments: { requestId: caseId, expectedEvent: action.expectedEvent,
        note: "Tuesday every week.", answers: { schedule: "Tuesday every week" } } });
    assert.equal(response.result?.structuredContent?.status, "manager_review");
    assert.equal(caseDetail(requester, caseId).answers.schedule, "Tuesday every week");
    db().prepare("UPDATE mcp_tokens SET expires_at = 0 WHERE user_id = ?").run(requester.id);
    const expired = await mine.call("tools/call", { name: "list_my_requests", arguments: {} });
    assert.equal(expired.result?.isError, true);
    assert.match(expired.result?.content?.[0]?.text ?? "", /Authentication is required/);
  } finally {
    mine.close();
    stranger.close();
  }
});
