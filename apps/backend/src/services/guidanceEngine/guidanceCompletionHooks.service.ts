/**
 * FRD-FR-11/FR-12: Journey completion side-effect hooks.
 *
 * Lives in its own file to avoid circular imports between
 * guidanceJourney.service.ts ↔ guidanceStepResolver.service.ts.
 *
 * Called by guidanceStepResolver.service.ts when recomputeJourneyState()
 * determines that a journey has transitioned to COMPLETED for the first time.
 *
 * Side effects (only for isUserInitiated journeys):
 *   FR-12 — Sets InventoryItem.condition based on repair/replace verdict:
 *           REPLACE_NOW | REPLACE_SOON → condition = NEW, installedOn = now
 *           REPAIR_AND_MONITOR | REPAIR_ONLY | (no verdict) → condition = GOOD
 *   FR-11 — Creates a HomeEvent of type VERIFIED_RESOLUTION linked to the journey
 *
 * The Inventory write-back and VERIFIED_RESOLUTION badge only fire when a
 * required step has non-self-reported evidence (GuidanceStepEvidence with
 * sourceType other than USER_INPUT, or status VERIFIED). A journey whose
 * required steps were only manually checked off by the homeowner still
 * completes normally, but produces a MILESTONE HomeEvent with sourceBadge
 * USER_REPORTED instead — completing a step is not the same as certifying
 * the physical outcome. See Home Operations Slice 0.
 *
 * Note: lastServicedOn is already updated by booking.service.ts when a booking
 * transitions to COMPLETED (Phase 5.1). Do not overwrite it here.
 */

import { prisma } from '../../lib/prisma';
import { invalidateStatusForInventoryItem } from '../homeStatusBoard.service';
import { findAllWorkItemsLinkedToExecution, recordWorkEvent } from '../../modules/homeOperations/infrastructure/workItemRepository';
import { transitionWorkItem } from '../../modules/homeOperations/application/transitionWorkItem.usecase';
import { recordOperationalWorkOutcome } from '../decisionPlatform/outcomeObservationService';
import { resolveHomeActionDecisionLineage } from '../decisionPlatform/homeActionDecisionLineage';

const REPLACEMENT_VERDICTS = new Set(['REPLACE_NOW', 'REPLACE_SOON']);

function isNonSelfReportedEvidence(evidence: { sourceType: string; status: string }): boolean {
  return evidence.sourceType !== 'USER_INPUT' || evidence.status === 'VERIFIED';
}

export async function hasVerifiedGuidanceOutcomeEvidence(journeyId: string): Promise<boolean> {
  const outcomeSteps = await (prisma as any).guidanceJourneyStep.findMany({
    where: { journeyId, isRequired: true, stepType: { in: ['EXECUTION', 'VALIDATION'] } },
    select: { evidences: { select: { sourceType: true, status: true } } },
  });
  return outcomeSteps.length > 0 && outcomeSteps.every(
    (step: { evidences: Array<{ sourceType: string; status: string }> }) =>
      step.evidences.some(isNonSelfReportedEvidence),
  );
}

