# Technology Review for Workshape

The pilot should let an HR lead describe and publish a flexible-work process, then let employees submit requests and authorized reviewers act on them. Use one Next.js app for the browser experience and the MCP endpoint. Both use the same published process definitions, case records, and server-side permissions. [Product purpose and pilot](./product-purpose.md)

## Pilot stack

- **Next.js App Router** hosts the process register, editor, intake form, and review queue. Render intake fields from the published definition with ordinary React components. Validate submissions and enforce permissions on the server. [Next.js App Router](https://nextjs.org/docs/app) · [Forms and Server Actions](https://nextjs.org/docs/app/guides/forms)
- **Vercel AI SDK and Zod** turn plain language into a structured draft of fields, steps, reviewer roles, and routing rules. The process owner can edit and test the draft before an authorized publisher makes it live. The application runs the published rules. [AI SDK structured output](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text)
- **React Flow** (`@xyflow/react`) shows a read-only preview of the possible paths and who owns each step. Keep editing in a simple form. On an individual case, show the submitted information, current assignee, and a timeline of what actually happened. [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes)
- **MCP** exposes Workshape to external agents. Use `mcp-handler` with the MCP TypeScript server SDK in a stateless Next.js Route Handler at `/api/mcp`. [Next.js MCP handler](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler)

## Process definitions and case history

Record the owning function, named process owner, intake fields, reviewer roles, and routing rules in a versioned process definition. The published version drives the form, preview, and routing. Each case keeps the version it started on, what was submitted, who has it now, and who acted on it. A case waiting for a manager remains a pending record in the application database.

Starter templates and the visual decision-path controls fill and edit the existing draft schema. They support the pilot's manager review and optional HR exception branch; they do not introduce arbitrary graph execution. Published definitions continue to govern intake and routing, and the existing human publish check applies to template drafts.

## MCP tools and permissions

The endpoint now offers `list_processes`, `get_process`, `submit_request`, `list_my_requests`, `get_request_status`, `get_request`, and `respond_to_request`. The two detail levels are deliberate: status and lists omit answers and notes; `get_request` returns the shared case content only after the participant access check. A response calls the same state transition as the web form, including the stale-event guard. The HTTP endpoint and local stdio launcher register one shared tool catalog. Stdio checks the local participant token on every call, including after startup; it rejects a public OAuth deployment. The server advertises read/write hints and client instructions, but these convey no authority. Use OAuth for remote clients and check the authenticated caller's access to the relevant function, process, or case on every operation. Keep publishing and HR decisions in the web app during the pilot. [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization)

If Workshape later needs to read or act through another system's MCP server, add a server-side MCP client for that integration. [AI SDK MCP client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)

## When to add other tools

- **Cerbos** evaluates whether an actor may perform an action on a resource. Start with one set of server-side checks shared by the web app and MCP endpoint. Try Cerbos when several independent applications need to share those policies or when rules across functions become hard to maintain. Evaluate it against the same role and action tests. [Cerbos repository](https://github.com/cerbos/cerbos?tab=readme-ov-file) · [Cerbos permission checks](https://docs.cerbos.dev/cerbos/latest/api/index.html#checkresources-apicheckresources)
- **LangGraph** is useful when an agent needs to carry out its own resumable work, such as gathering evidence across systems, pausing for missing information, and continuing when the employee replies. [LangGraph JavaScript guide](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- **A2UI** lets an agent describe an interactive view using components supported by the client. Try it when users need to complete a specific step inside chat, such as supplying a missing work location. The same published definition and server-side permissions govern that interaction. [A2UI catalog documentation](https://a2ui.org/concepts/catalogs/)
- **bpmn-js** is an option if importing or editing standard BPMN 2.0 diagrams becomes a requirement. [bpmn-js walkthrough](https://bpmn.io/toolkit/bpmn-js/walkthrough/)

## Organization, delegation, and AI questions

The pilot has one HR function. A user's global role currently applies throughout it, and the function owner assigns an HR process owner. Ownership transfers affect who can edit the current draft and outgoing links; publishing remains with the function owner. Transfers are recorded in an ownership history. A process owner does not gain access to case answers merely by owning the process.

The management view gives the function owner process-level aggregate counts across the HR pilot and each HR process owner counts for currently owned processes. It includes no case identifiers, participant names, answers, or notes. Its detail and CSV export use the same scope check. Ownership still does not grant individual case access. The [management plan](./management-plan.md) defines the metric meanings and the work required before extending this view across functions.

Process detail trends use only case creation, current terminal state, and event times. They show six UTC calendar months of submissions and decisions, plus elapsed time in each step among completed cases. They do not measure form starts or abandonment. New breakdowns suppress groups smaller than five; event notes and individual times are not returned. Reviewers now select a structured clarification reason alongside their shared note. Management groups distinct cases by that reason, while earlier events with no category remain readable.

For more functions, model **function** as the permission scope and **business unit** as an employee affiliation and reporting dimension. Add function membership and scoped owner/publisher grants before adding a second function. Pin the owning function and reviewer assignments to each published version and case so later reorganizations do not rewrite existing decisions. Published processes may remain discoverable to signed-in employees, while drafts stay within their owning function. A case remains readable only by its requester and recorded reviewers; business-unit membership alone grants no case access. Cross-function case access and aggregate reporting need separate, explicit grants and tests.

Draft-question delegation now grants a named HR colleague the answer action for one open question, with a recorded grantor, start, expiry, and revocation. The assignee sees only the question, process name, and field labels needed to place the answer. The owner or function owner can revoke or reassign the question. Transferring a process owner remains distinct from delegating one task. Neither operation grants access to unrelated case content. Any further delegation type needs the same list, direct-read, mutation, export, and MCP checks.

Case review delegation now grants one eligible colleague the current manager or HR decision step for one case, with an expiry no more than 30 days away. The delegate becomes the current assignee, can read that case while the grant is active, and loses access when it ends unless separately a recorded participant. The original reviewer remains a case participant and may reclaim the step. Grant, revoke, expiry, and decision history are visible to participants. Shared list, detail, export, mutation, and MCP status operations enforce this case-specific grant. The [management plan](./management-plan.md#temporary-case-delegation) defines the exact lifecycle.

AI-generated drafting questions are resolved by the current process owner, function owner, or active delegated assignee. Each answer records the question, process detail/routing/field location, resolver, and time. Open questions block publication, and removing or reordering one through a draft save is denied. A resolution does not automatically change the definition; the owner updates the relevant section before the function owner publishes. Question source metadata and broader function/business-unit administration remain future work. Case clarifications already use case events and the current assignee; present the question and response together against the case step without broadening visibility. AI may suggest a draft, question, or next action, but only an authorized person can publish, assign access, or decide a case. The server resolves actor identity and permissions for every AI-initiated operation.

## Pilot acceptance checks

1. An HR lead can draft a process from plain language and preview its form, decision branches, and assigned roles before publishing.
2. A routine request goes to the assigned manager. A request to work from another country goes to HR after manager review. Reviewers can inspect the submitted information, and the case history records who decided.
3. The web app and MCP agree on case visibility. An authorized caller can check status, and an unrelated employee is denied access through either entry point.
4. Publishing an updated form changes intake for new requests. Existing cases can still be reviewed against the version they started on.
