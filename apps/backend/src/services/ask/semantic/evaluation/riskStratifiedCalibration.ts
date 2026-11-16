import { type SemanticFacet } from '../semanticRequestPlan';
import { wilson95Interval } from '../crossDomain/domainWaveManifest';

export const ASK_PHASE6_CALIBRATION_VERSION = 'phase6-risk-calibration-1.0.0' as const;
export const MIN_INDEPENDENT_SAMPLES_AT_ZERO_ERRORS = 381 as const;

export type SemanticRiskStratum =
  | 'REVERSIBLE_PROPERTY_READ'
  | 'AGGREGATE_OR_COMPARISON_READ'
  | 'RECOMMENDATION_OR_MATERIAL_ANALYSIS'
  | 'AMBIGUOUS_SLOT_OR_ENTITY'
  | 'WRITE_OR_CONSEQUENTIAL_ACTION'
  | 'SAFETY_OR_RESTRICTED_BOUNDARY';

export type StratumDefaultBehavior =
  | 'EXECUTE'
  | 'EXECUTE_WITH_DISCLOSURE'
  | 'CLARIFY'
  | 'PREVIEW_AND_CONFIRM'
  | 'BOUNDARY_RESPONSE';

export interface MultidimensionalConfidenceVector {
  readonly requestClassConfidence: number;
  readonly domainRecall: number;
  readonly targetMargin: number;
  readonly entityResolution: number;
  readonly relationPolarityEvidence: number;
  readonly slotCompleteness: number;
  readonly projectionEvidence: number;
  readonly effectMaterialityClass: 'LOW_READ' | 'DERIVED_READ' | 'HIGH_MATERIAL_ANALYSIS' | 'WRITE_EFFECT' | 'BOUNDARY';
  readonly languageLocale: 'en-US';
  readonly routeType: 'DETERMINISTIC_SEMANTIC_PLAN' | 'PROVIDER_STRUCTURED_PLAN' | 'RECONCILED_DUAL_PRODUCER' | 'SAFETY_BOUNDARY';
  readonly providerAvailability: 'AVAILABLE' | 'SHORT_CIRCUITED' | 'UNAVAILABLE';
}

export interface RiskStratumPolicyConfig {
  readonly stratum: SemanticRiskStratum;
  readonly defaultBehavior: StratumDefaultBehavior;
  readonly highConfidenceThreshold: number;
  readonly minimumAdmissionConfidence: number;
  readonly maxAllowedIncorrectHighUpper95: number;
}

export const SEMANTIC_RISK_STRATUM_POLICIES: Readonly<Record<SemanticRiskStratum, RiskStratumPolicyConfig>> = Object.freeze({
  REVERSIBLE_PROPERTY_READ: {
    stratum: 'REVERSIBLE_PROPERTY_READ',
    defaultBehavior: 'EXECUTE',
    highConfidenceThreshold: 0.78,
    minimumAdmissionConfidence: 0.65,
    maxAllowedIncorrectHighUpper95: 0.01,
  },
  AGGREGATE_OR_COMPARISON_READ: {
    stratum: 'AGGREGATE_OR_COMPARISON_READ',
    defaultBehavior: 'EXECUTE',
    highConfidenceThreshold: 0.80,
    minimumAdmissionConfidence: 0.70,
    maxAllowedIncorrectHighUpper95: 0.01,
  },
  RECOMMENDATION_OR_MATERIAL_ANALYSIS: {
    stratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    defaultBehavior: 'EXECUTE_WITH_DISCLOSURE',
    highConfidenceThreshold: 0.82,
    minimumAdmissionConfidence: 0.72,
    maxAllowedIncorrectHighUpper95: 0.01,
  },
  AMBIGUOUS_SLOT_OR_ENTITY: {
    stratum: 'AMBIGUOUS_SLOT_OR_ENTITY',
    defaultBehavior: 'CLARIFY',
    highConfidenceThreshold: 0.85,
    minimumAdmissionConfidence: 0.75,
    maxAllowedIncorrectHighUpper95: 0.01,
  },
  WRITE_OR_CONSEQUENTIAL_ACTION: {
    stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION',
    defaultBehavior: 'PREVIEW_AND_CONFIRM',
    highConfidenceThreshold: 0.90,
    minimumAdmissionConfidence: 0.82,
    maxAllowedIncorrectHighUpper95: 0.01,
  },
  SAFETY_OR_RESTRICTED_BOUNDARY: {
    stratum: 'SAFETY_OR_RESTRICTED_BOUNDARY',
    defaultBehavior: 'BOUNDARY_RESPONSE',
    highConfidenceThreshold: 0.88,
    minimumAdmissionConfidence: 0.80,
    maxAllowedIncorrectHighUpper95: 0.01,
  },
});

