export const RADAR_RECENTLY_ENDED_HOURS = 72;

const TERMINAL_STATUSES = new Set(['resolved', 'expired', 'retracted']);

type RadarVisibilityEvent = {
  status: string;
  startAt: Date;
  endAt?: Date | null;
  observedAt?: Date | null;
  resolvedAt?: Date | null;
  expiredAt?: Date | null;
  retractedAt?: Date | null;
  updatedAt?: Date | null;
};

export type RadarTimingGroup = 'now' | 'upcoming' | 'recently_ended';

export function radarTerminalAt(event: RadarVisibilityEvent): Date | null {
  if (!TERMINAL_STATUSES.has(event.status)) return null;
  return event.resolvedAt
    ?? event.expiredAt
    ?? event.retractedAt
    ?? event.observedAt
    ?? event.updatedAt
    ?? event.endAt
    ?? null;
}

export function radarMatchVisibleUntil(
  event: RadarVisibilityEvent,
  retentionHours = RADAR_RECENTLY_ENDED_HOURS,
): Date | null {
  const terminalAt = radarTerminalAt(event);
  if (!terminalAt) return event.endAt ?? null;
  return new Date(terminalAt.getTime() + retentionHours * 60 * 60 * 1_000);
}

export function radarMatchVisibleFrom(event: RadarVisibilityEvent): Date {
  if (event.observedAt && event.observedAt < event.startAt) return event.observedAt;
  return event.startAt;
}

export function radarTimingGroup(
  event: RadarVisibilityEvent,
  now = new Date(),
): RadarTimingGroup {
  if (TERMINAL_STATUSES.has(event.status)) return 'recently_ended';
  if (event.startAt > now) return 'upcoming';
  return 'now';
}
