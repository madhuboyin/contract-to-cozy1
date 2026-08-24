// Ask Intelligence FRD Phase 10A — P2 outcome observation (§19, §21.5,
// §25 "Phase 10A"). Links a supported completed decision to a
// provenance-bearing OutcomeObservation without ever changing production
// guidance -- no calibration reads these rows (that is the separate,
// unbuilt Phase 10B gate).
//
// Every read/write here is scoped by propertyId (defense in depth), mirroring
// decisionThreadService.ts -- role-floor authorization itself is enforced
// once, at dispatch, by askOrchestrator.service.ts's executeOperationCore
// (FRD §7.5: "every read and write shall recheck current property and
// profile authorization").

import { prisma } from '../../lib/prisma';
import type {
  OutcomeObservation,
  OutcomeObservationSourceType,
  RecommendationAttribution,
  RecommendationAttributionRelationshipType,
} from '@prisma/client';
import type { WorkItemDb } from '../../modules/homeOperations/infrastructure/workItemRepository';

export class OutcomeObservationNotFoundError extends Error {
  constructor(id: string) {
    super(`Outcome observation ${id} not found or not accessible.`);
    this.name = 'OutcomeObservationNotFoundError';
  }
}

// A single, code-based default attribution window (FRD §19.1
// attributionWindowDefinitionId) -- first-slice scope covers one window
// definition rather than a full registry, matching how other *DefinitionId
// fields elsewhere in the Decision Platform (e.g.
// recommendationDefinitionId: 'HVAC_REPAIR_REPLACE') are simple code
// constants, not DB rows.
export const DEFAULT_ATTRIBUTION_WINDOW_DEFINITION_ID = 'DEFAULT_90_DAY_WINDOW';

export type ReportedOutcomeActionState = 'STARTED' | 'COMPLETED';

interface RecordHomeownerReportedOutcomeInput {
  propertyId: string;
  userId: string;
  decisionThreadId: string;
  actionState: ReportedOutcomeActionState;
  costCents: number | null;
  occurredOn: string | null; // YYYY-MM-DD; defaults to now when omitted
  note: string | null;
}

function relationshipTypesFor(actionState: ReportedOutcomeActionState, hasCost: boolean): RecommendationAttributionRelationshipType[] {
  const types: RecommendationAttributionRelationshipType[] = [actionState === 'COMPLETED' ? 'ACTION_COMPLETED' : 'ACTION_STARTED'];
  if (hasCost) types.push('COST_OBSERVED');
  return types;
}

export async function attachAttributions(
  outcomeObservationId: string,
  recommendationSnapshotId: string | null,
  relationshipTypes: RecommendationAttributionRelationshipType[],
  db: WorkItemDb = prisma,
): Promise<void> {
  if (!recommendationSnapshotId || !relationshipTypes.length) return;
  await db.recommendationAttribution.createMany({
    data: relationshipTypes.map((relationshipType) => ({
      recommendationSnapshotId,
      outcomeObservationId,
      relationshipType,
      attributionWindowDefinitionId: DEFAULT_ATTRIBUTION_WINDOW_DEFINITION_ID,
      confidence: null,
      reviewStatus: 'PENDING' as const,
    })),
    skipDuplicates: true,
  });
}

