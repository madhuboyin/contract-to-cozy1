type SourceForActivation = {
  reviewedStatus: string;
  termsVersion: string | null;
  supportedObservationTypes: readonly string[];
  enabledEnvironments: readonly string[];
  pausedAt?: Date | null;
};

type CoverageForActivation = {
  status: string;
  geographyKey: string | null;
  validThrough: Date | null;
  qaReviewedAt?: Date | null;
};

export type SourceActivationDecision = {
  enabled: boolean;
  reasonCodes: string[];
};

export function evaluateSourceActivation(
  source: SourceForActivation,
  coverages: readonly CoverageForActivation[],
  environment: string,
  now = new Date(),
): SourceActivationDecision {
  const reasonCodes: string[] = [];
  if (source.reviewedStatus !== 'APPROVED') reasonCodes.push('SOURCE_NOT_APPROVED');
  if (!source.termsVersion) reasonCodes.push('TERMS_VERSION_MISSING');
  if (source.supportedObservationTypes.length === 0) {
    reasonCodes.push('OBSERVATION_TYPES_MISSING');
  }
  if (!source.enabledEnvironments.includes(environment)) {
    reasonCodes.push('ENVIRONMENT_NOT_ENABLED');
  }
  if (source.pausedAt) reasonCodes.push('SOURCE_PAUSED');
  if (coverages.length === 0) reasonCodes.push('COVERAGE_NOT_CONFIGURED');
  const reviewedCoverages = coverages.filter((coverage) => coverage.qaReviewedAt);
  if (coverages.length > 0 && reviewedCoverages.length === 0) {
    reasonCodes.push('COVERAGE_QA_NOT_APPROVED');
  }
  if (coverages.some((coverage) => !coverage.geographyKey)) {
    reasonCodes.push('COVERAGE_GEOGRAPHY_MISSING');
  }
  if (reviewedCoverages.length > 0 && reviewedCoverages.every((coverage) =>
    coverage.status === 'UNAVAILABLE'
    || (coverage.validThrough != null && coverage.validThrough < now))) {
    reasonCodes.push('NO_CURRENT_COVERAGE');
  }
  return {
    enabled: reasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

export function assertObservationTypeSupported(
  supportedObservationTypes: readonly string[],
  observationType: string,
): void {
  if (!supportedObservationTypes.includes(observationType)) {
    throw Object.assign(
      new Error(`Observation type ${observationType} is not approved for this source.`),
      { statusCode: 422, code: 'OBSERVATION_TYPE_NOT_APPROVED' },
    );
  }
}