export function classifySemanticRiskStratum(input: {
  readonly outcome: 'MATCH' | 'NONE_FITS' | 'INSUFFICIENT_TEXT' | 'BOUNDARY' | 'SCHEMA_INVALID' | 'PROVIDER_UNAVAILABLE';
  readonly facet?: SemanticFacet | null;
  readonly requiresClarification?: boolean;
}): SemanticRiskStratum {
  if (input.outcome === 'BOUNDARY') {
    return 'SAFETY_OR_RESTRICTED_BOUNDARY';
  }
  const facet = input.facet;
  if (
    input.requiresClarification
    || (facet && facet.requiredSlots.some((slot) => slot.state === 'UNRESOLVED'))
  ) {
    return 'AMBIGUOUS_SLOT_OR_ENTITY';
  }
  if (!facet) {
    return 'AMBIGUOUS_SLOT_OR_ENTITY';
  }
  if (facet.requestClass === 'COMMAND') {
    return 'WRITE_OR_CONSEQUENTIAL_ACTION';
  }
  if (facet.requestClass === 'CAPABILITY') {
    if (facet.projection === 'COMPARE') {
      return 'AGGREGATE_OR_COMPARISON_READ';
    }
    return 'RECOMMENDATION_OR_MATERIAL_ANALYSIS';
  }
  if (facet.projection === 'AGGREGATE' || facet.projection === 'COMPARE') {
    return 'AGGREGATE_OR_COMPARISON_READ';
  }
  return 'REVERSIBLE_PROPERTY_READ';
}

