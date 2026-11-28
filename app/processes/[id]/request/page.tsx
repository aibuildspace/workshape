import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/forms";
import { RequestPreview } from "@/components/request-preview";
import { Shell } from "@/components/shell";
import { accountById, requestManagerId } from "@/lib/accounts";
import { processTitle } from "@/lib/process";
import { requireActor } from "@/lib/web-auth";
import { publishedProcess, WorkflowError } from "@/lib/workflow";

export default async function IntakePage({ params, searchParams }: PageProps<"/processes/[id]/request">) {
  const actor = await requireActor();
  const { id } = await params;
  const { from } = await searchParams;
  const fromHome = from === "home";
  let process;
  try { process = publishedProcess(id); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  const managerId = requestManagerId(actor);
  const managerName = managerId ? accountById(managerId)?.name : undefined;
  return <Shell actor={actor} section="processes">
    <Link href={fromHome ? "/" : "/processes"} className="text-link back-link">← {fromHome ? "Home" : "Processes"}</Link>
    <header className="intake-heading">
      <h1>{processTitle(process.definition.name)}</h1>
      <p>{process.definition.purpose}</p>
    </header>
    <section className="panel content-panel narrow-panel" aria-label={managerName ? "Request form" : "Form preview"}>
      {managerName
        ? <RequestForm processId={id} version={process.version} requestKey={randomUUID()} requesterId={actor.id}
            fromHome={fromHome}
            definition={process.definition} hrReviewerName={process.hrReviewerName} managerName={managerName} />
        : <>
          <p className="notice">Form preview. An assigned manager is required to submit a request.</p>
          <RequestPreview definition={process.definition} hrReviewerName={process.hrReviewerName} />
        </>}
    </section>
  </Shell>;
}