export async function syncGuidanceWorkItemsOnCompletion(journeyId: string, actorUserId?: string | null): Promise<void> {
  const [links, outcomeVerified] = await Promise.all([
    findAllWorkItemsLinkedToExecution('GUIDANCE', journeyId),
    hasVerifiedGuidanceOutcomeEvidence(journeyId),
  ]);
  for (const { workItem } of links) {
    if (workItem.state === 'VERIFIED' || workItem.state === 'CLOSED') continue;
    let current = workItem;
    if (current.state === 'CANDIDATE' || current.state === 'FOLLOW_UP_DUE') {
      current = await transitionWorkItem({
        workItemId: current.id,
        to: 'ACCEPTED',
        actorType: actorUserId ? 'USER' : 'SYSTEM',
        actorUserId,
        idempotencyKey: `guidance-completion-accepted:${current.id}:${journeyId}`,
      });
    }
    if (current.state === 'BLOCKED' || current.state === 'DEFERRED') {
      current = await transitionWorkItem({
        workItemId: current.id,
        to: 'IN_PROGRESS',
        actorType: actorUserId ? 'USER' : 'SYSTEM',
        actorUserId,
        idempotencyKey: `guidance-completion-progress:${current.id}:${journeyId}`,
      });
    }
    if (current.state !== 'REPORTED_COMPLETE') {
      current = await transitionWorkItem({
        workItemId: current.id,
        to: 'REPORTED_COMPLETE',
        actorType: actorUserId ? 'USER' : 'SYSTEM',
        actorUserId,
        idempotencyKey: `guidance-reported-complete:${current.id}:${journeyId}`,
      });
    }
    if (outcomeVerified && current.state === 'REPORTED_COMPLETE') {
      const existingEvidence = await prisma.operationalWorkEvidence.findFirst({
        where: { workItemId: current.id, evidenceType: 'DOMAIN_COMPLETION_RECORD', evidenceEntityId: journeyId },
        select: { id: true },
      });
      if (!existingEvidence) {
        await prisma.operationalWorkEvidence.create({
          data: {
            workItemId: current.id,
            evidenceType: 'DOMAIN_COMPLETION_RECORD',
            evidenceEntityId: journeyId,
            verificationStatus: 'VERIFIED',
            observedAt: new Date(),
          },
        });
        await recordWorkEvent({
          workItemId: current.id,
          eventType: 'OUTCOME_EVIDENCE_ADDED',
          actorType: 'SYSTEM',
          idempotencyKey: `guidance-outcome-evidence:${current.id}:${journeyId}`,
          payload: { journeyId, verificationStatus: 'VERIFIED' },
        });
      }
      await transitionWorkItem({
        workItemId: current.id,
        to: 'VERIFIED',
        actorType: 'SYSTEM',
        idempotencyKey: `guidance-outcome-verified:${current.id}:${journeyId}`,
      });

      // Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-005/
      // 006) — the guidance-journey completion path's own OutcomeObservation,
      // mirroring the maintenance path (homeActionCompletion.service.ts).
      // Attribution is attempted only for a repair/replace journey on an
      // inventory item that resolves to a linked HVAC decision thread
      // (Phase 3A) -- most guidance journeys aren't material decisions at
      // all, so this stays best-effort rather than a hard requirement.
      const journeyForOutcome = await prisma.guidanceJourney.findUnique({
        where: { id: journeyId },
        select: { inventoryItemId: true },
      });
      let recommendationSnapshotId: string | null = null;
      if (journeyForOutcome?.inventoryItemId) {
        const lineage = await resolveHomeActionDecisionLineage(current.propertyId, {
          decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
          primaryEntityId: journeyForOutcome.inventoryItemId,
        }).catch(() => null);
        if (lineage?.status === 'LINKED') recommendationSnapshotId = lineage.thread.currentRecommendationSnapshotId;
      }
      await recordOperationalWorkOutcome({
        propertyId: current.propertyId,
        workItemId: current.id,
        userId: actorUserId ?? null,
        costCents: null,
        recommendationSnapshotId,
      });
    }
  }
}

