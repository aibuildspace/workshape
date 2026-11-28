import assert from "node:assert/strict";
import test from "node:test";
import { managementHighlights, managementSignals } from "../src/lib/management";
import type { listManagedProcesses } from "../src/lib/workflow";

type ManagedProcess = ReturnType<typeof listManagedProcesses>[number];
const base: ManagedProcess = {
  id: "process-a", name: "Flexible work", ownerName: "Sam", version: 1,
  hasUnpublishedChanges: false, openQuestions: 0, updatedAt: "2026-11-28T00:00:00.000Z",
  totalCases: 0, managerReview: 0, hrReview: 0, needsInformation: 0,
  approved: 0, declined: 0, waiting48h: 0, clarifiedCases: 0, activeCases: 0,
};

test("management guidance prioritizes owner work and routes aggregate waiting signals to process health", () => {
  const item = { ...base, openQuestions: 2, hasUnpublishedChanges: true, waiting48h: 3 };
  const ownerSignals = managementSignals(item, false);
  assert.deepEqual(ownerSignals.map((signal) => signal.priority), [0, 1, 2]);
  assert.equal(ownerSignals[0].href, "/processes/process-a/edit?from=manage#draft-questions");
  assert.match(ownerSignals[1].detail, /HR function owner/);
  assert.equal(ownerSignals[2].href, "/manage/process-a#management-current-status");
  assert.match(ownerSignals[2].detail, /Assigned participants/);
  assert.equal(ownerSignals.some((signal) => signal.href.startsWith("/cases/")), false);
  assert.match(managementSignals(item, true)[1].detail, /publishing/);
  assert.deepEqual(managementSignals(base, false), []);
});

test("home process signals show one highest-priority issue per managed process", () => {
  const waiting = { ...base, id: "process-b", name: "Leave", waiting48h: 1 };
  const questions = { ...base, id: "process-c", name: "Policy", openQuestions: 1, waiting48h: 2 };
  const highlights = managementHighlights([waiting, questions, base], false);
  assert.deepEqual(highlights.map((signal) => signal.processId), ["process-c", "process-b"]);
  assert.equal(highlights[0].title, "1 open draft question");
});
