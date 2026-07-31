export type IntelligenceLaunchStage =
  | 'DRAFT'
  | 'PILOT'
  | 'LIMITED'
  | 'GENERAL'
  | 'PAUSED';

export type IntelligenceLaunchThresholds = {
  minimumCurrentCoveragePercent: number;
  minimumBriefingResponses: number;
  minimumUsefulnessRate: number;
  minimumActionFollowThroughRate: number;
  maximumFalsePositiveRate: number;
};

export const DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS: IntelligenceLaunchThresholds = {
  minimumCurrentCoveragePercent: 95,
  minimumBriefingResponses: 5,
  minimumUsefulnessRate: 0.6,
  minimumActionFollowThroughRate: 0.25,
  maximumFalsePositiveRate: 0.15,
};

export type SourceFamilyLaunchMetrics = {
  sourceCount: number;
  activationFailures: number;
  currentCoveragePercent: number;
  freshnessBreaches: number;
  operationalResponseBreaches: number;
  briefingResponses: number;
  usefulnessRate: number | null;
  actionEligibleItems: number;
  actionFollowThroughRate: number | null;
  localFeedbackCount: number;
  falsePositiveRate: number | null;
  falseAllClearCount: number;
  unsupportedImpactLanguageCount: number;
  duplicateActionCount: number;
  duplicateChangeCount: number;
  duplicateEventCount: number;
  duplicateNotificationCount: number;
};

export type SourceFamilyLaunchPolicy = {
  stage: IntelligenceLaunchStage;
  safetyApproved: boolean;
  privacyApproved: boolean;
  hazardLanguageApproved: boolean;
  thresholds: IntelligenceLaunchThresholds;
};

export type SourceFamilyLaunchGate = {
  pass: boolean;
  issueCodes: string[];
  retirementEligible: boolean;
};

