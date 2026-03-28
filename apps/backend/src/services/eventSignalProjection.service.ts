import { Prisma } from '@prisma/client';
import { SignalDTO } from './signal.service';

export type UnifiedEventEnvelope = {
  eventType: string;
  propertyId: string;
  roomId: string | null;
  homeItemId: string | null;
  sourceModel: string;
  sourceId: string;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

export type TimelineProjectionEntry = {
  id: string;
  kind: 'EVENT' | 'SIGNAL';
  occurredAt: string;
  title: string;
  summary: string | null;
  eventType: string | null;
  signalKey: string | null;
  sourceModel: string;
  sourceId: string;
  roomId: string | null;
  homeItemId: string | null;
  payloadJson: Record<string, unknown> | null;
};

type UnifiedEventInput = {
  eventType: string;
  propertyId: string;
  sourceModel: string;
  sourceId: string;
  occurredAt: Date | string;
  roomId?: string | null;
  homeItemId?: string | null;
  payloadJson?: Record<string, unknown> | null;
};

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function signalTitle(signalKey: string): string {
  switch (signalKey) {
    case 'MAINT_ADHERENCE':
      return 'Maintenance adherence updated';
    case 'COVERAGE_GAP':
      return 'Coverage gap signal updated';
    case 'SAVINGS_REALIZATION':
      return 'Savings realization updated';
    case 'RISK_SPIKE':
      return 'Risk spike detected';
    case 'COST_ANOMALY':
      return 'Cost anomaly detected';
    default:
      return `${signalKey.replace(/_/g, ' ')} signal updated`;
  }
}

export function buildUnifiedEventEnvelope(input: UnifiedEventInput): UnifiedEventEnvelope {
  return {
    eventType: String(input.eventType || 'OTHER').trim().toUpperCase(),
    propertyId: input.propertyId,
    roomId: input.roomId ?? null,
    homeItemId: input.homeItemId ?? null,
    sourceModel: input.sourceModel,
    sourceId: input.sourceId,
    occurredAt: toDate(input.occurredAt),
    payloadJson: input.payloadJson ?? {},
  };
}

export function timelineEntryFromEvent(event: UnifiedEventEnvelope, title: string, summary?: string | null): TimelineProjectionEntry {
  return {
    id: `event:${event.sourceModel}:${event.sourceId}`,
    kind: 'EVENT',
    occurredAt: event.occurredAt.toISOString(),
    title,
    summary: summary ?? null,
    eventType: event.eventType,
    signalKey: null,
    sourceModel: event.sourceModel,
    sourceId: event.sourceId,
    roomId: event.roomId,
    homeItemId: event.homeItemId,
    payloadJson: event.payloadJson,
  };
}

export function timelineEntryFromSignal(signal: SignalDTO): TimelineProjectionEntry {
  const payload = toRecord(signal.valueJson);
  return {
    id: `signal:${signal.id}`,
    kind: 'SIGNAL',
    occurredAt: signal.capturedAt,
    title: signalTitle(signal.signalKey),
    summary: signal.valueText ?? null,
    eventType: null,
    signalKey: signal.signalKey,
    sourceModel: signal.sourceModel,
    sourceId: signal.sourceId,
    roomId: signal.roomId,
    homeItemId: signal.homeItemId,
    payloadJson: payload,
  };
}

export function mergeTimelineProjectionEntries(
  entries: TimelineProjectionEntry[],
  limit = 200,
): TimelineProjectionEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const byDate = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
  return sorted.slice(0, Math.max(1, limit));
}
