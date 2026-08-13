// Ask Intelligence FRD §19.4, Phase 10B. Pure calibration evaluator for the
// HVAC repair/replace estimate family -- no Prisma import, deterministic,
// unit-testable without a database. Mirrors hvacRepairReplaceEngine.service.ts's
// own DB-touching-composer vs. pure-evaluator split.
//
// This module never trains an opaque model. It performs a small, bounded,
// explainable coordinate search over the named HvacEngineWeights score
// fields -- every candidate weight set stays enumerable and auditable for
// the four human reviewers a calibration release requires (FRD §19.4),
// matching the engine's own hand-authored additive-scorer shape rather than
// swapping it for something opaque. replaceThreshold/repairThreshold are
// deliberately never tuned here: they decide the verdict from a score, they
// don't feed the score itself, so an error metric computed on `score` has
// nothing to learn from perturbing them.

import { createHash } from 'crypto';
import {
  evaluateHvacRepairReplace,
  DEFAULT_HVAC_ENGINE_WEIGHTS,
  type HvacDecisionContext,
  type HvacEngineWeights,
} from './hvacRepairReplaceEngine.service';

export type CalibrationObservationVerificationStatus = 'REPORTED' | 'CORROBORATED';

export interface CalibrationTrainingRow {
  propertyId: string;
  recommendationSnapshotId: string;
  context: HvacDecisionContext;
  observation: {
    id: string;
    verificationStatus: CalibrationObservationVerificationStatus;
    actionState: 'STARTED' | 'COMPLETED' | null;
    costCents: number | null;
    occurredAt: string;
  };
}

export interface HvacCalibrationPolicy {
  policyVersion: string;
  minDistinctProperties: number;
  minObservationsPerSegment: number;
  minHoldoutObservations: number;
  minHoldoutImprovementPct: number;
  holdoutPercent: number; // 0-100
  segmentRegressionTolerancePct: number;
  sourceReliabilityWeights: Record<CalibrationObservationVerificationStatus, number>;
  outlierCostRatioCeiling: number; // multiple of reference replacement cost
}

// FRD §19.2's first-slice sources are HOMEOWNER_REPORTED (REPORTED) and
// COMPLETED_MAINTENANCE_RECORD (CORROBORATED) -- REPORTED carries half the
// weight of an independently corroborated record, never zero (still a
// legitimate first-slice source, just a noisier one).
export const DEFAULT_HVAC_CALIBRATION_POLICY: HvacCalibrationPolicy = {
  policyVersion: 'hvac-calibration-policy-v1',
  minDistinctProperties: 30,
  minObservationsPerSegment: 15,
  minHoldoutObservations: 10,
  minHoldoutImprovementPct: 5,
  holdoutPercent: 30,
  segmentRegressionTolerancePct: 5,
  sourceReliabilityWeights: { REPORTED: 0.5, CORROBORATED: 1 },
  outlierCostRatioCeiling: 5,
};

export type HvacActionKind = 'REPAIR' | 'REPLACE' | 'UNKNOWN';

// FRD §19.2: Phase 10A's OutcomeObservation.observedPayload never records
// *which* action a homeowner took, only that some action was
// started/completed and (maybe) its cost. This infers REPAIR vs REPLACE from
// cost alone, against the same reference-replacement-cost fallback the
// engine itself uses -- and is deliberately conservative: a middling cost
// ratio is genuinely ambiguous (e.g. a major partial repair) and excluded as
// UNKNOWN rather than guessed either way.
export function inferActionKind(
  observation: CalibrationTrainingRow['observation'],
  context: HvacDecisionContext,
  weights: HvacEngineWeights,
): HvacActionKind {
  if (observation.actionState !== 'COMPLETED' || observation.costCents == null) return 'UNKNOWN';
  const referenceReplacementCostCents =
    context.recordedReplacementCostCents ?? context.currentQuoteAmountCents ?? weights.typicalReplacementCostCents;
  if (referenceReplacementCostCents <= 0) return 'UNKNOWN';
  const costRatio = observation.costCents / referenceReplacementCostCents;
  if (costRatio >= 0.6) return 'REPLACE';
  if (costRatio <= 0.25) return 'REPAIR';
  return 'UNKNOWN';
}

