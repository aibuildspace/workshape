import assert from "node:assert/strict";
import test from "node:test";
import { calculateManagementTrends, type ManagementCase, type ManagementEvent } from "../src/lib/management-metrics";

test("management trends separate clarification time and suppress small groups", () => {
  const cases: ManagementCase[] = [];
  const events: ManagementEvent[] = [];
  for (let index = 0; index < 5; index++) {
    const id = `completed-${index}`;
    cases.push({ id, status: "approved", createdAt: "2026-11-10T09:00:00.000Z", updatedAt: "2026-11-10T17:00:00.000Z" });
    events.push(
      { caseId: id, kind: "Submitted", at: "2026-11-10T09:00:00.000Z" },
      { caseId: id, kind: "Information requested", at: "2026-11-10T11:00:00.000Z" },
      { caseId: id, kind: "Information provided", at: "2026-11-10T14:00:00.000Z" },
      { caseId: id, kind: "Approved", at: "2026-11-10T17:00:00.000Z" },
    );
  }
  cases.push({ id: "open", status: "manager_review", createdAt: "2026-10-10T09:00:00.000Z",
    updatedAt: "2026-10-10T09:00:00.000Z" });
  events.push({ caseId: "open", kind: "Submitted", at: "2026-10-10T09:00:00.000Z" });
  const trends = calculateManagementTrends(cases, events, new Date("2026-11-28T12:00:00.000Z"));
  assert.equal(trends.monthly.find((month) => month.key === "2026-10")?.submitted, null);
  assert.equal(trends.monthly.find((month) => month.key === "2026-11")?.submitted, 5);
  assert.equal(trends.monthly.find((month) => month.key === "2026-11")?.decided, 5);
  assert.equal(trends.monthly.find((month) => month.key === "2026-09")?.submitted, 0);
  assert.deepEqual(trends.steps.map(({ key, cases, averageHours }) => [key, cases, averageHours]), [
    ["manager", 5, 5], ["hr", 0, null], ["information", 5, 3],
  ]);
  assert.equal(JSON.stringify(trends).includes("completed-0"), false);
});

test("a repeated review visit is added once per case and HR time starts after manager approval", () => {
  const cases: ManagementCase[] = Array.from({ length: 5 }, (_, index) => ({
    id: String(index), status: "declined", createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T09:00:00.000Z",
  }));
  const events: ManagementEvent[] = cases.flatMap((item) => [
    { caseId: item.id, kind: "Submitted", at: "2026-11-01T00:00:00.000Z" },
    { caseId: item.id, kind: "Manager approved and sent to HR", at: "2026-11-01T02:00:00.000Z" },
    { caseId: item.id, kind: "Information requested", at: "2026-11-01T03:00:00.000Z" },
    { caseId: item.id, kind: "Information provided", at: "2026-11-01T06:00:00.000Z" },
    { caseId: item.id, kind: "Declined", at: "2026-11-01T09:00:00.000Z" },
  ]);
  const trends = calculateManagementTrends(cases, events, new Date("2026-11-28T00:00:00.000Z"));
  assert.deepEqual(trends.steps.map(({ averageHours }) => averageHours), [2, 4, 3]);
  assert.deepEqual(trends.steps.map(({ cases }) => cases), [5, 5, 5]);
});
