# Management view development plan

## Goal

Help the HR function owner and each process owner see whether their request processes are running, where decisions are waiting, and which draft needs attention. Keep the employee intake and reviewer queue simple. This view manages processes and operational flow; it does not become a general project or performance-management system.

## Users and questions

| User | Question | Next action |
| --- | --- | --- |
| HR function owner | Which HR processes have unresolved work or unpublished changes? | Open a process editor or review the work queue. |
| Process owner | Is my process being used, and where are requests waiting? | Inspect its status breakdown and improve the draft. |
| Assigned reviewer | What must I decide? | Use the existing work queue and case detail. |
| Employee | What happened to my request? | Use the existing case detail. |

## First release: process management

1. Add a **Management** navigation item for the HR function owner and HR process owners.
2. Show a portfolio table with process, owner, publication state, open draft questions, lifetime case volume, active cases, and cases with no update for at least 48 hours. The 48-hour signal is an attention prompt, not an SLA breach.
3. Add a process detail page with the current status breakdown, number of cases that have needed clarification, publication state, and links to the editor and existing work queue.
4. Export the same process-level aggregate columns as CSV. Recheck actor identity and scope on export.
5. Explain empty states and metric definitions in the UI. Keep tables readable on narrow screens and keyboard accessible.

## Access and data contract

- The HR function owner may list aggregate metrics for all processes in the pilot's single HR function. A process owner may list aggregate metrics for currently owned processes. Other actors receive no management view or export.
- Aggregates include counts and process metadata only. They omit case identifiers, requester and reviewer identities, answers, notes, and event text. Process ownership grants no case detail, list, mutation, or MCP status access.
- A direct management detail lookup uses the same owner/function-owner rule as the list. Export calls the same scoped operation after authenticating the current user.
- Counts include all cases and versions of a process. Current status is measured at request time. “Waiting 48h” means an active case whose `updated_at` is at least 48 hours old; it does not infer a formal deadline. “Needed clarification” counts distinct cases with an information-request event.
- This is an explicit new aggregate visibility grant for process owners. Before introducing another function or business unit, scope it by function membership and test cross-function denial. Do not derive a function-wide grant from a global role in a multi-function deployment.

## Verification for the first release

- Seed processes owned by two different HR users and cases across routine, HR, and clarification paths.
- Check function-owner list/detail/export sees both processes; each process owner sees only their own; employee, manager, and unrelated HR see none.
- Check an owner without case participation still cannot read the case through list, direct detail, or MCP status, and cannot mutate it.
- Check aggregates after submission and a decision, plus the 48-hour boundary. Confirm CSV contains no case data.
- Run type check, tests, build, and browser checks for owner, denied user, empty state, and narrow layout.

## Follow-on releases, gated by pilot evidence

1. **Trends and bottlenecks:** time at each review step, completed cases by period, and clarification reason patterns. These measures are implemented under the rules below. Reviewers choose a structured reason before requesting information; shared free-text notes are never included in aggregate reporting.
2. **Delegation and capacity:** temporary reviewer reassignment with expiry, audit history, and stale-decision protection is implemented for one current case step. Capacity trends and broader rebalancing remain future work. Test list, direct-read, mutation, export, and MCP paths. Do not change reviewer assignments through dashboard UI alone.
3. **Multiple functions and business units:** function memberships, scoped publisher grants, case/version function pinning, and separate cross-function reporting grants. Migrate existing HR records without changing case visibility.
4. **Operational governance:** retention policy, identity-provider integration, deployment/backup verification, and documented support expectations for self-hosted organisations.

## Decision criteria

Run the first release with pilot owners. Keep the view if they can identify a blocked process and take the next action without opening case data they are not entitled to read. Build trends and broader organisation management only when users repeatedly need them and their permission rules are defined.

## Implementation status

The first release is implemented in the Management list, process detail, scoped aggregate operation, and CSV export. Six-month trends, step time, and structured clarification reasons are implemented for the second release. Automated checks cover owner/function-owner scope, denied roles, 48-hour counts, clarification counts, CSV data minimisation, continued case read and mutation denial, timing transitions, and small-group suppression. Browser checks covered empty and populated owner views, process detail, an ownership transfer, employee denial, and the trend sections. A pilot with real users and a narrow-screen browser review remain to be done.

Management guidance now uses deterministic priority rules over the same scoped aggregates. Open draft questions come first because they block publication; an unpublished draft or changed version comes next; a 48-hour waiting signal follows. Home shows one highest-priority signal per managed process, while process detail shows every applicable signal. Waiting counts link to process health and explain that assigned participants use their own queues; they never link an owner to a case they may not read. Editor links from Management return to that process's management detail. These prompts do not change permissions or make decisions.

### Temporary case delegation

- Only the original recorded reviewer who currently holds a manager or HR review step may hand that one case step to another eligible reviewer. Manager steps accept another manager; HR steps accept an HR reviewer or the function owner. The requester, current reviewer, and delegates are excluded as new delegates. Delegates cannot delegate onward.
- A handoff lasts until its chosen expiry (at most 30 days), revocation, or the delegate's decision. During the handoff, the delegate is the current assignee and can read the full case and its shared notes, see it in their work queue and minimal CSV export, check status through MCP, and act on that step. The recorded reviewer and requester retain their existing case read access. The recorded reviewer cannot decide while the delegate is assigned, but can reclaim the step.
- After revocation, expiry, or a decision, the delegate loses case list, direct-read, export, status, and mutation access unless they independently remain a recorded participant. Expiry is applied when a case, queue, notification, or status operation next runs; it returns the step to the recorded reviewer and notifies them. No background scheduler is required for the pilot.
- Handoff, revocation, and delegate decisions use the same case event sequence and stale-event check. The event history records who initiated the handoff and who decided; the delegation history records the expiry and end reason. Participants can see this history. A delegate's successful decision returns them to the work queue because their temporary case access ends at that point.
- No process ownership, function ownership, or aggregate management role grants case read access by itself. A delegate gets access only from their active, case-specific grant. The grant does not alter the case's pinned process version, original manager, or planned HR reviewer.

### Trend and timing rules

- The six-month activity view uses UTC calendar months. “Started” is the number of cases created in a month. “Completed” is the number whose final approved or declined state was recorded in that month. A case can appear in both measures in different months.
- Step time uses case event timestamps and ordinary elapsed hours, including evenings and weekends. For completed cases only, it sums every visit to manager review, HR review, and waiting for information. A clarification pauses reviewer time until the employee responds. An open case contributes no step-time average. Repeated clarification cycles count once per case in the sample, with their durations added.
- A monthly count of one to four is displayed as “Fewer than 5”; zero and counts of five or more are exact. A step average is shown only when at least five distinct completed cases passed through it. This applies to the new breakdowns; the first release's all-time process totals remain exact.
- Owners receive only the resulting aggregate values. Case IDs, event notes, participant names, and individual timestamps stay inside the server operation. Ownership still grants no case detail access.
- When a reviewer requests information, they select one of four shared reasons: missing detail, confirm or correct an answer, policy or eligibility check, or other. The category and required note remain visible to case participants. Existing event rows gain a nullable category column; historical notes and decisions are preserved and appear as uncategorised in reporting.
- Management counts distinct cases for each reason across all versions. A case can count under two reasons after separate clarification cycles. Counts of one to four are shown as “Fewer than 5”; zero and five or more are exact. No free-text notes leave the participant case view.