export function extractMultidimensionalConfidence(input: {
  readonly stratum: SemanticRiskStratum;
  readonly facet?: SemanticFacet | null;
  readonly entityResolved: boolean;
  readonly producerKind: 'DETERMINISTIC' | 'PROVIDER' | 'RECONCILED';
  readonly providerAvailable: boolean;
  readonly shortCircuitedProvider: boolean;
  readonly schemaValid: boolean;
}): {
  readonly vector: MultidimensionalConfidenceVector;
  readonly compositeScore: number;
} {
  const facet = input.facet;
  const domainScore = facet?.domainCandidates[0]?.score ?? 0.5;
  const secondDomainScore = facet?.domainCandidates[1]?.score ?? 0.0;
  const targetScore = facet?.targetCandidates[0]?.score ?? 0.5;
  const secondTargetScore = facet?.targetCandidates[1]?.score ?? 0.0;
  const unresolvedCount = facet?.requiredSlots.filter((s) => s.state === 'UNRESOLVED').length ?? 0;

  const effectMaterialityClass: MultidimensionalConfidenceVector['effectMaterialityClass'] =
    input.stratum === 'SAFETY_OR_RESTRICTED_BOUNDARY'
      ? 'BOUNDARY'
      : input.stratum === 'WRITE_OR_CONSEQUENTIAL_ACTION'
        ? 'WRITE_EFFECT'
        : input.stratum === 'RECOMMENDATION_OR_MATERIAL_ANALYSIS'
          ? 'HIGH_MATERIAL_ANALYSIS'
          : input.stratum === 'AGGREGATE_OR_COMPARISON_READ'
            ? 'DERIVED_READ'
            : 'LOW_READ';

  const routeType: MultidimensionalConfidenceVector['routeType'] =
    input.stratum === 'SAFETY_OR_RESTRICTED_BOUNDARY'
      ? 'SAFETY_BOUNDARY'
      : input.producerKind === 'RECONCILED'
        ? 'RECONCILED_DUAL_PRODUCER'
        : input.producerKind === 'PROVIDER'
          ? 'PROVIDER_STRUCTURED_PLAN'
          : 'DETERMINISTIC_SEMANTIC_PLAN';

  const vector: MultidimensionalConfidenceVector = {
    requestClassConfidence: facet ? (input.schemaValid ? 0.96 : 0.35) : input.stratum === 'SAFETY_OR_RESTRICTED_BOUNDARY' ? 0.98 : 0.4,
    domainRecall: Number(domainScore.toFixed(4)),
    targetMargin: Number(Math.max(0.05, Math.min(1, targetScore - secondTargetScore + (domainScore - secondDomainScore) * 0.2)).toFixed(4)),
    entityResolution: input.entityResolved ? 0.96 : 0.45,
    relationPolarityEvidence: facet ? ((facet.evidence.relationNamed || facet.evidence.polarityNamed) ? 0.95 : 0.78) : 0.5,
    slotCompleteness: facet
      ? (facet.requiredSlots.length === 0 ? 1 : (facet.requiredSlots.length - unresolvedCount) / facet.requiredSlots.length)
      : 0,
    projectionEvidence: facet?.evidence.projectionNamed ? 0.95 : 0.65,
    effectMaterialityClass,
    languageLocale: 'en-US',
    routeType,
    providerAvailability: !input.providerAvailable
      ? 'UNAVAILABLE'
      : input.shortCircuitedProvider
        ? 'SHORT_CIRCUITED'
        : 'AVAILABLE',
  };

  // Strict multidimensional weighted aggregation (never maps raw provider HIGH label directly).
  const rawComposite =
    vector.requestClassConfidence * 0.2
    + vector.domainRecall * 0.14
    + vector.targetMargin * 0.12
    + vector.entityResolution * 0.16
    + vector.relationPolarityEvidence * 0.12
    + vector.slotCompleteness * 0.16
    + vector.projectionEvidence * 0.1;

  const producerBonus = routeType === 'RECONCILED_DUAL_PRODUCER' ? 0.02 : 0;
  const compositeScore = Number(Math.max(0, Math.min(0.995, rawComposite + producerBonus)).toFixed(4));

  return { vector, compositeScore };
}

export interface CalibrationObservation {
  readonly caseId: string;
  readonly stratum: SemanticRiskStratum;
  readonly rawScore: number;
  readonly highConfidenceAdmitted: boolean;
  readonly correct: boolean;
  readonly isOutOfScopeProbe?: boolean;
}

export interface StratumCalibrationSummary {
  readonly stratum: SemanticRiskStratum;
  readonly defaultBehavior: StratumDefaultBehavior;
  readonly minimumAdmissionConfidence: number;
  readonly highConfidenceThreshold: number;
  readonly sampleCount: number;
  readonly correctCount: number;
  readonly observedAccuracy: number;
  readonly incorrectHighConfidenceCount: number;
  readonly incorrectHighConfidenceRate: number;
  readonly incorrectHighConfidenceUpper95Bound: number;
  readonly expectedCalibrationError: number | null;
  readonly eceEvaluated: boolean;
  readonly eceEvaluationMode: 'HELD_OUT_SPLIT' | 'LEAVE_ONE_OUT_CV' | 'INSUFFICIENT_FOR_OUT_OF_FOLD';
  readonly pavAnchors: readonly (readonly [number, number])[];
  readonly observedZeroErrorPassed: boolean;
  readonly statisticalBoundPassed: boolean;
  readonly gatePassed: boolean;
}

export interface RiskStratifiedCalibrationReport {
  readonly version: string;
  readonly minRequiredIndependentSamplesAtZeroErrors: number;
  readonly calibrationEvaluationMode: 'HELD_OUT_SPLIT' | 'LEAVE_ONE_OUT_CV';
  readonly observedZeroErrorPassed: boolean;
  readonly overallPassed: boolean;
  readonly totalObservations: number;
  readonly totalIncorrectHighConfidence: number;
  readonly strata: readonly StratumCalibrationSummary[];
  readonly failedStrata: readonly SemanticRiskStratum[];
}

