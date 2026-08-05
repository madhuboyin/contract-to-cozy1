import type { OperationalWorkItem, OperationalWorkItemPriority, RecommendationSafetyTier } from '@prisma/client';
import type { ProposedWorkItem, WorkItemSourceAdapter } from '../domain/sourceAdapter';
import { resolveWorkKey } from '../domain/workKey';
import { logger } from '../../../lib/logger';
import { findWorkItemByWorkKey } from '../infrastructure/workItemRepository';
import { resolveAndUpsertWorkItem } from '../application/resolveWorkItem.usecase';
import { transitionWorkItem } from '../application/transitionWorkItem.usecase';

/**
 * Home Continuity plan §8 (Slice 4): "promote missing/stale records
 * through canonical Home Actions" — closing the gap where a record with
 * pending extraction review, or an expired/expiring effective period, sat
 * invisible unless someone happened to open Home Records itself.
 *
 * A raw-record adapter (like maintenanceTask.adapter.ts/inspectionFinding
 * .adapter.ts), operating on the *enriched* shape homeRecordsService.list()/
 * get() already compute (needsReview/expiryStatus), not a raw PropertyRecord
 * row — recomputing that logic here would duplicate it and risk drifting
 * out of sync with what Home Records itself shows.
 */
export interface RecordReviewSourceRecord {
  id: string;
  title: string;
  recordType: string;
  sensitivity: string;
  needsReview: boolean;
  expiryStatus: 'EXPIRED' | 'EXPIRING_SOON' | 'CURRENT' | null;
  effectiveTo: Date | null;
}

const FINANCIALLY_SENSITIVE = new Set(['FINANCIAL', 'INSURANCE', 'CLAIM', 'LEGAL']);

function resolveSafetyTier(sensitivity: string): RecommendationSafetyTier {
  return FINANCIALLY_SENSITIVE.has(sensitivity) ? 'MATERIAL_FINANCIAL' : 'LOW_CONSEQUENCE';
}

function resolveObligationSlug(recordId: string): string {
  return `record-review-${recordId}`;
}

export function resolvePropertyRecordWorkKey(recordId: string, propertyId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: { type: 'PROPERTY', id: propertyId },
    obligationType: 'RECORD_REVIEW',
    occurrence: { obligationSlug: resolveObligationSlug(recordId) },
  });
}

export const propertyRecordSourceAdapter: WorkItemSourceAdapter<RecordReviewSourceRecord> = {
  sourceType: 'PROPERTY_RECORD',
  propose(record, propertyId): ProposedWorkItem | null {
    const isExpired = record.expiryStatus === 'EXPIRED';
    const isExpiringSoon = record.expiryStatus === 'EXPIRING_SOON';
    if (!record.needsReview && !isExpired && !isExpiringSoon) return null;

    const priority: OperationalWorkItemPriority = isExpired ? 'SOON' : 'PLAN';
    const reason = isExpired
      ? `${record.title} has expired and may need to be renewed or replaced.`
      : isExpiringSoon
        ? `${record.title} is expiring soon and may need to be renewed or replaced.`
        : `${record.title} has AI-extracted details that haven't been reviewed yet.`;

    return {
      propertyId,
      subject: { type: 'PROPERTY', id: propertyId },
      obligationType: 'RECORD_REVIEW',
      occurrence: { obligationSlug: resolveObligationSlug(record.id) },
      title: isExpired || isExpiringSoon ? `Review expiring record: ${record.title}` : `Review extracted details: ${record.title}`,
      homeownerReason: reason,
      expectedOutcome: 'The record is reviewed and its details or effective period are up to date.',
      priority,
      safetyTier: resolveSafetyTier(record.sensitivity),
      // A genuine due date only exists for the expiry case — no calendar
      // deadline concept for "extraction review is pending," matching
      // inspectionFinding.adapter.ts's own no-fabricated-date precedent.
      dueAt: (isExpired || isExpiringSoon) ? record.effectiveTo : null,
      confidence: null,
      missingContext: [],
      source: {
        sourceType: 'PROPERTY_RECORD',
        sourceEntityId: record.id,
        sourceVersion: `${record.needsReview}:${record.expiryStatus}`,
        sourceRole: 'TRIGGER',
      },
    };
  },
};

async function closeRecordReviewWorkItem(workItem: OperationalWorkItem): Promise<void> {
  if (workItem.state === 'CLOSED') return;
  const idempotencySuffix = `${workItem.id}:${Date.now()}`;
  try {
    if (workItem.state === 'CANDIDATE') {
      // Never accepted as committed work — the condition that raised it
      // cleared on its own, same "source condition gone, never became
      // real work" pattern PropertyMaintenanceTask.service.ts uses for a
      // cancelled task.
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'CLOSED',
        disposition: 'NOT_RELEVANT',
        actorType: 'SYSTEM',
        idempotencyKey: `record-review-cleared:${idempotencySuffix}`,
      });
      return;
    }
    // Was explicitly accepted as real work — walk it to genuine completion
    // (VERIFIED, no disposition) rather than a not-relevant close.
    let current = workItem;
    if (current.state === 'BLOCKED' || current.state === 'DEFERRED') {
      current = await transitionWorkItem({
        workItemId: current.id, to: 'IN_PROGRESS', actorType: 'SYSTEM',
        idempotencyKey: `record-review-progress:${idempotencySuffix}`,
      });
    }
    if (current.state !== 'REPORTED_COMPLETE' && current.state !== 'VERIFIED') {
      current = await transitionWorkItem({
        workItemId: current.id, to: 'REPORTED_COMPLETE', actorType: 'SYSTEM',
        idempotencyKey: `record-review-reported:${idempotencySuffix}`,
      });
    }
    if (current.state === 'REPORTED_COMPLETE') {
      await transitionWorkItem({
        workItemId: current.id, to: 'VERIFIED', actorType: 'SYSTEM',
        idempotencyKey: `record-review-verified:${idempotencySuffix}`,
      });
    }
  } catch (err) {
    logger.warn({ err, workItemId: workItem.id }, 'Home Operations record-review close failed');
  }
}

/**
 * Called best-effort from Home Records' own write paths (extraction run,
 * candidate review, effective-period change, trash) — the domain that owns
 * the source data keeps Home Operations in sync, same idiom
 * PropertyMaintenanceTask.service.ts/inspectionHub.service.ts already use.
 * Never throws: a Home Operations sync failure must not block the Home
 * Records write that triggered it.
 */
export async function syncPropertyRecordWorkItem(
  propertyId: string,
  record: RecordReviewSourceRecord,
): Promise<void> {
  try {
    const proposal = propertyRecordSourceAdapter.propose(record, propertyId);
    if (proposal) {
      await resolveAndUpsertWorkItem(proposal);
      return;
    }
    const workKey = resolvePropertyRecordWorkKey(record.id, propertyId);
    const existing = await findWorkItemByWorkKey(propertyId, workKey);
    if (existing) await closeRecordReviewWorkItem(existing);
  } catch (err) {
    logger.warn({ err, propertyId, recordId: record.id }, 'Home Operations record-review sync failed; Home Records write proceeds regardless');
  }
}
