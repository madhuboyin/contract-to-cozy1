import type { AskComparisonBadge, AskDeckBatch, AskGroupedListItem, AskPresentationBlock } from './types';
import type { GroupedListPresentationPreference } from './adaptivePresentation';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-013–022, FRD v1.72). Deterministic choice of a shared display
// pattern. The server declares the pattern (IW-PRES-022); this module only checks that the block's data fits it,
// and otherwise returns null so the caller renders the ordinary grouped list (IW-PRES-012). Nothing here reads
// block ids or titles.

type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type TimelineBlock = Extract<AskPresentationBlock, { type: 'TIMELINE' }>;
type ComparisonOption = Extract<AskPresentationBlock, { type: 'COMPARISON' }>['options'][number];

export type GroupedListPattern = 'SHELVES' | 'DECK' | 'ROOM_MAP';

export type GroupedListPatternDecision =
  | { pattern: null; offersChoice: boolean; reason: 'NO_PATTERN' | 'NO_ITEMS' | 'ITEMS_WITHOUT_ACTIONS' | 'TOO_MANY_FOR_DECK' | 'HOMEOWNER_CHOSE_LIST' }
  | { pattern: 'SHELVES' | 'ROOM_MAP'; offersChoice: true; reason: 'DECLARED' }
  | { pattern: 'DECK'; offersChoice: true; reason: 'DECLARED'; swipeRightActionId: string | null; swipeLeftActionId: string | null; batch: AskDeckBatch | null };

/** A deck shows one card at a time, so it is only offered for a bounded set a homeowner can work through. */
export const DECK_MAX_ITEMS = 30;

export function groupedListItems(block: GroupedListBlock): AskGroupedListItem[] {
  return block.sections.flatMap((section) => section.items);
}

function swipeActionFor(items: AskGroupedListItem[], actionId: string | null | undefined): string | null {
  if (!actionId) return null;
  return items.every((item) => item.actions?.some((action) => action.id === actionId)) ? actionId : null;
}

export function resolveGroupedListPattern(block: GroupedListBlock, preference: GroupedListPresentationPreference): GroupedListPatternDecision {
  const declared = block.presentation;
  if (!declared) return { pattern: null, offersChoice: false, reason: 'NO_PATTERN' };
  const items = groupedListItems(block);
  if (items.length === 0) return { pattern: null, offersChoice: false, reason: 'NO_ITEMS' };
  if (declared.pattern === 'DECK') {
    // IW-PRES-015: a deck is offered only when every item carries declared actions.
    if (!items.every((item) => (item.actions?.length ?? 0) > 0)) return { pattern: null, offersChoice: false, reason: 'ITEMS_WITHOUT_ACTIONS' };
    if (items.length > DECK_MAX_ITEMS) return { pattern: null, offersChoice: false, reason: 'TOO_MANY_FOR_DECK' };
  }
  // IW-PRES-008: the homeowner may always switch a patterned result back to the plain list. Its own List/Cards
  // choice keeps the plain list; only Auto (or "Show as …") returns to the declared pattern.
  if (preference === 'LIST' || preference === 'CARDS') return { pattern: null, offersChoice: true, reason: 'HOMEOWNER_CHOSE_LIST' };
  if (declared.pattern === 'DECK') {
    return {
      pattern: 'DECK', offersChoice: true, reason: 'DECLARED',
      swipeRightActionId: swipeActionFor(items, declared.swipeRightActionId),
      swipeLeftActionId: swipeActionFor(items, declared.swipeLeftActionId),
      batch: declared.batch ?? null,
    };
  }
  return { pattern: declared.pattern, offersChoice: true, reason: 'DECLARED' };
}

export const PATTERN_LABELS: Record<GroupedListPattern, string> = { SHELVES: 'Shelves', DECK: 'One at a time', ROOM_MAP: 'Room map' };

/** IW-PRES-016: several declared badges when present, else the single legacy badge. */
export function comparisonBadges(option: ComparisonOption): AskComparisonBadge[] {
  if (option.badges && option.badges.length > 0) return option.badges;
  return option.badge ? [option.badge] : [];
}

/** IW-PRES-019: rooms grouped by stored floor level, lowest first; rooms with no floor level go last as "Other". */
export function roomFloors(items: AskGroupedListItem[]): Array<{ key: string; label: string; items: AskGroupedListItem[] }> {
  const byFloor = new Map<number | null, AskGroupedListItem[]>();
  items.forEach((item) => {
    const floor = typeof item.floorLevel === 'number' ? item.floorLevel : null;
    byFloor.set(floor, [...(byFloor.get(floor) ?? []), item]);
  });
  const floors = Array.from(byFloor.keys()).filter((floor): floor is number => floor !== null).sort((a, b) => a - b);
  const ordered = floors.map((floor) => ({ key: `floor-${floor}`, label: `Floor ${floor}`, items: byFloor.get(floor)! }));
  const other = byFloor.get(null);
  if (other) ordered.push({ key: 'floor-other', label: floors.length ? 'Other' : 'Rooms', items: other });
  return ordered;
}

export type TimelinePoint = { id: string; year: number; label: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * IW-PRES-017: places a dated record on the track at its recorded precision. Accepts YYYY, YYYY-MM or an ISO date
 * (a time part is ignored). A month-precision record is placed mid-month and labelled with the month only; the day
 * is never invented. Returns null when the date cannot be read.
 */
export function timelinePoint(id: string, date: string | null | undefined, precision: 'DAY' | 'MONTH' | 'YEAR' | null | undefined): TimelinePoint | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(date ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null && (day < 1 || day > 31)) return null;
  const effective = precision ?? (day !== null ? 'DAY' : month !== null ? 'MONTH' : 'YEAR');
  if (effective === 'YEAR' || month === null) return { id, year: year + 0.5, label: String(year) };
  if (effective === 'MONTH' || day === null) return { id, year: year + (month - 0.5) / 12, label: `${MONTHS[month - 1]} ${year}` };
  return { id, year: year + (month - 1 + (day - 0.5) / 31) / 12, label: `${MONTHS[month - 1]} ${day}, ${year}` };
}

/** The track is used only when there are at least two items and every one has a readable date. */
export function resolveTimelineTrack(block: TimelineBlock): TimelinePoint[] | null {
  if (block.items.length < 2) return null;
  const points = block.items.map((item) => timelinePoint(item.id, item.date, item.datePrecision));
  return points.every((point): point is TimelinePoint => point !== null) ? points : null;
}

/** IW-PRES-018: sorted by the share of typical life used (age over the top of the range), most used first. */
export function lifespanOrder<T extends { ageYears: number; typicalLifeYears: { max: number } }>(items: T[]): T[] {
  const share = (item: T) => (item.typicalLifeYears.max > 0 ? item.ageYears / item.typicalLifeYears.max : Number.POSITIVE_INFINITY);
  return [...items].sort((a, b) => share(b) - share(a));
}

/** A shared year scale for every bar, rounded up to the next 5 years. */
export function lifespanScaleMax(items: Array<{ ageYears: number; typicalLifeYears: { max: number } }>): number {
  const top = Math.max(1, ...items.map((item) => Math.max(item.ageYears, item.typicalLifeYears.max)));
  return Math.ceil(top / 5) * 5;
}