function deriveStratumPavAnchors(
  observations: readonly CalibrationObservation[],
): readonly (readonly [number, number])[] {
  const sorted = [...observations].sort((a, b) => a.rawScore - b.rawScore);
  const groups = sorted.map((obs) => ({
    scoreSum: obs.rawScore,
    correctSum: obs.correct ? 1 : 0,
    count: 1,
  }));

  for (let i = 0; i < groups.length - 1;) {
    const currAcc = groups[i].correctSum / groups[i].count;
    const nextAcc = groups[i + 1].correctSum / groups[i + 1].count;
    if (currAcc <= nextAcc) {
      i += 1;
      continue;
    }
    groups.splice(i, 2, {
      scoreSum: groups[i].scoreSum + groups[i + 1].scoreSum,
      correctSum: groups[i].correctSum + groups[i + 1].correctSum,
      count: groups[i].count + groups[i + 1].count,
    });
    if (i > 0) i -= 1;
  }

  const anchors = groups.map((g) => [
    Number((g.scoreSum / g.count).toFixed(4)),
    Number((g.correctSum / g.count).toFixed(4)),
  ] as const);

  if (anchors.length === 0) return [[0, 0], [1, 1]];
  return [
    [0, 0] as const,
    ...anchors.filter(([x]) => x > 0 && x < 1),
    [1, 1] as const,
  ];
}

function interpolateAnchor(score: number, anchors: readonly (readonly [number, number])[]): number {
  const bounded = Math.max(0, Math.min(1, score));
  for (let i = 1; i < anchors.length; i += 1) {
    const [x2, y2] = anchors[i];
    const [x1, y1] = anchors[i - 1];
    if (bounded <= x2) {
      const ratio = (bounded - x1) / Math.max(0.0001, x2 - x1);
      return y1 + (y2 - y1) * ratio;
    }
  }
  return anchors[anchors.length - 1][1];
}

/**
 * Calibrates confidence per §12 FR-UND-4 semantic risk stratum using Pool-Adjacent-Violators
 * empirical calibration and checks FR-EVAL-4 incorrect-high-confidence Wilson 95% upper bounds.
 *
 * Calibration fitting and ECE evaluation never reuse the same observation:
 * - when `options.calibrationFitObservations` is provided, anchors are fit strictly on the split
 *   and evaluated on `observations`;
 * - otherwise, ECE is computed via leave-one-out out-of-fold cross-validation (`sampleCount >= 2`),
 *   reporting `eceEvaluated: false` and `expectedCalibrationError: null` when fewer than 2 samples exist.
 */