export function parseSourceFamilyLaunchPolicy(
  value: unknown,
): SourceFamilyLaunchPolicy {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  const thresholds =
    record.thresholds
    && typeof record.thresholds === 'object'
    && !Array.isArray(record.thresholds)
      ? record.thresholds as Record<string, unknown>
      : {};
  const numberOr = (candidate: unknown, fallback: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : fallback;
  const allowedStages: IntelligenceLaunchStage[] = [
    'DRAFT',
    'PILOT',
    'LIMITED',
    'GENERAL',
    'PAUSED',
  ];
  return {
    stage: allowedStages.includes(record.stage as IntelligenceLaunchStage)
      ? record.stage as IntelligenceLaunchStage
      : 'DRAFT',
    safetyApproved: record.safetyApproved === true,
    privacyApproved: record.privacyApproved === true,
    hazardLanguageApproved: record.hazardLanguageApproved === true,
    thresholds: {
      minimumCurrentCoveragePercent: numberOr(
        thresholds.minimumCurrentCoveragePercent,
        DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS.minimumCurrentCoveragePercent,
      ),
      minimumBriefingResponses: numberOr(
        thresholds.minimumBriefingResponses,
        DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS.minimumBriefingResponses,
      ),
      minimumUsefulnessRate: numberOr(
        thresholds.minimumUsefulnessRate,
        DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS.minimumUsefulnessRate,
      ),
      minimumActionFollowThroughRate: numberOr(
        thresholds.minimumActionFollowThroughRate,
        DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS.minimumActionFollowThroughRate,
      ),
      maximumFalsePositiveRate: numberOr(
        thresholds.maximumFalsePositiveRate,
        DEFAULT_INTELLIGENCE_LAUNCH_THRESHOLDS.maximumFalsePositiveRate,
      ),
    },
  };
}

export function evaluateFamilyLaunchAuthorization(
  policy: SourceFamilyLaunchPolicy,
): { authorized: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (policy.stage === 'DRAFT') reasonCodes.push('FAMILY_LAUNCH_NOT_REVIEWED');
  if (policy.stage === 'PAUSED') reasonCodes.push('FAMILY_LAUNCH_PAUSED');
  if (!policy.safetyApproved) reasonCodes.push('FAMILY_SAFETY_REVIEW_REQUIRED');
  if (!policy.privacyApproved) reasonCodes.push('FAMILY_PRIVACY_REVIEW_REQUIRED');
  if (!policy.hazardLanguageApproved) {
    reasonCodes.push('FAMILY_HAZARD_LANGUAGE_REVIEW_REQUIRED');
  }
  return { authorized: reasonCodes.length === 0, reasonCodes };
}

const unsupportedImpactPatterns = [
  /\b(?:will|would|is expected to)\s+(?:increase|decrease|raise|lower)\s+(?:property|home)\s+value\b/i,
  /\b(?:will|would|is expected to)\s+(?:increase|decrease|raise|lower)\s+(?:insurance|premium|demand)\b/i,
  /\b(?:caused|damaged|affected)\s+(?:this|the)\s+(?:home|property)\b/i,
  /\bguaranteed\s+(?:safe|all[- ]clear|unaffected)\b/i,
] as const;

export function containsUnsupportedImpactLanguage(value: string): boolean {
  return unsupportedImpactPatterns.some((pattern) => pattern.test(value));
}

export function evaluateSourceFamilyLaunchGate(input: {
  policy: SourceFamilyLaunchPolicy;
  metrics: SourceFamilyLaunchMetrics;
}): SourceFamilyLaunchGate {
  const { policy, metrics } = input;
  const issueCodes: string[] = [];

  if (policy.stage === 'DRAFT') issueCodes.push('LAUNCH_STAGE_DRAFT');
  if (policy.stage === 'PAUSED') issueCodes.push('FAMILY_PAUSED');
  if (!policy.safetyApproved) issueCodes.push('SAFETY_REVIEW_REQUIRED');
  if (!policy.privacyApproved) issueCodes.push('PRIVACY_REVIEW_REQUIRED');
  if (!policy.hazardLanguageApproved) issueCodes.push('HAZARD_LANGUAGE_REVIEW_REQUIRED');
  if (metrics.sourceCount === 0) issueCodes.push('NO_SOURCES_CONFIGURED');
  if (metrics.activationFailures > 0) issueCodes.push('SOURCE_ACTIVATION_FAILURE');
  if (
    metrics.currentCoveragePercent
    < policy.thresholds.minimumCurrentCoveragePercent
  ) {
    issueCodes.push('COVERAGE_SLO_BREACH');
  }
  if (metrics.freshnessBreaches > 0) issueCodes.push('FRESHNESS_SLO_BREACH');
  if (metrics.operationalResponseBreaches > 0) {
    issueCodes.push('OPERATIONAL_RESPONSE_SLO_BREACH');
  }
  if (metrics.falseAllClearCount > 0) issueCodes.push('FALSE_ALL_CLEAR_DETECTED');
  if (metrics.unsupportedImpactLanguageCount > 0) {
    issueCodes.push('UNSUPPORTED_IMPACT_LANGUAGE_DETECTED');
  }
  if (
    metrics.duplicateActionCount
    + metrics.duplicateChangeCount
    + metrics.duplicateEventCount
    + metrics.duplicateNotificationCount
    > 0
  ) {
    issueCodes.push('DUPLICATE_CANONICAL_OUTPUT_DETECTED');
  }
  if (policy.stage === 'LIMITED' || policy.stage === 'GENERAL') {
    if (
      metrics.briefingResponses < policy.thresholds.minimumBriefingResponses
    ) {
      issueCodes.push('USEFULNESS_SAMPLE_INSUFFICIENT');
    } else if (
      metrics.usefulnessRate == null
      || metrics.usefulnessRate < policy.thresholds.minimumUsefulnessRate
    ) {
      issueCodes.push('USEFULNESS_RATE_BELOW_GATE');
    }
    if (
      metrics.actionEligibleItems > 0
      && (
        metrics.actionFollowThroughRate == null
        || metrics.actionFollowThroughRate
          < policy.thresholds.minimumActionFollowThroughRate
      )
    ) {
      issueCodes.push('ACTION_FOLLOW_THROUGH_BELOW_GATE');
    }
  }
  if (
    metrics.falsePositiveRate != null
    && metrics.falsePositiveRate > policy.thresholds.maximumFalsePositiveRate
  ) {
    issueCodes.push('FALSE_POSITIVE_RATE_ABOVE_GATE');
  }

  const pass = issueCodes.length === 0;
  return {
    pass,
    issueCodes,
    retirementEligible: pass && policy.stage === 'GENERAL',
  };
}

type ReviewedCoverage = {
  geographyType: string;
  geographyKey: string | null;
  qaReviewedAt?: Date | null;
  status: string;
  validFrom: Date | null;
  validThrough: Date | null;
};

export function observationWithinReviewedCoverage(
  observation: { geographyType: string; geographyKey: string },
  coverages: readonly ReviewedCoverage[],
  now = new Date(),
): boolean {
  const observationKey = observation.geographyKey.trim().toUpperCase();
  return coverages.some((coverage) => {
    if (!coverage.qaReviewedAt) return false;
    if (coverage.status === 'UNAVAILABLE') return false;
    if (coverage.validFrom && coverage.validFrom > now) return false;
    if (coverage.validThrough && coverage.validThrough < now) return false;
    if (coverage.geographyType === 'NATIONAL') return true;
    return coverage.geographyType === observation.geographyType
      && coverage.geographyKey?.trim().toUpperCase() === observationKey;
  });
}
