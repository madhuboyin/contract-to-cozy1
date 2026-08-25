// Ask Intelligence FRD §19.4, Phase 10B. DB-touching orchestrator: builds
// CalibrationTrainingRow[] from Phase 10A's OutcomeObservation/
// RecommendationAttribution data plus Phase 10B's RecommendationSnapshot
// score/engineInputSnapshot columns, then delegates all actual calibration
// math to the pure evaluator (hvacCalibrationEvaluator.service.ts) --
// mirrors hvacRepairReplaceEngine.service.ts's own composer/evaluator split.
//
// Against today's real (empty) dataset this deterministically produces a
// CalibrationRelease row with status PROPOSED and a populated
// insufficiencyReasons array -- reachable, inspectable, honest, never a
// false READY_FOR_REVIEW.

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { HVAC_ENGINE_VERSION, HVAC_ESTIMATE_FAMILY_ID, DEFAULT_HVAC_ENGINE_WEIGHTS, type HvacDecisionContext } from './hvacRepairReplaceEngine.service';
import {
  evaluateHvacCalibrationCandidate,
  DEFAULT_HVAC_CALIBRATION_POLICY,
  type CalibrationTrainingRow,
  type CalibrationObservationVerificationStatus,
} from './hvacCalibrationEvaluator.service';
import { recordPersonalizationAuditEvent } from '../personalizationAudit.service';

async function buildHvacTrainingRows(): Promise<CalibrationTrainingRow[]> {
  const attributions = await prisma.recommendationAttribution.findMany({
    where: {
      recommendationSnapshot: {
        recommendationDefinitionId: HVAC_ESTIMATE_FAMILY_ID,
        engineVersion: HVAC_ENGINE_VERSION,
        score: { not: null },
      },
      outcomeObservation: {
        // FRD §19.2's only two first-slice sources -- REJECTED/SUPERSEDED/
        // VERIFIED are excluded by construction: raw conversation claims and
        // unverified free text are prohibited training inputs (§19.4).
        verificationStatus: { in: ['REPORTED', 'CORROBORATED'] },
      },
    },
    select: {
      outcomeObservationId: true,
      recommendationSnapshot: { select: { id: true, propertyId: true, engineInputSnapshot: true } },
      outcomeObservation: { select: { id: true, verificationStatus: true, observedPayload: true, occurredAt: true } },
    },
  });

  // One training row per distinct OutcomeObservation -- a single observation
  // can carry multiple RecommendationAttribution rows (e.g. ACTION_COMPLETED
  // + COST_OBSERVED, see outcomeObservationService.ts's
  // relationshipTypesFor), which must never be double-counted as separate
  // real-world outcomes. Rows whose snapshot predates Phase 10B (no
  // engineInputSnapshot captured) are skipped -- there is nothing to
  // recompute a candidate score against.
  const seen = new Set<string>();
  const rows: CalibrationTrainingRow[] = [];
  for (const attribution of attributions) {
    if (seen.has(attribution.outcomeObservationId)) continue;
    if (attribution.recommendationSnapshot.engineInputSnapshot == null) continue;
    seen.add(attribution.outcomeObservationId);

    const payload = attribution.outcomeObservation.observedPayload as { actionState?: string; costCents?: number | null } | null;
    const actionState = payload?.actionState === 'STARTED' || payload?.actionState === 'COMPLETED' ? payload.actionState : null;

    rows.push({
      propertyId: attribution.recommendationSnapshot.propertyId,
      recommendationSnapshotId: attribution.recommendationSnapshot.id,
      context: attribution.recommendationSnapshot.engineInputSnapshot as unknown as HvacDecisionContext,
      observation: {
        id: attribution.outcomeObservation.id,
        verificationStatus: attribution.outcomeObservation.verificationStatus as CalibrationObservationVerificationStatus,
        actionState,
        costCents: typeof payload?.costCents === 'number' ? payload.costCents : null,
        occurredAt: attribution.outcomeObservation.occurredAt.toISOString(),
      },
    });
  }
  return rows;
}

// Proves "exact production version reproducible" (§19.4 exit criterion): a
// plain incrementing datasetVersion int doesn't, on its own, prove the
// underlying observation set wasn't mutated between proposal and activation
// -- this fingerprint does.
export function datasetFingerprintFor(rows: CalibrationTrainingRow[], policyVersion: string): string {
  const canonicalRows = [...rows]
    .sort((a, b) => a.observation.id.localeCompare(b.observation.id))
    .map((row) => ({
      propertyId: row.propertyId,
      recommendationSnapshotId: row.recommendationSnapshotId,
      context: row.context,
      observation: row.observation,
    }));
  return createHash('sha256').update(JSON.stringify({ policyVersion, rows: canonicalRows })).digest('hex');
}

export async function proposeHvacCalibrationRelease(createdByUserId: string) {
  const rows = await buildHvacTrainingRows();
  const policy = DEFAULT_HVAC_CALIBRATION_POLICY;
  const outcome = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, policy);
  const verificationStatusCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const status = row.observation.verificationStatus;
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

  const priorMax = await prisma.calibrationRelease.aggregate({
    where: { estimateFamilyId: HVAC_ESTIMATE_FAMILY_ID },
    _max: { datasetVersion: true },
  });
  const datasetVersion = (priorMax._max.datasetVersion ?? 0) + 1;

  const release = await prisma.calibrationRelease.create({
    data: {
      estimateFamilyId: HVAC_ESTIMATE_FAMILY_ID,
      baselineEngineVersion: HVAC_ENGINE_VERSION,
      policyVersion: policy.policyVersion,
      datasetVersion,
      datasetFingerprint: datasetFingerprintFor(rows, policy.policyVersion),
      datasetGeneratedAt: new Date(),
      observationCount: outcome.observationCount,
      distinctPropertyCount: outcome.distinctPropertyCount,
      trainingObservationCount: outcome.trainingObservationCount,
      holdoutObservationCount: outcome.holdoutObservationCount,
      candidateWeights: outcome.candidateWeights as unknown as Prisma.InputJsonValue,
      trainingMetrics: outcome.trainingMetrics as unknown as Prisma.InputJsonValue,
      holdoutMetrics: outcome.holdoutMetrics as unknown as Prisma.InputJsonValue,
      segmentRegressionResults: outcome.segmentRegressionResults as unknown as Prisma.InputJsonValue,
      exclusionSummary: {
        ...outcome.exclusionSummary,
        verificationStatusCounts,
        reviewBoundary: 'Release activation requires Product, Domain, Privacy, and Trust approval; individual observations never activate weights directly.',
      } as unknown as Prisma.InputJsonValue,
      // Every non-READY_FOR_REVIEW evaluator status (INSUFFICIENT_DATA,
      // BELOW_IMPROVEMENT_THRESHOLD, SEGMENT_REGRESSION) maps to the DB-level
      // PROPOSED lifecycle status; the *specific* reason is what
      // insufficiencyReasons records.
      status: outcome.status === 'READY_FOR_REVIEW' ? 'READY_FOR_REVIEW' : 'PROPOSED',
      insufficiencyReasons: outcome.insufficiencyReasons,
      createdByUserId,
    },
  });

  await recordPersonalizationAuditEvent({
    actorUserId: createdByUserId,
    action: 'CALIBRATION_RELEASE_PROPOSED',
    entityType: 'CALIBRATION_RELEASE',
    entityId: release.id,
    metadata: { estimateFamilyId: HVAC_ESTIMATE_FAMILY_ID, datasetVersion, status: outcome.status, observationCount: outcome.observationCount, verificationStatusCounts },
  });

  return release;
}