// Projects the inferred categorical outcome onto the engine's own 0-100
// score axis so error is computed on the same scale the engine reasons in.
const REPLACE_TARGET_SCORE = 80;
const REPAIR_TARGET_SCORE = 20;

interface IncludedRow {
  row: CalibrationTrainingRow;
  actionKind: 'REPAIR' | 'REPLACE';
  targetScore: number;
  reliabilityWeight: number;
}

export interface ExclusionSummary {
  totalRows: number;
  excludedUnknownActionKind: number;
  excludedCostOutlier: number;
  censoredNoAction: number;
  includedRows: number;
}

function partitionRows(
  rows: CalibrationTrainingRow[],
  baselineWeights: HvacEngineWeights,
  policy: HvacCalibrationPolicy,
): { included: IncludedRow[]; exclusionSummary: ExclusionSummary } {
  let excludedUnknownActionKind = 0;
  let excludedCostOutlier = 0;
  let censoredNoAction = 0;
  const included: IncludedRow[] = [];

  for (const row of rows) {
    if (row.observation.actionState === 'STARTED') {
      // Started-but-not-completed is a censored observation: no final
      // outcome to compare against yet. Counted, never included.
      censoredNoAction += 1;
      continue;
    }
    const actionKind = inferActionKind(row.observation, row.context, baselineWeights);
    if (actionKind === 'UNKNOWN') {
      excludedUnknownActionKind += 1;
      continue;
    }
    const referenceReplacementCostCents =
      row.context.recordedReplacementCostCents ?? row.context.currentQuoteAmountCents ?? baselineWeights.typicalReplacementCostCents;
    const costCents = row.observation.costCents ?? 0;
    if (referenceReplacementCostCents > 0 && costCents / referenceReplacementCostCents > policy.outlierCostRatioCeiling) {
      excludedCostOutlier += 1;
      continue;
    }
    included.push({
      row,
      actionKind,
      targetScore: actionKind === 'REPLACE' ? REPLACE_TARGET_SCORE : REPAIR_TARGET_SCORE,
      reliabilityWeight: policy.sourceReliabilityWeights[row.observation.verificationStatus],
    });
  }

  return {
    included,
    exclusionSummary: { totalRows: rows.length, excludedUnknownActionKind, excludedCostOutlier, censoredNoAction, includedRows: included.length },
  };
}

// Deterministic, not random: a row's holdout membership depends only on its
// own property identity + the policy version, so the same input always
// splits the same way -- a proposal is exactly reproducible (FRD exit
// criterion "exact production version reproducible").
function isHoldout(row: IncludedRow, policy: HvacCalibrationPolicy): boolean {
  const digest = createHash('sha256').update(`${row.row.propertyId}:${policy.policyVersion}`).digest();
  const bucket = digest.readUInt8(0) / 255;
  return bucket < policy.holdoutPercent / 100;
}

function weightedSquaredError(rows: IncludedRow[], weights: HvacEngineWeights): number {
  if (rows.length === 0) return 0;
  let sumWeightedSquaredError = 0;
  let sumWeights = 0;
  for (const row of rows) {
    const predicted = evaluateHvacRepairReplace(row.row.context, weights).score;
    const error = predicted - row.targetScore;
    sumWeightedSquaredError += row.reliabilityWeight * error * error;
    sumWeights += row.reliabilityWeight;
  }
  return sumWeights > 0 ? sumWeightedSquaredError / sumWeights : 0;
}

// Only the additive score contributions are tunable -- never
// lifespanYears/typicalReplacementCostCents (normalization denominators, not
// score weights) or replaceThreshold/repairThreshold (verdict cutoffs that
// don't feed the score this error metric is computed on).
const SEARCH_DELTA_FRACTIONS = [-0.2, -0.1, -0.05, 0.05, 0.1, 0.2];
const TUNABLE_WEIGHT_FIELDS: Array<keyof HvacEngineWeights> = [
  'ageWeight', 'conditionWeight', 'repairSpendWeight', 'ownershipHorizonPenalty',
  'approachMaximizeReliabilityBonus', 'approachMinimizeUpfrontCostPenalty', 'activeWarrantyPenalty',
];

