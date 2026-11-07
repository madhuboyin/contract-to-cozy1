// Ask handler support: room-by-room inventory. "Give me the item details in each room" is the same inventory answer as any other, grouped by
// the room each item is recorded in. Pure and dependency-free so the router (which decides the question is a room-by-room one) and the inventory
// handler (which groups the rows) share one definition of it.

/** "in each room", "every room", "room by room", "by room", or "what rooms do I have and what is in each one". */
export const EACH_ROOM_PATTERN = /\b(?:in|for|of)\s+(?:each|every|all)\s+(?:of\s+)?(?:the\s+|my\s+|our\s+)?rooms?\b|\b(?:each|every)\s+room\b|\broom[- ]by[- ]room\b|\b(?:by|per)\s+room\b|\bwhat rooms?\b.{0,25}\b(?:do (?:i|we) have|are there)\b.{0,40}\b(?:in (?:each|every)|items?|appliances?)\b/i;

export const NO_ROOM_TITLE = 'No room assigned';

export interface RoomGroup<Row> { id: string; title: string; count: number; items: Row[] }

/** Groups rows by room name, rooms alphabetical and the unassigned group last. */
export function groupRowsByRoom<Row extends { id: string }>(rows: readonly Row[], roomOf: (row: Row) => string | null | undefined): RoomGroup<Row>[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const room = roomOf(row)?.trim() || NO_ROOM_TITLE;
    groups.set(room, [...(groups.get(room) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left === NO_ROOM_TITLE ? 1 : right === NO_ROOM_TITLE ? -1 : left.localeCompare(right)))
    .map(([title, items]) => ({ id: `room-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned'}`, title, count: items.length, items }));
}