// FRD §19.2's fourth allowed source: "an explicit homeowner report marked
// REPORTED, not VERIFIED." verificationStatus is hardcoded to 'REPORTED'
// below -- never derived from message content, tone, or any homeowner
// assertion -- so a conversation claim can never become verified
// automatically (Phase 10A exit criterion).
//
// If an earlier active (non-SUPERSEDED) homeowner-reported observation
// already exists for this thread, this call is a correction: the prior
// observation is marked SUPERSEDED and linked via supersedesId, mirroring
// DecisionPreferenceValue's supersession pattern.
export async function recordHomeownerReportedOutcome(
  input: RecordHomeownerReportedOutcomeInput,
): Promise<{ observation: OutcomeObservation; correctedPriorId: string | null }> {
  const thread = await prisma.decisionThread.findFirst({
    where: { id: input.decisionThreadId, propertyId: input.propertyId },
    select: { id: true, currentRecommendationSnapshotId: true },
  });
  if (!thread) throw new OutcomeObservationNotFoundError(input.decisionThreadId);

  const priorReport = await prisma.outcomeObservation.findFirst({
    where: {
      propertyId: input.propertyId,
      sourceType: 'HOMEOWNER_REPORTED',
      sourceEntityType: 'DecisionThread',
      sourceEntityId: input.decisionThreadId,
      verificationStatus: { in: ['REPORTED', 'REJECTED'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  const occurredAt = input.occurredOn ? new Date(`${input.occurredOn}T00:00:00.000Z`) : new Date();
  const hasCost = input.costCents != null;

  const observation = await prisma.$transaction(async (tx) => {
    if (priorReport && priorReport.verificationStatus !== 'SUPERSEDED') {
      await tx.outcomeObservation.update({ where: { id: priorReport.id }, data: { verificationStatus: 'SUPERSEDED' } });
    }
    return tx.outcomeObservation.create({
      data: {
        propertyId: input.propertyId,
        sourceType: 'HOMEOWNER_REPORTED',
        sourceEntityType: 'DecisionThread',
        sourceEntityId: input.decisionThreadId,
        observedType: input.actionState === 'COMPLETED' ? 'ACTION_COMPLETED' : 'ACTION_STARTED',
        observedPayloadVersion: '1.0',
        observedPayload: {
          actionState: input.actionState,
          costCents: input.costCents,
          currency: hasCost ? 'USD' : null,
          note: input.note,
        },
        occurredAt,
        recordedByUserId: input.userId,
        verificationStatus: 'REPORTED',
        provenanceRefs: [],
        supersedesId: priorReport ? priorReport.id : null,
      },
    });
  });

  await attachAttributions(observation.id, thread.currentRecommendationSnapshotId, relationshipTypesFor(input.actionState, hasCost));

  return { observation, correctedPriorId: priorReport?.id ?? null };
}

// FRD §19.2's first allowed source: "a completed canonical project or
// maintenance record." Purely a read-then-create adapter over the existing
// PropertyMaintenanceTask table -- never a new canonical fact store. Idempotent
// on (propertyId, sourceEntityType, sourceEntityId): calling this twice for
// the same completed task is a no-op the second time. Returns null when there
// is nothing new to corroborate (no matching completed task, or already
// recorded), so callers (the OUTCOME_SUMMARY read path) can call it
// opportunistically without needing to track whether it already ran.
export async function recordCompletedMaintenanceOutcome(
  propertyId: string,
  decisionThreadId: string,
): Promise<OutcomeObservation | null> {
  const thread = await prisma.decisionThread.findFirst({
    where: { id: decisionThreadId, propertyId },
    select: { id: true, currentRecommendationSnapshotId: true, primaryEntityType: true, primaryEntityId: true, createdAt: true },
  });
  if (!thread || thread.primaryEntityType !== 'InventoryItem' || !thread.primaryEntityId) return null;

  const task = await prisma.propertyMaintenanceTask.findFirst({
    where: {
      propertyId,
      inventoryItemId: thread.primaryEntityId,
      status: 'COMPLETED',
      lastCompletedDate: { gte: thread.createdAt },
    },
    orderBy: { lastCompletedDate: 'desc' },
    select: { id: true, lastCompletedDate: true, actualCost: true, updatedAt: true },
  });
  if (!task) return null;

  const existing = await prisma.outcomeObservation.findFirst({
    where: { propertyId, sourceType: 'COMPLETED_MAINTENANCE_RECORD', sourceEntityType: 'PropertyMaintenanceTask', sourceEntityId: task.id },
  });
  if (existing) return null;

  const costCents = task.actualCost != null ? Math.round(Number(task.actualCost) * 100) : null;

  const observation = await prisma.outcomeObservation.create({
    data: {
      propertyId,
      sourceType: 'COMPLETED_MAINTENANCE_RECORD',
      sourceEntityType: 'PropertyMaintenanceTask',
      sourceEntityId: task.id,
      observedType: 'ACTION_COMPLETED',
      observedPayloadVersion: '1.0',
      observedPayload: { costCents, currency: costCents != null ? 'USD' : null },
      occurredAt: task.lastCompletedDate ?? task.updatedAt,
      recordedByUserId: null,
      verificationStatus: 'CORROBORATED',
      provenanceRefs: [`PropertyMaintenanceTask:${task.id}`],
    },
  });

  await attachAttributions(observation.id, thread.currentRecommendationSnapshotId, relationshipTypesFor('COMPLETED', costCents != null));
  return observation;
}

// Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-005/006) —
// the first OutcomeObservation creation path for the OPERATIONAL_WORK_ITEM
// source type (previously declared in the schema but never created
// anywhere — see the Phase 0 registry report's "0 of 23" finding).
// Idempotent on (propertyId, sourceEntityId): a retried completion request
// returns the existing observation rather than creating a duplicate.
// Attribution is created only when the caller supplies a decision lineage
// snapshot (HI-DEC-002/HI-OUT-006) — most completed work has no material
// decision behind it at all.
interface RecordOperationalWorkOutcomeInput {
  propertyId: string;
  workItemId: string;
  // null for a system-triggered completion (e.g. guidance journey
  // completion hooks, which may run off a resolver step with no acting
  // user), matching recordCompletedMaintenanceOutcome's own precedent.
  userId: string | null;
  costCents: number | null;
  recommendationSnapshotId: string | null;
}

// db defaults to the global client but accepts a caller's own transaction
// (e.g. bookingWorkReconciliation.service.ts's reconcileBookingLifecycle,
// which must record the outcome atomically with the booking completion
// write it runs inside) — same convention as transitionWorkItem's own db
// parameter.
export async function recordOperationalWorkOutcome(
  input: RecordOperationalWorkOutcomeInput,
  db: WorkItemDb = prisma,
): Promise<OutcomeObservation> {
  const existing = await db.outcomeObservation.findFirst({
    where: {
      propertyId: input.propertyId,
      sourceType: 'OPERATIONAL_WORK_ITEM',
      sourceEntityType: 'OperationalWorkItem',
      sourceEntityId: input.workItemId,
    },
  });
  if (existing) return existing;

  const hasCost = input.costCents != null;
  const observation = await db.outcomeObservation.create({
    data: {
      propertyId: input.propertyId,
      sourceType: 'OPERATIONAL_WORK_ITEM',
      sourceEntityType: 'OperationalWorkItem',
      sourceEntityId: input.workItemId,
      observedType: 'ACTION_COMPLETED',
      observedPayloadVersion: '1.0',
      observedPayload: { costCents: input.costCents, currency: hasCost ? 'USD' : null },
      occurredAt: new Date(),
      recordedByUserId: input.userId,
      // A domain-owned execution record (Operational Work Item, reconciled
      // through its authoritative execution adapter) corroborates this
      // outcome -- the same standing recordCompletedMaintenanceOutcome
      // above already gives a directly-observed maintenance completion.
      verificationStatus: 'CORROBORATED',
      provenanceRefs: [`OperationalWorkItem:${input.workItemId}`],
    },
  });

  await attachAttributions(observation.id, input.recommendationSnapshotId, relationshipTypesFor('COMPLETED', hasCost), db);
  return observation;
}

// Home Intelligence Functional Completeness FRD Phase 4 gap fix (HI-OUT-003/
// 005) — claims previously had no touchpoint with Operational Work Items or
// Outcome Observations at all: no Home Action ever recommends filing a
// claim, so claimWorkReconciliation.service.ts's standalone work item is the
// first (and only) obligation representation for a claim. Idempotent on
// (propertyId, sourceEntityId): a retried resolution returns the existing
// observation.
interface RecordClaimOutcomeInput {
  propertyId: string;
  claimId: string;
  userId: string | null;
  decision: 'APPROVED' | 'DENIED';
  costCents: number | null;
  recommendationSnapshotId: string | null;
}

export async function recordClaimOutcome(
  input: RecordClaimOutcomeInput,
  db: WorkItemDb = prisma,
): Promise<OutcomeObservation> {
  const existing = await db.outcomeObservation.findFirst({
    where: {
      propertyId: input.propertyId,
      sourceType: 'CLAIM_RECORD',
      sourceEntityType: 'Claim',
      sourceEntityId: input.claimId,
    },
  });
  if (existing) return existing;

  const hasCost = input.costCents != null;
  const observation = await db.outcomeObservation.create({
    data: {
      propertyId: input.propertyId,
      sourceType: 'CLAIM_RECORD',
      sourceEntityType: 'Claim',
      sourceEntityId: input.claimId,
      observedType: input.decision === 'APPROVED' ? 'CLAIM_APPROVED' : 'CLAIM_DENIED',
      observedPayloadVersion: '1.0',
      observedPayload: { decision: input.decision, costCents: input.costCents, currency: hasCost ? 'USD' : null },
      occurredAt: new Date(),
      recordedByUserId: input.userId,
      // The claim's own status transition is the domain-owned resolution
      // (same corroboration reasoning as recordOperationalWorkOutcome).
      verificationStatus: 'CORROBORATED',
      provenanceRefs: [`Claim:${input.claimId}`],
    },
  });

  await attachAttributions(observation.id, input.recommendationSnapshotId, relationshipTypesFor('COMPLETED', hasCost), db);
  return observation;
}

// Home Intelligence Functional Completeness FRD Phase 4 gap fix (HI-OUT-005)
// — the first creation path for the DOCUMENT_PROMOTION source type.
// Deliberately called only from promoteWarranty/promoteExpense (both create
// a HomeEvent with verificationStatus EVIDENCE_VERIFIED in the same
// transaction), never from promoteInsurancePolicy — that promotion stages an
// UNVERIFIED/PENDING policy term the homeowner has not yet confirmed, and
// recording a verified outcome for it would repeat the "invented certainty"
// failure mode homeRecordsExtraction.service.ts's own comment on that path
// warns against. No attribution: a document promotion is not the result of
// a Home Action recommendation.
interface RecordDocumentPromotionOutcomeInput {
  propertyId: string;
  promotedEntityType: string;
  promotedEntityId: string;
  userId: string;
}

export async function recordDocumentPromotionOutcome(
  input: RecordDocumentPromotionOutcomeInput,
  db: WorkItemDb = prisma,
): Promise<OutcomeObservation> {
  const existing = await db.outcomeObservation.findFirst({
    where: {
      propertyId: input.propertyId,
      sourceType: 'DOCUMENT_PROMOTION',
      sourceEntityType: input.promotedEntityType,
      sourceEntityId: input.promotedEntityId,
    },
  });
  if (existing) return existing;

  return db.outcomeObservation.create({
    data: {
      propertyId: input.propertyId,
      sourceType: 'DOCUMENT_PROMOTION',
      sourceEntityType: input.promotedEntityType,
      sourceEntityId: input.promotedEntityId,
      observedType: 'DOCUMENT_PROMOTED',
      observedPayloadVersion: '1.0',
      observedPayload: { promotedEntityType: input.promotedEntityType },
      occurredAt: new Date(),
      recordedByUserId: input.userId,
      verificationStatus: 'CORROBORATED',
      provenanceRefs: [`${input.promotedEntityType}:${input.promotedEntityId}`],
    },
  });
}

// Home Intelligence Functional Completeness FRD Phase 4 gap fix (HI-OUT-005/
// 006) — the first creation path for the COVERAGE_DECISION source type.
// SELECTED_OPTION is the only relationship type that fits a homeowner
// choosing among coverage alternatives (not a start/completion/cost of
// executed work), so it is the sole attribution attached here.
interface RecordCoverageDecisionOutcomeInput {
  propertyId: string;
  coverageDecisionId: string;
  userId: string;
  decision: string;
  selectedOptionId: string | null;
  recommendationSnapshotId: string | null;
}

export async function recordCoverageDecisionOutcome(
  input: RecordCoverageDecisionOutcomeInput,
  db: WorkItemDb = prisma,
): Promise<OutcomeObservation> {
  const existing = await db.outcomeObservation.findFirst({
    where: {
      propertyId: input.propertyId,
      sourceType: 'COVERAGE_DECISION',
      sourceEntityType: 'CoverageDecision',
      sourceEntityId: input.coverageDecisionId,
    },
  });
  if (existing) return existing;

  const observation = await db.outcomeObservation.create({
    data: {
      propertyId: input.propertyId,
      sourceType: 'COVERAGE_DECISION',
      sourceEntityType: 'CoverageDecision',
      sourceEntityId: input.coverageDecisionId,
      observedType: 'COVERAGE_DECISION_RECORDED',
      observedPayloadVersion: '1.0',
      observedPayload: { decision: input.decision, selectedOptionId: input.selectedOptionId },
      occurredAt: new Date(),
      recordedByUserId: input.userId,
      verificationStatus: 'CORROBORATED',
      provenanceRefs: [`CoverageDecision:${input.coverageDecisionId}`],
    },
  });

  if (input.recommendationSnapshotId) {
    await attachAttributions(observation.id, input.recommendationSnapshotId, ['SELECTED_OPTION'], db);
  }
  return observation;
}

export interface OutcomeSummaryAttribution {
  observation: OutcomeObservation;
  attribution: RecommendationAttribution;
}

// FRD §21.5 OUTCOME_SUMMARY read model. Returns every attribution recorded
// against any snapshot this thread has ever produced (not just the current
// one), including disputed/rejected/superseded observations -- the block
// itself is required to surface those states, not hide them.
export async function getOutcomeSummaryForThread(decisionThreadId: string, propertyId: string): Promise<OutcomeSummaryAttribution[]> {
  const thread = await prisma.decisionThread.findFirst({ where: { id: decisionThreadId, propertyId }, select: { id: true } });
  if (!thread) throw new OutcomeObservationNotFoundError(decisionThreadId);

  // Opportunistic corroboration: a homeowner viewing the outcome is a
  // natural moment to pick up a completed maintenance record that arrived
  // since the last view, without needing a separate background job for the
  // first slice.
  await recordCompletedMaintenanceOutcome(propertyId, decisionThreadId).catch(() => null);

  const snapshotIds = (await prisma.recommendationSnapshot.findMany({ where: { decisionThreadId }, select: { id: true } })).map((s) => s.id);
  if (!snapshotIds.length) return [];

  const attributions = await prisma.recommendationAttribution.findMany({
    where: { recommendationSnapshotId: { in: snapshotIds } },
    include: { outcomeObservation: true },
    orderBy: { createdAt: 'desc' },
  });

  return attributions.map((attribution) => ({ attribution, observation: attribution.outcomeObservation }));
}

// FRD §21.5 "unlink" control. Marks the observation REJECTED (a dispute, not
// a replacement -- SUPERSEDED is reserved for recordHomeownerReportedOutcome's
// correction-by-resubmission path) and every attribution referencing it
// DISPUTED. The observation row itself is retained, never hard-deleted, so
// its provenance and prior existence remain auditable.
export async function disputeOutcomeObservation(observationId: string, propertyId: string): Promise<OutcomeObservation> {
  const observation = await prisma.outcomeObservation.findFirst({ where: { id: observationId, propertyId } });
  if (!observation) throw new OutcomeObservationNotFoundError(observationId);

  return prisma.$transaction(async (tx) => {
    await tx.recommendationAttribution.updateMany({ where: { outcomeObservationId: observationId }, data: { reviewStatus: 'DISPUTED' } });
    return tx.outcomeObservation.update({ where: { id: observationId }, data: { verificationStatus: 'REJECTED' } });
  });
}

// HI-OUT-005 (see the Phase 0/2 registry report) expanded
// OutcomeObservationSourceType to 10 values. HOMEOWNER_REPORTED,
// COMPLETED_MAINTENANCE_RECORD, OPERATIONAL_WORK_ITEM, CLAIM_RECORD,
// DOCUMENT_PROMOTION, and COVERAGE_DECISION now have real creation paths
// (see recordHomeownerReportedOutcome, recordCompletedMaintenanceOutcome,
// recordOperationalWorkOutcome, recordClaimOutcome,
// recordDocumentPromotionOutcome, recordCoverageDecisionOutcome).
// PROJECT_RECORD, BOOKING_RECORD, and INSPECTION_FINDING are deliberately
// unused: guidance/project/booking/inspection completions all converge on
// OPERATIONAL_WORK_ITEM instead (see recordOperationalWorkOutcome's own
// callers) so every Operational Work Item completion produces one
// consistently-shaped outcome rather than a domain-specific variant.
// HOME_EVENT has no creation path yet. Every case is still listed
// explicitly, not a default fallback, so adding a real creation path later
// trips this switch's exhaustiveness check again rather than silently
// reusing a generic label.
export function sourceTypeLabel(sourceType: OutcomeObservationSourceType): string {
  switch (sourceType) {
    case 'HOMEOWNER_REPORTED': return 'You reported this';
    case 'COMPLETED_MAINTENANCE_RECORD': return 'From a completed maintenance record';
    case 'OPERATIONAL_WORK_ITEM': return 'From completed work';
    case 'PROJECT_RECORD': return 'From a completed project';
    case 'BOOKING_RECORD': return 'From a completed booking';
    case 'CLAIM_RECORD': return 'From an insurance claim';
    case 'INSPECTION_FINDING': return 'From an inspection finding';
    case 'DOCUMENT_PROMOTION': return 'From an uploaded document';
    case 'COVERAGE_DECISION': return 'From a coverage decision';
    case 'HOME_EVENT': return 'From a recorded home event';
  }
}
