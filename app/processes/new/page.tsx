import Link from "next/link";
import { notFound } from "next/navigation";
import { ProcessEditor } from "@/components/editor";
import { Shell } from "@/components/shell";
import { requireActor } from "@/lib/web-auth";
import { hrAccounts } from "@/lib/workflow";

export default async function NewProcessPage() {
  const actor = await requireActor();
  if (actor.role !== "function_owner") notFound();
  return <Shell actor={actor} section="processes">
    <Link className="text-link back-link" href="/processes">← Processes</Link>
    <ProcessEditor initial={{ id: null, revision: 0, draft: { name: "", purpose: "", fields: [], escalation: null },
      ownerId: actor.id, hrReviewerId: "", questions: [] }} accounts={hrAccounts()} canPublish publishedVersion={null} />
  </Shell>;
}
