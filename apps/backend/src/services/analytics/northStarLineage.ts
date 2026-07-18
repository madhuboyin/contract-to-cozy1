import { z } from 'zod';
import {
  ACTION_RESOLUTION_DISPOSITIONS,
  IMPORTANT_ACTION_REASONS,
} from '../../productFramework/outcomeLineage.contract';
import { analyticsEmitter } from './emitter';
import { ProductAnalyticsService } from './service';
import type { TrackEventInput } from './schemas';
import { AnalyticsModule, NorthStarAnalyticsEvent } from './taxonomy';
import type { HomeAction } from '../../productFramework/homeAction.contract';
import { logger } from '../../lib/logger';

const EVENT_STAGES = {
  ENTRY_CONTEXT_CAPTURED: 1,
  ACTIVE_TRIGGER_IDENTIFIED: 2,
  HOME_ACTION_IDENTIFIED: 3,
  HOME_ACTION_SURFACED: 4,
  HOME_ACTION_RESOLUTION_RECORDED: 5,
  HOME_ACTION_OUTCOME_VERIFIED: 6,
} as const;

const EVENT_TYPES = Object.keys(EVENT_STAGES) as [keyof typeof EVENT_STAGES, ...(keyof typeof EVENT_STAGES)[]];

export const NorthStarLineageEventInputSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  propertyId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  occurredAt: z.coerce.date().optional(),
  source: z.string().trim().min(1).max(80),
  entryId: z.string().trim().min(1).max(160),
  triggerId: z.string().trim().min(1).max(160).nullable().optional(),
  signalId: z.string().trim().min(1).max(160).nullable().optional(),
  actionId: z.string().trim().min(1).max(160).nullable().optional(),
  recommendationVersion: z.string().trim().min(1).max(80).nullable().optional(),
  journeyId: z.string().trim().min(1).max(160).nullable().optional(),
  decisionId: z.string().trim().min(1).max(160).nullable().optional(),
  executionId: z.string().trim().min(1).max(160).nullable().optional(),
  verificationId: z.string().trim().min(1).max(160).nullable().optional(),
  outcomeId: z.string().trim().min(1).max(160).nullable().optional(),
  importantReasons: z.array(z.enum(IMPORTANT_ACTION_REASONS)).optional(),
  actionWindowClosesAt: z.string().datetime().nullable().optional(),
  resolutionDisposition: z.enum(ACTION_RESOLUTION_DISPOSITIONS).nullable().optional(),
  verificationStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'VERIFIED', 'FAILED']).nullable().optional(),
}).superRefine((value, ctx) => {
  const stage = EVENT_STAGES[value.eventType];
  const requireField = (field: keyof typeof value, atStage: number) => {
    if (stage >= atStage && value[field] == null) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${String(field)} is required at lineage stage ${stage}.`,
      });
    }
  };
  requireField('triggerId', 2);
  requireField('actionId', 3);
  requireField('recommendationVersion', 3);
  requireField('resolutionDisposition', 5);
  requireField('verificationId', 6);
  requireField('outcomeId', 6);
  requireField('verificationStatus', 6);
});

export type NorthStarLineageEventInput = z.input<typeof NorthStarLineageEventInputSchema>;

export function buildNorthStarAnalyticsEvent(input: NorthStarLineageEventInput): TrackEventInput {
  const parsed = NorthStarLineageEventInputSchema.parse(input);
  const { eventType, propertyId, userId, occurredAt, source, ...lineage } = parsed;
  return {
    eventType: NorthStarAnalyticsEvent[eventType],
    eventName: lineage.actionId ?? lineage.triggerId ?? lineage.entryId,
    propertyId,
    userId: userId ?? null,
    moduleKey: AnalyticsModule.DASHBOARD,
    featureKey: 'north_star_lineage',
    source,
    occurredAt,
    metadataJson: {
      metricVersion: 'phase0-v1',
      lineageStage: EVENT_STAGES[eventType],
      ...lineage,
    },
  };
}

export async function trackNorthStarLineageEvent(input: NorthStarLineageEventInput) {
  return ProductAnalyticsService.trackEvent(buildNorthStarAnalyticsEvent(input));
}

export function emitNorthStarLineageEvent(input: NorthStarLineageEventInput): void {
  try {
    analyticsEmitter.track(buildNorthStarAnalyticsEvent(input));
  } catch (error) {
    logger.warn({ error }, '[Analytics] Dropped invalid north-star lineage event');
  }
}

const SURFACE_DEDUP_WINDOW_MS = 60 * 60 * 1000;
const surfacedLineageCache = new Map<string, number>();

function isImportantHomeAction(action: HomeAction): boolean {
  return action.priority === 'NOW' ||
    action.governance.safetyTier !== 'LOW_CONSEQUENCE';
}

function importantReasonsForAction(action: HomeAction): Array<typeof IMPORTANT_ACTION_REASONS[number]> {
  if (action.governance.safetyTier === 'SAFETY_EMERGENCY') return ['SAFETY_OR_ACTIVE_DAMAGE'];
  if (action.governance.safetyTier === 'MATERIAL_FINANCIAL') return ['MATERIAL_FINANCIAL_CONSEQUENCE'];
  if (action.governance.safetyTier === 'REGULATED_COVERAGE') return ['MATERIAL_DEADLINE_OR_RIGHT'];
  return ['REVIEWED_DOMAIN_RULE'];
}

export function emitHomeActionsSurfaced(input: {
  propertyId: string;
  userId?: string | null;
  actions: HomeAction[];
  source: string;
  occurredAt?: Date;
}): void {
  try {
    emitHomeActionsSurfacedUnsafe(input);
  } catch (error) {
    logger.warn({ error }, '[Analytics] Dropped invalid surfaced-action lineage batch');
  }
}

function emitHomeActionsSurfacedUnsafe(input: {
  propertyId: string;
  userId?: string | null;
  actions: HomeAction[];
  source: string;
  occurredAt?: Date;
}): void {
  const now = input.occurredAt ?? new Date();
  const entryId = `legacy-entry:${input.propertyId}`;
  const events: TrackEventInput[] = [];
  const entryCacheKey = `entry:${input.propertyId}`;
  const entryLastEmittedAt = surfacedLineageCache.get(entryCacheKey);
  let entryQueued = entryLastEmittedAt != null &&
    now.getTime() - entryLastEmittedAt < SURFACE_DEDUP_WINDOW_MS;

  for (const action of input.actions.filter(isImportantHomeAction)) {
    const dedupKey = `${input.propertyId}:${action.id}:${action.source.version ?? 'unversioned'}`;
    const lastSurfacedAt = surfacedLineageCache.get(dedupKey);
    if (lastSurfacedAt && now.getTime() - lastSurfacedAt < SURFACE_DEDUP_WINDOW_MS) continue;
    surfacedLineageCache.set(dedupKey, now.getTime());

    const triggerId = `trigger:orchestration:${action.id}`;
    const common = {
      propertyId: input.propertyId,
      userId: input.userId ?? null,
      occurredAt: now,
      source: input.source,
      entryId,
    };
    if (!entryQueued) {
      events.push(buildNorthStarAnalyticsEvent({ ...common, eventType: 'ENTRY_CONTEXT_CAPTURED' }));
      surfacedLineageCache.set(entryCacheKey, now.getTime());
      entryQueued = true;
    }
    events.push(
      buildNorthStarAnalyticsEvent({ ...common, eventType: 'ACTIVE_TRIGGER_IDENTIFIED', triggerId }),
      buildNorthStarAnalyticsEvent({
        ...common,
        eventType: 'HOME_ACTION_IDENTIFIED',
        triggerId,
        actionId: action.id,
        signalId: action.lineageId,
        recommendationVersion: action.source.version ?? 'phase0-v1',
        journeyId: action.relatedJourneyId,
        importantReasons: importantReasonsForAction(action),
        actionWindowClosesAt: action.timing.windowEnd,
      }),
      buildNorthStarAnalyticsEvent({
        ...common,
        eventType: 'HOME_ACTION_SURFACED',
        triggerId,
        actionId: action.id,
        signalId: action.lineageId,
        recommendationVersion: action.source.version ?? 'phase0-v1',
        journeyId: action.relatedJourneyId,
        importantReasons: importantReasonsForAction(action),
        actionWindowClosesAt: action.timing.windowEnd,
      }),
    );
  }

  analyticsEmitter.trackBatch(events);
}