function searchCandidateWeights(trainingRows: IncludedRow[], baselineWeights: HvacEngineWeights): HvacEngineWeights {
  let candidate: HvacEngineWeights = { ...baselineWeights };
  let bestError = weightedSquaredError(trainingRows, candidate);

  for (const field of TUNABLE_WEIGHT_FIELDS) {
    const baseValue = candidate[field];
    let bestValueForField = baseValue;
    for (const fraction of SEARCH_DELTA_FRACTIONS) {
      const delta = baseValue === 0 ? fraction * 10 : baseValue * fraction;
      const trialWeights: HvacEngineWeights = { ...candidate, [field]: baseValue + delta };
      const trialError = weightedSquaredError(trainingRows, trialWeights);
      if (trialError < bestError) {
        bestError = trialError;
        bestValueForField = baseValue + delta;
      }
    }
    candidate = { ...candidate, [field]: bestValueForField };
  }

  return candidate;
}

export interface SegmentRegressionResult {
  sampleSize: number;
  insufficientData: boolean;
  baselineError: number | null;
  candidateError: number | null;
  regressed: boolean;
}

function conditionSegment(context: HvacDecisionContext): string { return `CONDITION_${context.condition}`; }
function ageSegment(context: HvacDecisionContext): string {
  if (context.ageYears == null) return 'AGE_UNKNOWN';
  if (context.ageYears < 5) return 'AGE_UNDER_5';
  if (context.ageYears < 10) return 'AGE_5_TO_10';
  if (context.ageYears < 15) return 'AGE_10_TO_15';
  return 'AGE_15_PLUS';
}
function warrantySegment(context: HvacDecisionContext): string { return context.warrantyActive ? 'WARRANTY_ACTIVE' : 'WARRANTY_INACTIVE'; }

function computeSegmentRegression(
  holdoutRows: IncludedRow[],
  baselineWeights: HvacEngineWeights,
  candidateWeights: HvacEngineWeights,
  policy: HvacCalibrationPolicy,
): Record<string, SegmentRegressionResult> {
  const segmentFns: Array<(c: HvacDecisionContext) => string> = [conditionSegment, ageSegment, warrantySegment];
  const bySegment = new Map<string, IncludedRow[]>();
  for (const fn of segmentFns) {
    for (const row of holdoutRows) {
      const key = fn(row.row.context);
      const list = bySegment.get(key) ?? [];
      list.push(row);
      bySegment.set(key, list);
    }
  }

  const results: Record<string, SegmentRegressionResult> = {};
  for (const [segment, rows] of bySegment) {
    if (rows.length < policy.minObservationsPerSegment) {
      results[segment] = { sampleSize: rows.length, insufficientData: true, baselineError: null, candidateError: null, regressed: false };
      continue;
    }
    const baselineError = weightedSquaredError(rows, baselineWeights);
    const candidateError = weightedSquaredError(rows, candidateWeights);
    results[segment] = {
      sampleSize: rows.length, insufficientData: false, baselineError, candidateError,
      regressed: candidateError > baselineError * (1 + policy.segmentRegressionTolerancePct / 100),
    };
  }
  return results;
}

export type CalibrationEvaluationStatus = 'INSUFFICIENT_DATA' | 'BELOW_IMPROVEMENT_THRESHOLD' | 'SEGMENT_REGRESSION' | 'READY_FOR_REVIEW';

export interface CalibrationEvaluationOutcome {
  status: CalibrationEvaluationStatus;
  insufficiencyReasons: string[];
  observationCount: number;
  distinctPropertyCount: number;
  trainingObservationCount: number;
  holdoutObservationCount: number;
  // Equal to baselineWeights whenever status !== 'READY_FOR_REVIEW' -- never
  // a wild/undefined weight set.
  candidateWeights: HvacEngineWeights;
  trainingMetrics: { baselineWeightedError: number; candidateWeightedError: number };
  holdoutMetrics: { baselineWeightedError: number; candidateWeightedError: number; improvementPct: number };
  segmentRegressionResults: Record<string, SegmentRegressionResult>;
  exclusionSummary: ExclusionSummary;
}

