import type { RadarActionTaskOperation } from './radarActionRegistry';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_USER_LEAD_MS = 5 * 60 * 1000;
const MAX_USER_HORIZON_MS = 365 * DAY_MS;
const MAX_DERIVED_EFFECTIVE_HORIZON_MS = 90 * DAY_MS;
const MAX_DERIVED_EXPIRATION_HORIZON_MS = 30 * DAY_MS;

export type RadarTaskDueDateSource =
  | 'user_provided'
  | 'event_effective'
  | 'event_expiration'
  | 'active_window';

export type RadarTaskDueDateDecision = {
  dueAt: Date;
  source: RadarTaskDueDateSource;
};

export class RadarTaskDueDateError extends Error {
  constructor(
    public readonly code:
      | 'RADAR_DUE_DATE_INVALID'
      | 'RADAR_REMINDER_DUE_DATE_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'RadarTaskDueDateError';
  }
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function userDueDate(value: Date | string, now: Date): RadarTaskDueDateDecision {
  const dueAt = validDate(value);
  if (
    !dueAt
    || dueAt.getTime() < now.getTime() + MIN_USER_LEAD_MS
    || dueAt.getTime() > now.getTime() + MAX_USER_HORIZON_MS
  ) {
    throw new RadarTaskDueDateError(
      'RADAR_DUE_DATE_INVALID',
      'Due date must be at least five minutes and no more than one year in the future.',
    );
  }
  return { dueAt, source: 'user_provided' };
}

export function deriveRadarTaskDueDate(input: {
  now: Date;
  operation: RadarActionTaskOperation;
  priority: 'high' | 'medium' | 'low';
  effectiveAt?: Date | string | null;
  expiresAt?: Date | string | null;
  requestedDueAt?: Date | string | null;
}): RadarTaskDueDateDecision | null {
  const now = new Date(input.now.getTime());
  if (input.requestedDueAt) return userDueDate(input.requestedDueAt, now);
  if (input.operation === 'link_existing_task') return null;

  const effectiveAt = validDate(input.effectiveAt);
  const expiresAt = validDate(input.expiresAt);
  const effectiveLeadMs = input.priority === 'high' ? DAY_MS : 0;

  if (
    effectiveAt
    && effectiveAt.getTime() > now.getTime() + MIN_USER_LEAD_MS
    && effectiveAt.getTime() - now.getTime() <= MAX_DERIVED_EFFECTIVE_HORIZON_MS
  ) {
    const proposed = new Date(effectiveAt.getTime() - effectiveLeadMs);
    return {
      dueAt: proposed.getTime() > now.getTime() + MIN_USER_LEAD_MS
        ? proposed
        : effectiveAt,
      source: 'event_effective',
    };
  }

  if (
    expiresAt
    && expiresAt.getTime() > now.getTime() + MIN_USER_LEAD_MS
    && expiresAt.getTime() - now.getTime() <= MAX_DERIVED_EXPIRATION_HORIZON_MS
  ) {
    const responseWindowMs = input.priority === 'high'
      ? 60 * 60 * 1000
      : input.priority === 'medium'
        ? 12 * 60 * 60 * 1000
        : DAY_MS;
    const responseDueAt = new Date(now.getTime() + responseWindowMs);
    if (responseDueAt.getTime() >= expiresAt.getTime()) {
      return { dueAt: expiresAt, source: 'event_expiration' };
    }
    return { dueAt: responseDueAt, source: 'active_window' };
  }

  if (input.operation === 'create_reminder') {
    throw new RadarTaskDueDateError(
      'RADAR_REMINDER_DUE_DATE_REQUIRED',
      'Choose a reminder date because the event does not provide a safe due date.',
    );
  }
  return null;
}
