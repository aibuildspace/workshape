# Workshape

Workshape lets an HR team define a request process, publish an intake form, and resolve requests with a recorded decision history. See the [product purpose](docs/product-purpose.md) and [technology review](docs/technology-review.md).

## Run locally

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open [Workshape at localhost](http://127.0.0.1:3000). The app starts with an empty database at `data/workshape.sqlite`. Set `WORKSHAPE_DB` to use a different file. The server keeps `OPENAI_API_KEY` in the environment and uses `gpt-4.1-mini` by default. Set `OPENAI_MODEL` to select another model that supports structured output. On managed networks that trust a private certificate authority in the system store, run `NODE_USE_SYSTEM_CA=1 npm run dev`.

The home page lists searchable published processes as apps and shows the signed-in person's next actions. When `OPENAI_API_KEY` is configured, it also offers AI chat for finding a process and AI process drafting in the editor. Chat uses published process names and purposes only; it does not send case records to the model. Without a configured provider, both AI controls are absent and manual authoring remains usable.

**Work queue** has a searchable, status-filtered case table. **Export CSV** downloads the current view with case IDs, process names, requesters, status, assignees, and update times; it excludes submitted answers and notes. Export resolves the signed-in user again and includes only cases they may list. Filters are retained when opening a case and returning to the table.

### Provision individual accounts

Create an account for each participant with `npm run account -- add`. Supply the password on standard input. In the interactive example below, type at least 15 characters, press Enter, and then send EOF with Ctrl+D. `stty` hides password input.

```sh
stty -echo
npm run --silent account -- add --email "$WORKSHAPE_OWNER_EMAIL" --name "$WORKSHAPE_OWNER_NAME" --role function_owner
stty echo
```

Set `WORKSHAPE_OWNER_EMAIL` and `WORKSHAPE_OWNER_NAME` to the real first owner's details before running the command. Use `manager`, `hr`, or `employee` for additional accounts, or let the function owner add them in **Accounts**. Create the manager before the employee and pass `--manager "$WORKSHAPE_MANAGER_EMAIL"` when provisioning an employee at the command line. An assigned manager is required to submit a case. Each person signs in with their own account. The function owner opens **Processes → New process**, drafts a definition, previews it, and publishes it.

Anyone can change their own password in **My account** after signing in. This signs them out of all browser sessions and revokes local MCP tokens. For recovery when a person cannot sign in, a server operator can use `npm run --silent account -- set-password --email "$WORKSHAPE_USER_EMAIL"` with the new password on standard input, using the same hidden-input steps above. The operator must share the replacement password through an approved private channel. Existing OAuth access tokens are managed by their issuer and are not revoked by this local command.

The new-process editor offers Flexible work, Leave request, and Policy exception templates. Choosing one fills an editable form and decision path; it does not save or publish it. In **Decision path**, choose a manager-only decision or HR review for approved exceptions. The editor shows the path as connected steps and branches. If no suitable routing dropdown exists, choosing HR review adds a required Request category field with starter choices. Review those choices and assign an HR reviewer before publishing.

The pilot starts every request with the employee’s manager. An optional exception rule sends approved requests to an assigned HR reviewer based on the answer to a required dropdown. A reviewer can approve, decline, or return the case for more information.

The published intake form shows the approval path before submission. Its outcome summary updates when the requester selects the routing answer, and names the HR reviewer for cases that need a final HR decision. People viewing a form without an assigned manager can explore the same preview without submitting.

The HR function owner can add accounts under **Accounts**. New assignment activity appears in the work queue; cases waiting on the assignee for two days show a reminder there. When a reviewer asks for information, the requester can correct form answers. Both the old and new answers appear in the shared case history, and later routing uses the corrected values. The process editor includes routine and HR route previews, publication checks, and a comparison with the current published form.

**Accounts** shows people, manager assignments, and process ownership. The function owner can transfer a process to another HR owner in its editor. Ownership changes are recorded; the new owner can maintain the draft and outgoing links, while only the function owner can publish. See the [organization and delegation model](docs/technology-review.md#organization-delegation-and-ai-questions) for the proposed next step beyond the single-function pilot.

AI draft questions appear in the process editor. Save the draft, then answer each question and choose the process detail, routing step, or intake field it concerns. The editor records the answer, resolver, and time in the process history. Open questions block publication; the process owner or function owner can answer them, and the function owner publishes after reviewing the updated definition. Answering a question does not change the form or routing automatically.

The process owner or function owner can assign one open draft question to an HR colleague with an expiry time. The colleague sees it in **Work queue**, answers on a dedicated page, and cannot open the process editor through that assignment. The owner can reassign or revoke it; assignment and resolution history remain visible in the editor. Expired or revoked assignments no longer allow an answer. Assignment does not grant access to case records.

A process owner can export a valid definition as a Workshape JSON file from the editor. The function owner can open **Processes → Import JSON** to load a file into a new editable draft. The file contains the form and routing definition, not ownership, case records, or decision history. Import does not save or publish automatically; assign an HR reviewer if the imported definition has an exception route.

The **Processes** register has a searchable table with owner, version, state, and actions. Any signed-in participant can export a published definition from its row and use that JSON file in the import flow. Drafts remain visible only to their editors.

**Management** shows the HR function owner an aggregate process portfolio and shows each HR process owner their own processes. It includes active cases, status breakdowns, open draft questions, and cases with no update for 48 hours. The 48-hour count is an attention signal rather than a deadline. Owners can export the aggregate summary as CSV; this view does not reveal case identities, answers, or notes. See the [management development plan](docs/management-plan.md) for the permission contract and follow-on work.

Each process management detail also shows six months of submitted requests and recorded decisions, plus average elapsed time in manager review, HR review, and information waiting for completed cases. Small monthly groups and step averages are hidden until five cases contribute. These measures use event times and include evenings and weekends; they do not establish an SLA. Form starts and abandoned attempts require observation during a pilot session; they are not inferred from submitted cases. Use the [pilot usability guide](docs/pilot-usability.md) to run and measure those sessions.

When requesting more information, a reviewer chooses a reason category and writes a shared note explaining the request. Case participants see both in the history. Management shows distinct case counts by reason, with counts below five hidden. Earlier case events without a category remain readable and appear separately; the report never includes note text.

The case page identifies the next person or decision needed. While information is outstanding, every case participant can see the reviewer's question beside that next step. In the history, each question and its response appear together, including any corrected answers; older unpaired events stay visible.

Management surfaces the next process setup step, and Home shows the highest-priority signal for each managed process. The guidance points to open draft questions, unpublished work, or aggregate waiting counts. Case details remain available only through the participant work queue. Opening the editor from Management keeps a return link to the process health view.

The current manager or HR reviewer can delegate one active review step from the case page to an eligible colleague for up to 30 days. The delegate sees the case in their work queue, can review its shared information, and decides under their own name. The original reviewer can reclaim the step. Expiry or a decision ends the delegate's access, and the case history preserves the handoff. A one-week expiry is suggested in the form and can be changed.

## MCP

Connect Codex or Claude Code to `/api/mcp` over Streamable HTTP using the project configuration in `.codex/config.toml` or `.mcp.json`. Local Claude Desktop can launch the same tools over stdio without a web deployment. See [MCP client setup](docs/mcp-clients.md) for local and deployed connections.

The tools list published processes, describe an intake form, submit a request, list the participant's cases, read an accessible case, check its minimal status, and answer a clarification. `get_request` includes submitted answers and shared case history, so use it only when those details are needed. A `submit_request` retry must reuse the original UUID in `requestKey`; a clarification response must use the current event ID returned by `get_request`. Review decisions, delegation, process changes, and publication stay in the web app.

For local testing, start the app with `WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS=1`, then issue an eight-hour bearer token for an existing participant:

```sh
npm run --silent account -- token --email "$WORKSHAPE_USER_EMAIL"
```

Send the token in the MCP client's `Authorization: Bearer` header. For remote MCP, configure an HTTPS deployment with a persistent volume and set `WORKSHAPE_PUBLIC_URL`, `MCP_OAUTH_ISSUER`, and `MCP_OAUTH_JWKS_URL`. Configure the issuer to issue JWT access tokens for the published `/api/mcp` URL with the `workshape:access` scope. When provisioning users, pass their matching OAuth subject with `--subject`. Remote configuration disables local tokens.

## Verify

```sh
npm run test
npm run build
```

## Back up the pilot database

Use a persistent database location for a deployed pilot. The backup command makes a consistent SQLite copy while the app is running. Store the backup in a restricted location and test restoration before relying on it.

```sh
npm run backup -- /secure/backups/workshape-2026-11-28.sqlite
```

To restore, stop every Workshape process, keep a copy of the current database files, then copy the chosen backup to the path set by `WORKSHAPE_DB` (or `data/workshape.sqlite`). Remove any old `-wal` and `-shm` files at that destination before restarting. Restore the database and its surrounding access controls together; a backup contains account and case data.

## License

Workshape is released under the [MIT License](LICENSE).
