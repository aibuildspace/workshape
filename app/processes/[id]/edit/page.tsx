import Link from "next/link";
import { notFound } from "next/navigation";
import { ProcessEditor } from "@/components/editor";
import { Shell } from "@/components/shell";
import { requireActor } from "@/lib/web-auth";
import { editableProcess, hrAccounts, WorkflowError } from "@/lib/workflow";

export default async function EditProcessPage({ params }: PageProps<"/processes/[id]/edit">) {
  const actor = await requireActor();
  const { id } = await params;
  let process;
  try { process = editableProcess(actor, id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const { publishedVersion, hasChanges: _hasChanges, ...initial } = process;
  return <Shell actor={actor} section="processes">
    <Link className="text-link back-link" href="/processes">← Processes</Link>
    <ProcessEditor initial={initial} accounts={hrAccounts()} canPublish={actor.role === "function_owner"} publishedVersion={publishedVersion} />
  </Shell>;
}
