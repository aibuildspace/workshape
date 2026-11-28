import Link from "next/link";
import { notFound } from "next/navigation";
import { ProcessEditor } from "@/components/editor";
import { Shell } from "@/components/shell";
import { requireActor } from "@/lib/web-auth";
import { hrAccounts } from "@/lib/workflow";

export default async function NewProcessPage({ searchParams }: PageProps<"/processes/new">) {
  const actor = await requireActor();
  const { start } = await searchParams;
  if (actor.role !== "function_owner") notFound();
  return <Shell actor={actor} section="processes">
    <Link className="text-link back-link" href="/processes">← Processes</Link>
    <ProcessEditor initial={{ id: null, revision: 0, draft: { name: "", purpose: "", fields: [], escalation: null },
      ownerId: actor.id, hrReviewerId: "", questions: [] }} accounts={hrAccounts()} canPublish
      aiAvailable={Boolean(process.env.OPENAI_API_KEY)} publishedVersion={null}
      ownershipEvents={[]} questionHistory={[]} questionAssignments={[]}
      initialStartMode={start === "import" ? "import" : "template"} />
  </Shell>;
}
