"use client";

import { useState } from "react";
import type { Draft } from "@/lib/process";
import { RequestFields } from "./request-fields";
import { RequestOutcome } from "./request-outcome";

export function RequestPreview({ definition, hrReviewerName }: { definition: Draft; hrReviewerName: string | null }) {
  const [values, setValues] = useState<Record<string, string>>({});
  return <div className="stack">
    <RequestFields fields={definition.fields} values={values}
      onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
    <RequestOutcome definition={definition} values={values} hrReviewerName={hrReviewerName} />
  </div>;
}