export async function runJourneyCompletionHooks(journeyId: string): Promise<void> {
  const db = prisma as any;

  const journey = await db.guidanceJourney.findUnique({
    where: { id: journeyId },
    select: {
      id: true,
      propertyId: true,
      inventoryItemId: true,
      issueType: true,
      isUserInitiated: true,
      derivedSnapshotJson: true,
    },
  });

  // Only run for user-initiated journeys — system/signal journeys are not
  // "resolved" in the FRD sense and should not produce certified records.
  if (!journey?.isUserInitiated) return;

  const requiredSteps = await db.guidanceJourneyStep.findMany({
    where: { journeyId, isRequired: true },
    select: { stepType: true, evidences: { select: { sourceType: true, status: true } } },
  });
  const outcomeSteps = requiredSteps.filter((step: { stepType: string | null }) =>
    step.stepType === 'EXECUTION' || step.stepType === 'VALIDATION',
  );
  // Physical resolution is certified only when every required execution or
  // validation step carries authoritative evidence. Decision/awareness
  // evidence cannot certify work that happened elsewhere.
  const isEvidenceVerified = outcomeSteps.length > 0 && outcomeSteps.every(
    (step: { evidences: Array<{ sourceType: string; status: string }> }) =>
      step.evidences.some(isNonSelfReportedEvidence),
  );

  // FR-12: Determine whether the resolution was a replacement or a repair by
  // reading the replaceRepairVerdict stored in derivedSnapshotJson when the
  // repair_replace_decision step was completed.
  const derivedLatest =
    journey.derivedSnapshotJson &&
    typeof journey.derivedSnapshotJson === 'object' &&
    !Array.isArray(journey.derivedSnapshotJson)
      ? ((journey.derivedSnapshotJson as Record<string, unknown>).latest as Record<string, unknown> | undefined)
      : undefined;
  const replaceRepairVerdict =
    typeof derivedLatest?.replaceRepairVerdict === 'string'
      ? derivedLatest.replaceRepairVerdict
      : null;
  const isReplacement = replaceRepairVerdict !== null && REPLACEMENT_VERDICTS.has(replaceRepairVerdict);

  const now = new Date();

  await db.$transaction(async (tx: any) => {
    // Only certify the physical outcome when a required step carries
    // evidence beyond the homeowner's own say-so. Completing every step is a
    // decision-completeness signal, not proof the work happened — see the
    // module doc comment above.
    if (isEvidenceVerified && journey.inventoryItemId) {
      if (isReplacement) {
        // FR-12 (replacement path): Asset was replaced — reset age and mark as NEW.
        // installedOn is set to today so all age-based calculations (health score,
        // lifecycle signals, expected expiry) restart from the replacement date.
        await tx.inventoryItem.update({
          where: { id: journey.inventoryItemId },
          data: {
            condition: 'NEW',
            installedOn: now,
            // Clear any previously computed expiry — the AI oracle will
            // recalculate it on the next health score pass with the new age.
            expectedExpiryDate: null,
          },
        });
      } else {
        // FR-12 (repair path): Issue resolved — mark condition as GOOD.
        await tx.inventoryItem.update({
          where: { id: journey.inventoryItemId },
          data: { condition: 'GOOD' },
        });
      }
    }

    // FR-11: Create the resolution HomeEvent. guidanceJourneyId links the
    // event back to the journey for the history sidebar and for the 2-year
    // lookback check (getAssetResolutionContext). Only evidence-backed
    // resolutions get the certified VERIFIED_RESOLUTION type and VERIFIED
    // badge; self-reported-only journeys still record that the homeowner
    // says the work is done, honestly labeled as unverified.
    await tx.homeEvent.create({
      data: {
        propertyId: journey.propertyId,
        inventoryItemId: journey.inventoryItemId ?? undefined,
        guidanceJourneyId: journey.id,
        type: isEvidenceVerified ? 'VERIFIED_RESOLUTION' : 'MILESTONE',
        title: isReplacement
          ? `Asset replaced: ${journey.issueType ?? 'Replacement completed'}`
          : `Issue resolved: ${journey.issueType ?? 'Asset serviced'}`,
        summary: isEvidenceVerified
          ? (isReplacement
            ? 'Asset was replaced as part of a guided resolution. Age and condition have been reset.'
            : 'Guided resolution completed via the Guidance Engine. All required steps were verified.')
          : 'Guided resolution marked complete by the homeowner. No tool, integration, or professional evidence backed the required steps, so the physical outcome has not been verified.',
        occurredAt: now,
        sourceBadge: isEvidenceVerified ? 'VERIFIED' : 'USER_REPORTED',
        importance: isEvidenceVerified ? 'HIGH' : 'NORMAL',
        isRetrospective: false,
      },
    });
  });

  // Home Operations Slice 7: Status Board's own condition model is separate
  // from InventoryItem.condition and doesn't refresh on its own — nudge it
  // to recompute on the next read rather than staying stale for up to 24h.
  if (isEvidenceVerified && journey.inventoryItemId) {
    await invalidateStatusForInventoryItem(journey.propertyId, journey.inventoryItemId);
  }
}
