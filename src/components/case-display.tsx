import { statuses } from "@/lib/workflow";

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Sydney" }).format(new Date(date));
}

export function formatTimestamp(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney",
  }).format(new Date(date));
}

export function Status({ value }: { value: keyof typeof statuses }) {
  return <span className={`status status-${value}`}><span aria-hidden="true" />{statuses[value]}</span>;
}
