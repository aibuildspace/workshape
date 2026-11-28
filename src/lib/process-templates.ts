import type { Draft } from "./process";

export type ProcessTemplate = {
  id: string;
  title: string;
  description: string;
  route: string;
  draft: Draft;
};

export const processTemplates: ProcessTemplate[] = [
  {
    id: "flexible-work", title: "Flexible work", description: "Collect work dates and location, with HR review for international requests.",
    route: "Manager → HR for international work",
    draft: {
      name: "Flexible work request", purpose: "Review proposed flexible work arrangements and work locations.",
      fields: [
        { key: "start_date", label: "Start date", type: "date", required: true, options: [] },
        { key: "end_date", label: "End date", type: "date", required: true, options: [] },
        { key: "work_location", label: "Work location", type: "select", required: true, options: ["Domestic", "International"] },
        { key: "arrangement", label: "Proposed arrangement", type: "textarea", required: true, options: [] },
      ],
      escalation: { field: "work_location", operator: "equals", value: "International" },
    },
  },
  {
    id: "leave", title: "Leave request", description: "Collect the leave type and dates for a manager decision.",
    route: "Manager decides",
    draft: {
      name: "Leave request", purpose: "Review employee leave requests and record the manager's decision.",
      fields: [
        { key: "leave_type", label: "Leave type", type: "select", required: true, options: ["Annual leave", "Personal leave", "Other"] },
        { key: "start_date", label: "Start date", type: "date", required: true, options: [] },
        { key: "end_date", label: "End date", type: "date", required: true, options: [] },
        { key: "details", label: "Details", type: "textarea", required: false, options: [] },
      ],
      escalation: null,
    },
  },
  {
    id: "policy-exception", title: "Policy exception", description: "Separate routine requests from exceptions that need HR review.",
    route: "Manager → HR for exceptions",
    draft: {
      name: "Policy exception request", purpose: "Record requests that may need an exception to an HR policy.",
      fields: [
        { key: "request_category", label: "Request category", type: "select", required: true, options: ["Standard request", "Policy exception"] },
        { key: "request_details", label: "What are you requesting?", type: "textarea", required: true, options: [] },
        { key: "business_reason", label: "Business reason", type: "textarea", required: true, options: [] },
      ],
      escalation: { field: "request_category", operator: "equals", value: "Policy exception" },
    },
  },
];

export function draftFromTemplate(id: string): Draft | undefined {
  const template = processTemplates.find((item) => item.id === id);
  return template ? structuredClone(template.draft) : undefined;
}
