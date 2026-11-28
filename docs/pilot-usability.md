# Flexible-work pilot usability guide

Use this guide with prospective HR process owners, employees, managers, and HR reviewers. A developer walkthrough checks that the screens connect; it does not establish that people can use them unaided. Run sessions in an isolated pilot database with synthetic names, dates, and answers. Do not copy real HR cases into a research session.

## Prepare one session

1. Use an isolated database and provision individual owner, employee, manager, and HR accounts using the [README](../README.md#provision-individual-accounts). Keep the research server bound to loopback.
2. Give the participant a goal, not UI instructions. Ask them to think aloud. Have an observer record steps and moments of uncertainty without recording submitted answers or shared notes.
3. Have each participant sign in with their own account when the task reaches their role. Reset to a fresh isolated database for the next independent participant, or clearly mark repeated runs so they are not counted as new people.
4. Let participants use their usual device and input method. Include a narrow screen and keyboard-only run in the round.

## Tasks

| Role | Goal to give the participant | Completion evidence |
| --- | --- | --- |
| HR function owner | Make a flexible-work request process available, including HR review for international work. | Published version appears in Apps; the form explains both routes and names the HR reviewer. |
| Employee | Request an international flexible-work arrangement for synthetic dates. | A case is submitted and shows the manager as the next reviewer. |
| Manager | Ask the employee to confirm a date, then continue the review. | The clarification is shared with participants, and the case waits for the employee. |
| Employee | Correct the date and answer the question. | The current answer changes, the previous value remains in history, and review returns to the manager. |
| Manager | Approve the corrected exception. | The case moves to the named HR reviewer; the manager's action is in history. |
| HR reviewer | Record a final decision. | The case is terminal, the decision actor is recorded, and the employee can read the outcome. |
| HR function owner | Change the published form for future requests. | A new version is published; the earlier case still shows its original version and field labels. |
| HR function owner or assigned process owner | Find aggregate activity and export it. | Management shows the process and the summary CSV downloads without case answers or notes. |

Also try a routine domestic request, a declined request, an unavailable AI provider, and a person who is not a case participant opening a direct case URL. Record an unexpected disclosure or unauthorized action as a blocking defect.

## Observation and measurement

Create one row per participant and task. Use a random session code; do not write the participant's name, case ID, answers, or note text in the worksheet.

| Session code | Role and task | Started? | Completed without help? | Needed a hint? | Time to finish | Where they stopped or hesitated |
| --- | --- | --- | --- | --- | --- | --- |

**Started** means the participant has heard the task goal and begins trying it in Workshape. **Completed without help** means they reach the task's completion evidence before a facilitator gives a hint. Record a hint as assisted even if the participant later finishes. Count every started task, including abandoned tasks. For each task, calculate `unassisted completions / starts`; report the numerator and denominator alongside the percentage. Compare the same task and participant type across rounds. With small pilot groups, inspect individual observations instead of treating a percentage as a product-wide result.

The Management page reports **submitted requests** and **decisions recorded**, with small monthly groups suppressed. Those are workflow counts, not form-start or usability completion rates. Do not divide decisions in one month by submissions in that month: the decisions can belong to requests from earlier months. The observation worksheet measures whether people could complete their assigned task. Add automated attempt tracking only after defining retention, consent, repeat-visit handling, and access to the resulting data.

## Review after each round

Group issues by task and severity. Fix first any wrong outcome, exposed case data, lost answer, or step that requires a facilitator hint. Then address wording, navigation, and slower steps. Repeat the affected tasks with new participants. Keep the synthetic developer walkthrough separate from user findings.
