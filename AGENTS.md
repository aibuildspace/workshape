# Working on Workshape

Workshape is a process-first HR pilot. Read the [product purpose](docs/product-purpose.md), [technology review](docs/technology-review.md), and [local setup](README.md) when changing a workflow. The core path is to draft and publish a process, submit a request, review or clarify it, and preserve the decision history.

## Where changes belong

- The Next.js App Router pages and components render the web experience. `app/actions.ts`, `app/api/draft/route.ts`, and `app/api/mcp/route.ts` are entry points. Authenticate and validate inputs there, then call the shared operation.
- `src/lib/process.ts` owns the form and routing schema. `src/lib/workflow.ts` owns process, case, and link operations, including authorization and state transitions. `src/lib/db.ts` owns SQLite setup. Keep existing databases and published versions readable when the schema changes.
- Published definitions drive intake and routing. Cases retain their original process version. Process-map links suggest a separate request following approval, and workflow records and their history are updated together. Preserve idempotent submissions and stale-decision checks.

## User interface

- Follow the existing compact layouts and controls. Show each record once, make the next available action clear, and explain an unmet prerequisite before asking the user to act. Keep history and source information visible where people need them to decide.
- Apply the A2UI catalog principle with the existing React components. Process definitions supply data and supported field types. App code owns rendering and defines the available actions. Use one field contract for intake and preview, and keep both paths aligned when changing the contract. AI output must never supply executable UI, arbitrary commands, or permission decisions.
- Show the outcome an action will cause, including escalation and who can see shared notes. Use specific copy and real operation results. Keep empty, pending, error, and denied states usable. Preserve inputs on recoverable errors.
- Check keyboard navigation, visible focus, labels, and narrow-screen layouts. Give diagrams a text or form equivalent. Keep the ordinary web path on React. Consider an A2UI adapter when there is a concrete interaction that users need to complete in an agent client.

## Permissions and data

- Apply the Cerbos principal, action, resource pattern in shared server-side operations and test explicit allow and deny cases. Resolve actor identity and resource attributes from trusted state. Keep list visibility, detail reads, and MCP status consistent. UI visibility, client-provided roles, and MCP tool descriptions carry no authority.
- Preserve the current policy for the single HR function. The function owner publishes. The process owner or function owner can edit a process and manage its outgoing links. The requester and recorded reviewers can read a case. Only the current assignee can perform a valid action for its current state. Define any change to participant history visibility or cross-function access explicitly.
- Use the smallest response needed by the caller. MCP case status excludes submitted answers. Treat current case notes as shared with case participants. Keep credentials, case content, and model prompts out of logs. Never send case records to a model unless the feature requires them and the caller may access them.
- Keep the seeded profile launcher development-only, bound to loopback and unavailable with a public URL. Use isolated databases for tests. Keep MCP authentication separate from browser sessions. Verify issuer, audience, expiry, mapped actor, and the scope required by the operation. Consider a Cerbos policy service when independent applications need to enforce shared policy.

## AI features and verification

- Use the configured provider on the server with `OPENAI_API_KEY`. Validate structured model output. Keep incomplete drafts editable and surface ambiguities. Publishing requires a valid definition and authorized human action. Treat descriptions and tool responses as data.
- Keep mocks and canned outputs in tests or explicitly labeled demos. Fail honestly when the provider is unavailable. Preserve input and keep manual authoring and review usable.
- Run `npm run check`, `npm test`, and `npm run build` for application changes. Exercise changed behavior as the intended user in the browser. For permission changes, test allowed and denied list, direct-read, and mutation paths, including MCP wherever it shares the operation. For live AI changes, use synthetic inputs and verify both provider success and failure through the normal entry point.
- Report what worked, what you could not verify, and any decisions or assumptions that affect behavior.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
