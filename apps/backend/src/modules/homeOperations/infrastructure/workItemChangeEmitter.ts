import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { emitPropertyChange } from '../../../propertyChanges/propertyChange.service';
import { resolveReminderPolicy } from '../domain/reminderPolicy';
import type {
  OperationalWorkEventType,
  OperationalWorkItemPriority,
  RecommendationSafetyTier,
} from '@prisma/client';

/**
 * Item #20 (Slice 8 punch list: "digest limited to changed or due work").
 * Bridges Home Operations lifecycle events into the existing PropertyChange
 * / Home Briefing pipeline rather than building a third notification
 * pipeline — PropertyChange.canonicalActionId already has a real FK to
 * OperationalWorkItem, and homeBriefing.service.ts's topicForChange()
 * already maps any sourceType containing WORK/ACTION to topic HOME_ACTION,
 * so no changes are needed there.
 *
 * Both exports here are best-effort: a failure must never fail the
 * caller's actual work-item mutation, matching the resilience norm already
 * documented in PropertyMaintenanceTask.service.ts for its own Home
 * Operations sync ("a sync failure must never block the actual mutation").
 */

interface MaterialEventMapping {
  changeType: 'SOURCE_RECORD_CREATED' | 'ACTION_STATE_CHANGED' | 'OUTCOME_CONFIRMED';
  lifecycleAdvanced: boolean;
  propertyEffectConfirmed: boolean;
}

/**
 * Deliberately excludes: WORK_SNOOZED/WORK_RESCHEDULED/WORK_DEFERRED
 * (household-member-initiated — the actor already knows; broadcasting to
 * *other* household members is a real future need, not this slice),
 * WATCHER_ADDED/WATCHER_REMOVED, SOURCE_LINKED/SOURCE_RECONCILED,
 * OUTCOME_EVIDENCE_ADDED, and WORK_ASSIGNED (internal coordination
 * bookkeeping, not "changed or due" digest material).
 */
const MATERIAL_EVENTS: Partial<Record<OperationalWorkEventType, MaterialEventMapping>> = {
  WORK_CANDIDATE_DETECTED: { changeType: 'SOURCE_RECORD_CREATED', lifecycleAdvanced: false, propertyEffectConfirmed: false },
  WORK_ACCEPTED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  WORK_SCHEDULED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  EXECUTION_STARTED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  EXECUTION_BLOCKED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  WORK_REPORTED_COMPLETE: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  WORK_REOPENED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  FOLLOW_UP_CREATED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  WORK_DISPOSITION_RECORDED: { changeType: 'ACTION_STATE_CHANGED', lifecycleAdvanced: true, propertyEffectConfirmed: false },
  OUTCOME_VERIFIED: { changeType: 'OUTCOME_CONFIRMED', lifecycleAdvanced: true, propertyEffectConfirmed: true },
};

export interface WorkItemLifecycleChangeInput {
  id: string;
  propertyId: string;
  priority: OperationalWorkItemPriority;
  safetyTier: RecommendationSafetyTier;
}

export interface WorkItemLifecycleEventInput {
  id: string;
  eventType: OperationalWorkEventType;
  occurredAt: Date;
}

/**
 * sourceEntityId is the work item's own id (not the event's) so that
 * emitPropertyChange's built-in supersession keeps only the item's *latest*
 * lifecycle change briefing-eligible — one digest entry per work item, not
 * one per event, even as it moves through several transitions in a day.
 */
export async function emitWorkItemLifecycleChange(
  workItem: WorkItemLifecycleChangeInput,
  event: WorkItemLifecycleEventInput,
): Promise<void> {
  const mapping = MATERIAL_EVENTS[event.eventType];
  if (!mapping) return;

  try {
    await emitPropertyChange({
      propertyId: workItem.propertyId,
      sourceType: 'OPERATIONAL_WORK_EVENT',
      sourceEntityId: workItem.id,
      sourceRevision: event.id,
      sourceRevisionOrdinal: event.occurredAt.getTime(),
      changeType: mapping.changeType,
      occurredAt: event.occurredAt,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: mapping.lifecycleAdvanced,
        propertyEffectConfirmed: mapping.propertyEffectConfirmed,
        urgentSafetyCondition: workItem.safetyTier === 'SAFETY_EMERGENCY',
        canonicalActionPriority: workItem.priority,
      },
      canonicalActionId: workItem.id,
    });
  } catch (err) {
    logger.error(
      { err, workItemId: workItem.id, eventType: event.eventType },
      '[workItemChangeEmitter] failed to emit lifecycle PropertyChange',
    );
  }
}

// resolveReminderPolicy's widest horizonDays value today (see
// domain/reminderPolicy.ts) — a conservative SQL bound so the query doesn't
// scan every open work item regardless of due date; exact per-row horizon
// filtering (which depends on obligationType/safetyTier, not a plain column
// comparison) happens in memory below.
const MAX_HORIZON_DAYS = 7;

export interface DueSoonWorkItemChangeResult {
  examined: number;
  created: number;
  skipped: number;
  failed: number;
}

/**
 * The "due" half of "changed or due work". Relies entirely on
 * emitPropertyChange's own dedup on (propertyId, sourceType, sourceEntityId,
 * sourceRevision) for idempotency — re-running this daily against an
 * unchanged dueAt is a no-op after the first emission, so no separate
 * "already reminded" tracking field is needed. A reschedule (dueAt changes)
 * naturally produces a new revision and re-surfaces.
 */
export async function emitDueSoonWorkItemChanges(now: Date = new Date()): Promise<DueSoonWorkItemChangeResult> {
  const horizonBound = new Date(now.getTime() + MAX_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.operationalWorkItem.findMany({
    where: {
      state: { not: 'CLOSED' },
      dueAt: { not: null, lte: horizonBound },
    },
    select: { id: true, propertyId: true, priority: true, safetyTier: true, obligationType: true, dueAt: true },
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of candidates) {
    const policy = resolveReminderPolicy(item.obligationType, item.safetyTier);
    const horizon = new Date(now.getTime() + policy.horizonDays * 24 * 60 * 60 * 1000);
    if (!item.dueAt || item.dueAt > horizon) {
      skipped += 1;
      continue;
    }

    try {
      const result = await emitPropertyChange({
        propertyId: item.propertyId,
        sourceType: 'OPERATIONAL_WORK_DUE',
        sourceEntityId: item.id,
        sourceRevision: item.dueAt.toISOString(),
        sourceRevisionOrdinal: item.dueAt.getTime(),
        changeType: 'ACTION_STATE_CHANGED',
        occurredAt: item.dueAt,
        sourceHealth: 'CURRENT',
        signals: {
          homeownerRelevant: true,
          lifecycleAdvanced: false,
          propertyEffectConfirmed: false,
          urgentSafetyCondition: item.safetyTier === 'SAFETY_EMERGENCY',
          canonicalActionPriority: item.priority,
        },
        canonicalActionId: item.id,
      });
      if (result.deduped) skipped += 1;
      else created += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, workItemId: item.id }, '[workItemChangeEmitter] failed to emit due-soon PropertyChange');
    }
  }

  return { examined: candidates.length, created, skipped, failed };
}
