// Home Intelligence Functional Completeness FRD Phase 4 review finding 3 —
// an INCIDENT-kind HomeAction is workKeyEligible (WORK_ITEM_ELIGIBLE_SOURCE_
// KINDS) and can become an accepted OperationalWorkItem, but nothing in the
// incidents module ever reconciled it: no execution link, no completion
// adapter, no reciprocal sync when the Incident itself resolved. This
// module closes that gap the same way propertyRecord.adapter.ts's
// syncPropertyRecordWorkItem does for RECORD_REVIEW — no separate
// OperationalWorkExecution row is needed; the Incident record IS both the
// trigger and the resolution evidence for its own obligation.
//
// Best-effort, like every other domain-to-Home-Operations sync in this
// codebase: a reconciliation failure must never block the incident mutation
// that triggered it.
import type { OperationalWorkItem, OperationalWorkItemState } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { resolveIncidentWorkKey } from '../../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import { transitionWorkItem } from '../../modules/homeOperations/application/transitionWorkItem.usecase';
import { findWorkItemByWorkKey } from '../../modules/homeOperations/infrastructure/workItemRepository';
import { recordReconciliationFailure } from '../../modules/homeOperations/infrastructure/reconciliationRepository';
import { recordOperationalWorkOutcome } from '../decisionPlatform/outcomeObservationService';

// loadIncidentActions (homeActionSourcePromotion.service.ts) only proposes
// an INCIDENT HomeAction for these four statuses — every other status means
// the loader has already stopped surfacing it, so any linked work item is
// reconciling against a source that will never propose it again.
const GENUINE_RESOLUTION_STATUSES = new Set(['RESOLVED', 'MITIGATED']);
const NO_LONGER_RELEVANT_STATUSES = new Set(['SUPPRESSED', 'EXPIRED']);

async function walkToVerified(workItem: OperationalWorkItem, idempotencySuffix: string, payload: Record<string, unknown>): Promise<void> {
  let current = workItem;
  if (current.state === 'BLOCKED' || current.state === 'DEFERRED') {
    current = await transitionWorkItem({
      workItemId: current.id, to: 'IN_PROGRESS', actorType: 'SYSTEM',
      idempotencyKey: `incident-progress:${idempotencySuffix}`,
    });
  }
  if (current.state !== 'REPORTED_COMPLETE' && current.state !== 'VERIFIED') {
    current = await transitionWorkItem({
      workItemId: current.id, to: 'REPORTED_COMPLETE', actorType: 'SYSTEM',
      idempotencyKey: `incident-reported:${idempotencySuffix}`,
    });
  }
  if (current.state === 'REPORTED_COMPLETE') {
    current = await transitionWorkItem({
      workItemId: current.id, to: 'VERIFIED', actorType: 'SYSTEM',
      idempotencyKey: `incident-verified:${idempotencySuffix}`,
      payload,
    });
  }
  if (current.state === 'VERIFIED') {
    await recordOperationalWorkOutcome({
      propertyId: current.propertyId,
      workItemId: current.id,
      userId: null,
      costCents: null,
      recommendationSnapshotId: null,
    });
  }
}

/**
 * Re-reads the incident's current status and reconciles its linked
 * OperationalWorkItem, if any exists. Idempotent — safe to call after every
 * status-mutating write, mirroring homeRecordsExtraction.service.ts's
 * syncRecordWorkItem "re-read then re-sync" convention rather than trying to
 * special-case every one of the incidents module's several status-mutation
 * call sites individually.
 */
export async function syncIncidentWorkItem(incidentId: string, actorUserId: string | null = null): Promise<void> {
  let propertyId: string | null = null;
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, propertyId: true, status: true },
    });
    if (!incident) return;
    propertyId = incident.propertyId;

    const workKey = resolveIncidentWorkKey(incident.propertyId, incident.id);
    const workItem = await findWorkItemByWorkKey(incident.propertyId, workKey);
    if (!workItem || workItem.state === 'CLOSED') return;

    const actorType = actorUserId ? 'USER' : 'SYSTEM';
    const idempotencySuffix = `${incident.id}:${incident.status}`;

    if (GENUINE_RESOLUTION_STATUSES.has(incident.status)) {
      if (workItem.state === 'CANDIDATE') {
        await transitionWorkItem({
          workItemId: workItem.id, to: 'CLOSED', disposition: 'NOT_RELEVANT', actorType, actorUserId,
          idempotencyKey: `incident-resolved-cleared:${idempotencySuffix}`,
          payload: { incidentId: incident.id, incidentStatus: incident.status },
        });
        return;
      }
      await walkToVerified(workItem, idempotencySuffix, { incidentId: incident.id, incidentStatus: incident.status, evidenceSource: 'INCIDENT' });
      return;
    }

    if (NO_LONGER_RELEVANT_STATUSES.has(incident.status)) {
      if (workItem.state === 'CANDIDATE') {
        await transitionWorkItem({
          workItemId: workItem.id, to: 'CLOSED', disposition: 'NOT_RELEVANT', actorType, actorUserId,
          idempotencyKey: `incident-dismissed:${idempotencySuffix}`,
          payload: { incidentId: incident.id, incidentStatus: incident.status },
        });
      } else {
        await transitionWorkItem({
          workItemId: workItem.id, to: 'CLOSED', disposition: 'DISMISSED', actorType, actorUserId,
          idempotencyKey: `incident-dismissed:${idempotencySuffix}`,
          payload: { incidentId: incident.id, incidentStatus: incident.status },
        });
      }
      return;
    }

    // DETECTED/EVALUATED/ACTIVE/ACTIONED: still an open obligation per the
    // loader's own status filter — no reconciliation needed. A homeowner
    // reactivating a previously-CLOSED incident cannot resurrect this same
    // work item either way (CLOSED has no legal outbound transition —
    // domain.transitions.ts's LEGAL_TRANSITIONS.CLOSED is []); the next Home
    // Action read proposes a fresh candidate under the same workKey, and
    // resolveAndUpsertWorkItem's own CLOSED handling (sourceRemainsActive =
    // false) intentionally leaves that prior row alone rather than reviving
    // it in place.
  } catch (err) {
    if (propertyId) {
      await recordReconciliationFailure({
        propertyId,
        operation: 'INCIDENT_WORK_SYNC',
        sourceType: 'INCIDENT',
        sourceEntityId: incidentId,
        idempotencyKey: `incident-work-sync:${incidentId}:${Date.now()}`,
        payload: { incidentId },
        error: err,
      }).catch(() => null);
    }
    logger.warn({ err, incidentId }, 'Home Operations incident work item sync failed; incident mutation proceeds regardless');
  }
}