export function evaluateHvacCalibrationCandidate(
  rows: CalibrationTrainingRow[],
  baselineWeights: HvacEngineWeights = DEFAULT_HVAC_ENGINE_WEIGHTS,
  policy: HvacCalibrationPolicy = DEFAULT_HVAC_CALIBRATION_POLICY,
): CalibrationEvaluationOutcome {
  const { included, exclusionSummary } = partitionRows(rows, baselineWeights, policy);
  const distinctPropertyCount = new Set(included.map((row) => row.row.propertyId)).size;

  const trainingRows = included.filter((row) => !isHoldout(row, policy));
  const holdoutRows = included.filter((row) => isHoldout(row, policy));
  const baselineHoldoutError = weightedSquaredError(holdoutRows, baselineWeights);

  const insufficiencyReasons: string[] = [];
  if (distinctPropertyCount < policy.minDistinctProperties) {
    insufficiencyReasons.push(`DISTINCT_PROPERTY_COUNT_BELOW_PRIVACY_MINIMUM (${distinctPropertyCount} < ${policy.minDistinctProperties})`);
  }
  if (holdoutRows.length < policy.minHoldoutObservations) {
    insufficiencyReasons.push(`HOLDOUT_OBSERVATION_COUNT_BELOW_MINIMUM (${holdoutRows.length} < ${policy.minHoldoutObservations})`);
  }

  const base = {
    observationCount: rows.length,
    distinctPropertyCount,
    trainingObservationCount: trainingRows.length,
    holdoutObservationCount: holdoutRows.length,
    exclusionSummary,
  };

  if (insufficiencyReasons.length > 0) {
    return {
      ...base,
      status: 'INSUFFICIENT_DATA',
      insufficiencyReasons,
      candidateWeights: baselineWeights,
      trainingMetrics: { baselineWeightedError: weightedSquaredError(trainingRows, baselineWeights), candidateWeightedError: weightedSquaredError(trainingRows, baselineWeights) },
      holdoutMetrics: { baselineWeightedError: baselineHoldoutError, candidateWeightedError: baselineHoldoutError, improvementPct: 0 },
      segmentRegressionResults: computeSegmentRegression(holdoutRows, baselineWeights, baselineWeights, policy),
    };
  }

  const candidateWeights = searchCandidateWeights(trainingRows, baselineWeights);
  const trainingMetrics = {
    baselineWeightedError: weightedSquaredError(trainingRows, baselineWeights),
    candidateWeightedError: weightedSquaredError(trainingRows, candidateWeights),
  };
  const candidateHoldoutError = weightedSquaredError(holdoutRows, candidateWeights);
  const improvementPct = baselineHoldoutError > 0 ? ((baselineHoldoutError - candidateHoldoutError) / baselineHoldoutError) * 100 : 0;
  const holdoutMetrics = { baselineWeightedError: baselineHoldoutError, candidateWeightedError: candidateHoldoutError, improvementPct };
  const segmentRegressionResults = computeSegmentRegression(holdoutRows, baselineWeights, candidateWeights, policy);

  if (Object.values(segmentRegressionResults).some((segment) => segment.regressed)) {
    return {
      ...base, status: 'SEGMENT_REGRESSION', insufficiencyReasons: ['ONE_OR_MORE_SEGMENTS_REGRESSED'],
      candidateWeights: baselineWeights, trainingMetrics, holdoutMetrics, segmentRegressionResults,
    };
  }

  if (improvementPct < policy.minHoldoutImprovementPct) {
    return {
      ...base, status: 'BELOW_IMPROVEMENT_THRESHOLD',
      insufficiencyReasons: [`HOLDOUT_IMPROVEMENT_BELOW_THRESHOLD (${improvementPct.toFixed(2)}% < ${policy.minHoldoutImprovementPct}%)`],
      candidateWeights: baselineWeights, trainingMetrics, holdoutMetrics, segmentRegressionResults,
    };
  }

  return { ...base, status: 'READY_FOR_REVIEW', insufficiencyReasons: [], candidateWeights, trainingMetrics, holdoutMetrics, segmentRegressionResults };
}
