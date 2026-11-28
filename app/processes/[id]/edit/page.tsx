import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTimestamp } from "@/components/case-display";
import { ProcessEditor } from "@/components/editor";
import { Shell } from "@/components/shell";
import { requireActor } from "@/lib/web-auth";
import { editableProcess, hrAccounts, ownershipHistory, processQuestionAssignments, processQuestionHistory, publishedProcess, WorkflowError } from "@/lib/workflow";

export default async function EditProcessPage({ params, searchParams }: PageProps<"/processes/[id]/edit">) {
  const actor = await requireActor();
  const { id } = await params;
  const { from } = await searchParams;
  let record;
  try { record = editableProcess(actor, id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const { publishedVersion, hasChanges: _hasChanges, ...initial } = record;
  return <Shell actor={actor} section={from === "manage" ? "manage" : "processes"}>
    <Link className="text-link back-link" href={from === "manage" ? `/manage/${id}` : "/processes"}>
      {from === "manage" ? "← Process health" : "← Processes"}</Link>
    <ProcessEditor initial={initial} accounts={hrAccounts()} canPublish={actor.role === "function_owner"}
      aiAvailable={Boolean(process.env.OPENAI_API_KEY)}
      publishedVersion={publishedVersion} publishedDefinition={publishedVersion ? publishedProcess(id).definition : undefined}
      ownershipEvents={ownershipHistory(actor, id).map((event) => ({ ...event, when: formatTimestamp(event.changedAt) }))}
      questionHistory={processQuestionHistory(actor, id).map((event) => ({ ...event, when: formatTimestamp(event.resolvedAt) }))}
      questionAssignments={processQuestionAssignments(actor, id).map((assignment) => ({ ...assignment,
        expired: assignment.expiresAt <= new Date().toISOString() }))} />
  </Shell>;
}
