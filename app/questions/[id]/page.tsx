import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTimestamp } from "@/components/case-display";
import { AssignedQuestionForm } from "@/components/assigned-question-form";
import { Shell } from "@/components/shell";
import { requireActor } from "@/lib/web-auth";
import { assignedProcessQuestion, WorkflowError } from "@/lib/workflow";

export default async function AssignedQuestionPage({ params }: PageProps<"/questions/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  let question;
  try { question = assignedProcessQuestion(actor, Number(id)); }
  catch (error) { if (error instanceof WorkflowError && error.status === 404) notFound(); throw error; }
  return <Shell actor={actor} section="work">
    <Link className="text-link back-link" href="/work">← Work queue</Link>
    <div className="page-heading"><div><h1>Answer draft question</h1>
      <p>{question.processName} · Assignment expires {formatTimestamp(question.expiresAt)}</p></div></div>
    <section className="panel assigned-question-panel">
      <h2>{question.question}</h2>
      <p className="muted">Your answer goes to the process owner for review. It will not change the form or routing by itself.</p>
      <AssignedQuestionForm question={question} />
    </section>
  </Shell>;
}
