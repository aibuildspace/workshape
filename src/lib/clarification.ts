export const clarificationReasons = [
  { code: "missing_detail", label: "Missing detail" },
  { code: "confirm_answer", label: "Confirm or correct an answer" },
  { code: "policy_check", label: "Policy or eligibility check" },
  { code: "other", label: "Other" },
] as const;

export type ClarificationReason = (typeof clarificationReasons)[number]["code"];

export function clarificationReasonLabel(code: string | null) {
  return clarificationReasons.find((item) => item.code === code)?.label ?? null;
}

export function validClarificationReason(code: string): code is ClarificationReason {
  return clarificationReasons.some((item) => item.code === code);
}
