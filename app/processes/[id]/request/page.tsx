import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/forms";
import { RequestFields } from "@/components/request-fields";
import { Shell } from "@/components/shell";
import { requestManagerId } from "@/lib/accounts";
import { processTitle } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { publishedProcess, WorkflowError } from "@/lib/workflow";

export default async function IntakePage({ params }: PageProps<"/processes/[id]/request">) {
  const actor = await requireActor();
  const { id } = await params;
  let process;
  try { process = publishedProcess(id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const canSubmit = Boolean(requestManagerId(actor));
  return <Shell actor={actor} section="processes">
    <Link href="/processes" className="text-link back-link">← Processes</Link>
    <header className="intake-heading">
      <h1>{processTitle(process.definition.name)}</h1>
      <p>{process.definition.purpose}</p>
    </header>
    <section className="panel content-panel narrow-panel" aria-label={canSubmit ? "Request form" : "Form preview"}>
      {canSubmit
        ? <RequestForm processId={id} version={process.version} requestKey={randomUUID()} requesterId={actor.id} fields={process.definition.fields} />
        : <>
          <p className="notice">Form preview. An assigned manager is required to submit a request.</p>
          <div className="stack"><RequestFields fields={process.definition.fields} /></div>
        </>}
    </section>
  </Shell>;
}
