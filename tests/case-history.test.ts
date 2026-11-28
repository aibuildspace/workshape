import assert from "node:assert/strict";
import test from "node:test";
import { groupCaseHistory } from "../src/lib/case-history";

test("each clarification is shown once with its response and answer corrections", () => {
  const events = [
    { id: 1, kind: "Submitted", note: "" },
    { id: 2, kind: "Information requested", note: "Which days?" },
    { id: 3, kind: "Information provided", note: "Tuesdays", changes: ["Schedule"] },
    { id: 4, kind: "Information requested", note: "Which location?" },
    { id: 5, kind: "Information provided", note: "Home" },
    { id: 6, kind: "Approved", note: "" },
  ];
  const grouped = groupCaseHistory(events);
  assert.deepEqual(grouped.map((entry) => entry.type), ["event", "clarification", "clarification", "event"]);
  assert.deepEqual(grouped.filter((entry) => entry.type === "clarification")
    .map(({ request, response }) => [request.id, response?.id]), [[2, 3], [4, 5]]);
  assert.equal(grouped[1].type === "clarification" && grouped[1].response, events[2]);
});

test("an unanswered question and older unpaired response remain visible", () => {
  const grouped = groupCaseHistory([
    { id: 1, kind: "Information provided" },
    { id: 2, kind: "Information requested" },
    { id: 3, kind: "Review delegated" },
  ]);
  assert.deepEqual(grouped.map((entry) => entry.type === "event" ? entry.event.id :
    [entry.request.id, entry.response?.id ?? null]), [1, [2, null], 3]);
});
