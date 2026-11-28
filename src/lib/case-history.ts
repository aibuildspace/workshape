type HistoryEvent = { id: number; kind: string };

export type HistoryEntry<T extends HistoryEvent> =
  | { type: "event"; event: T }
  | { type: "clarification"; request: T; response: T | null };

// Case events are stored in order. A response belongs to the immediately preceding
// information request; leaving other events separate preserves older histories.
export function groupCaseHistory<T extends HistoryEvent>(events: readonly T[]): HistoryEntry<T>[] {
  const entries: HistoryEntry<T>[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind === "Information requested") {
      const next = events[index + 1];
      const response = next?.kind === "Information provided" ? next : null;
      entries.push({ type: "clarification", request: event, response });
      if (response) index += 1;
    } else {
      entries.push({ type: "event", event });
    }
  }
  return entries;
}
