import assert from "node:assert/strict";
import test from "node:test";
import { caseCsv, caseFilters, caseRowsForView } from "../src/lib/case-table";
import type { listCases } from "../src/lib/workflow";

type CaseRow = ReturnType<typeof listCases>[number];

test("case table filters keep the selected view and export only its visible summaries", () => {
  const rows: CaseRow[] = [
    { id: "one", name: "Flexible work", requesterName: "Alex", status: "manager_review", version: 1,
      assignedName: "Jordan", updatedAt: "2026-11-28T00:00:00.000Z", isRequester: false, needsAction: true, delegatedByName: null },
    { id: "two", name: "=HYPERLINK(\"bad\")", requesterName: "Taylor", status: "approved", version: 1,
      assignedName: null, updatedAt: "2026-11-27T00:00:00.000Z", isRequester: true, needsAction: false, delegatedByName: null },
  ];
  const assigned = caseRowsForView(rows, caseFilters({ view: "assigned", q: "Alex" }, true));
  assert.deepEqual(assigned.map((item) => item.id), ["one"]);
  assert.deepEqual(caseRowsForView(rows, caseFilters({ view: "mine", status: "approved" }, true))
    .map((item) => item.id), ["two"]);
  assert.deepEqual(caseRowsForView(rows, caseFilters({ view: "history" }, true)), []);
  assert.equal(caseFilters({ view: "history" }, false).view, "assigned");
  const csv = caseCsv(caseRowsForView(rows, caseFilters({ view: "mine" }, true)));
  assert.match(csv, /'=?HYPERLINK/);
  assert.ok(csv.includes("two"));
  assert.ok(!csv.includes("one"));
});