export function evaluateRiskStratifiedCalibration(
  observations: readonly CalibrationObservation[],
  options: {
    readonly calibrationFitObservations?: readonly CalibrationObservation[];
  } = {},
): RiskStratifiedCalibrationReport {
  const orderedStrata: readonly SemanticRiskStratum[] = [
    'REVERSIBLE_PROPERTY_READ',
    'AGGREGATE_OR_COMPARISON_READ',
    'RECOMMENDATION_OR_MATERIAL_ANALYSIS',
    'AMBIGUOUS_SLOT_OR_ENTITY',
    'WRITE_OR_CONSEQUENTIAL_ACTION',
    'SAFETY_OR_RESTRICTED_BOUNDARY',
  ];

  const hasDisjointFitSet = Array.isArray(options.calibrationFitObservations);
  const summaries: StratumCalibrationSummary[] = [];
  const failedStrata: SemanticRiskStratum[] = [];

  for (const stratum of orderedStrata) {
    const policy = SEMANTIC_RISK_STRATUM_POLICIES[stratum];
    const stratumObs = observations.filter((o) => o.stratum === stratum);
    const sampleCount = stratumObs.length;
    const correctCount = stratumObs.filter((o) => o.correct).length;
    const observedAccuracy = sampleCount > 0 ? Number((correctCount / sampleCount).toFixed(4)) : 0;

    const incorrectHigh = stratumObs.filter((o) => o.highConfidenceAdmitted && !o.correct).length;
    const incorrectHighRate = sampleCount > 0 ? Number((incorrectHigh / sampleCount).toFixed(4)) : 0;
    const upper95 = sampleCount > 0 ? wilson95Interval(incorrectHigh, sampleCount).upper : 1;

    const fitObs = hasDisjointFitSet
      ? options.calibrationFitObservations!.filter((o) => o.stratum === stratum)
      : stratumObs;
    const pavAnchors = deriveStratumPavAnchors(fitObs);

    let ece: number | null = null;
    let eceEvaluated = false;
    let eceEvaluationMode: StratumCalibrationSummary['eceEvaluationMode'] = 'INSUFFICIENT_FOR_OUT_OF_FOLD';

    if (hasDisjointFitSet) {
      if (sampleCount > 0 && fitObs.length > 0) {
        let eceSum = 0;
        for (const obs of stratumObs) {
          const calibrated = interpolateAnchor(obs.rawScore, pavAnchors);
          eceSum += Math.abs(calibrated - (obs.correct ? 1 : 0));
        }
        ece = Number((eceSum / sampleCount).toFixed(4));
        eceEvaluated = true;
        eceEvaluationMode = 'HELD_OUT_SPLIT';
      }
    } else if (sampleCount >= 2) {
      let eceSum = 0;
      for (let i = 0; i < stratumObs.length; i += 1) {
        const foldTrain = stratumObs.filter((_, idx) => idx !== i);
        const foldAnchors = deriveStratumPavAnchors(foldTrain);
        const calibrated = interpolateAnchor(stratumObs[i].rawScore, foldAnchors);
        eceSum += Math.abs(calibrated - (stratumObs[i].correct ? 1 : 0));
      }
      ece = Number((eceSum / sampleCount).toFixed(4));
      eceEvaluated = true;
      eceEvaluationMode = 'LEAVE_ONE_OUT_CV';
    }

    // FR-EVAL-4 strictly requires incorrect-high-confidence Wilson 95% upper bound < 1%
    // for every risk stratum (at 0 observed errors this mathematically requires n >= 381).
    const observedZeroErrorPassed = sampleCount > 0 && incorrectHigh === 0;
    const statisticalBoundPassed = sampleCount > 0 && upper95 < policy.maxAllowedIncorrectHighUpper95;
    const ecePassed = eceEvaluated && ece !== null && ece <= 0.25;

    const gatePassed = observedZeroErrorPassed && ecePassed && statisticalBoundPassed;

    if (!gatePassed) {
      failedStrata.push(stratum);
    }

    summaries.push({
      stratum,
      defaultBehavior: policy.defaultBehavior,
      minimumAdmissionConfidence: policy.minimumAdmissionConfidence,
      highConfidenceThreshold: policy.highConfidenceThreshold,
      sampleCount,
      correctCount,
      observedAccuracy,
      incorrectHighConfidenceCount: incorrectHigh,
      incorrectHighConfidenceRate: incorrectHighRate,
      incorrectHighConfidenceUpper95Bound: upper95,
      expectedCalibrationError: ece,
      eceEvaluated,
      eceEvaluationMode,
      pavAnchors,
      observedZeroErrorPassed,
      statisticalBoundPassed,
      gatePassed,
    });
  }

  return {
    version: ASK_PHASE6_CALIBRATION_VERSION,
    minRequiredIndependentSamplesAtZeroErrors: MIN_INDEPENDENT_SAMPLES_AT_ZERO_ERRORS,
    calibrationEvaluationMode: hasDisjointFitSet ? 'HELD_OUT_SPLIT' : 'LEAVE_ONE_OUT_CV',
    observedZeroErrorPassed: summaries.every((s) => s.observedZeroErrorPassed),
    overallPassed: failedStrata.length === 0,
    totalObservations: observations.length,
    totalIncorrectHighConfidence: summaries.reduce((acc, s) => acc + s.incorrectHighConfidenceCount, 0),
    strata: summaries,
    failedStrata,
  };
}
