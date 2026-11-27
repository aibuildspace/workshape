# Technology Review for Workshape

The pilot should let an HR lead describe and publish a flexible-work process, then let employees submit requests and authorized reviewers act on them. Use one Next.js app for the browser experience and the MCP endpoint. Both use the same published process definitions, case records, and server-side permissions. [Product purpose and pilot](./product-purpose.md)

## Pilot stack

- **Next.js App Router** hosts the process register, editor, intake form, and review queue. Render intake fields from the published definition with ordinary React components. Validate submissions and enforce permissions on the server. [Next.js App Router](https://nextjs.org/docs/app) · [Forms and Server Actions](https://nextjs.org/docs/app/guides/forms)
- **Vercel AI SDK and Zod** turn plain language into a structured draft of fields, steps, reviewer roles, and routing rules. The process owner can edit and test the draft before an authorized publisher makes it live. The application runs the published rules. [AI SDK structured output](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text)
- **React Flow** (`@xyflow/react`) shows a read-only preview of the possible paths and who owns each step. Keep editing in a simple form. On an individual case, show the submitted information, current assignee, and a timeline of what actually happened. [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes)
- **MCP** exposes Workshape to external agents. Use `mcp-handler` with the MCP TypeScript server SDK in a stateless Next.js Route Handler at `/api/mcp`. [Next.js MCP handler](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler)

## Process definitions and case history

Record the owning function, named process owner, intake fields, reviewer roles, and routing rules in a versioned process definition. The published version drives the form, preview, and routing. Each case keeps the version it started on, what was submitted, who has it now, and who acted on it. A case waiting for a manager remains a pending record in the application database.

## MCP tools and permissions

Start with `list_processes`, `get_process`, and `get_request_status`. Add `submit_request` once the web intake form and its validation work. Use OAuth for remote clients and check the authenticated caller's access to the relevant function, process, or case on every operation. Keep publishing and HR decisions in the web app during the pilot. [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization)

If Workshape later needs to read or act through another system's MCP server, add a server-side MCP client for that integration. [AI SDK MCP client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)

## When to add other tools

- **Cerbos** evaluates whether an actor may perform an action on a resource. Start with one set of server-side checks shared by the web app and MCP endpoint. Try Cerbos when several independent applications need to share those policies or when rules across functions become hard to maintain. Evaluate it against the same role and action tests. [Cerbos repository](https://github.com/cerbos/cerbos?tab=readme-ov-file) · [Cerbos permission checks](https://docs.cerbos.dev/cerbos/latest/api/index.html#checkresources-apicheckresources)
- **LangGraph** is useful when an agent needs to carry out its own resumable work, such as gathering evidence across systems, pausing for missing information, and continuing when the employee replies. [LangGraph JavaScript guide](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- **A2UI** lets an agent describe an interactive view using components supported by the client. Try it when users need to complete a specific step inside chat, such as supplying a missing work location. The same published definition and server-side permissions govern that interaction. [A2UI catalog documentation](https://a2ui.org/concepts/catalogs/)
- **bpmn-js** is an option if importing or editing standard BPMN 2.0 diagrams becomes a requirement. [bpmn-js walkthrough](https://bpmn.io/toolkit/bpmn-js/walkthrough/)

## Pilot acceptance checks

1. An HR lead can draft a process from plain language and preview its form, decision branches, and assigned roles before publishing.
2. A routine request goes to the assigned manager. A request to work from another country goes to HR after manager review. Reviewers can inspect the submitted information, and the case history records who decided.
3. The web app and MCP agree on case visibility. An authorized caller can check status, and an unrelated employee is denied access through either entry point.
4. Publishing an updated form changes intake for new requests. Existing cases can still be reviewed against the version they started on.
