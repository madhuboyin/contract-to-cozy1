// Ask handler support: room map. `roomMapFacts` was found inside the Home Timeline handler and used by the Property
// Summary handler; it lives here with its own subject (FRD v1.110).
// FRD v1.79: the room tile's facts, from the recorded item count and the open (pending or in-progress) maintenance tasks.
export function roomMapFacts(counts: { items?: number; maintenanceTasks?: number } | null | undefined): { countLabel: string; badgeLabel: string | null } {
  const items = counts?.items ?? 0;
  const open = counts?.maintenanceTasks ?? 0;
  return {
    countLabel: `${items} item${items === 1 ? '' : 's'}`,
    badgeLabel: open > 0 ? `${open} open task${open === 1 ? '' : 's'}` : null,
  };
}
