export type EnvelopeCoverageEvaluationContract = Readonly<{
  version: string;
  fixtureCorpusVersion: string;
  baselineVersion: string;
  minimumCoverageRatio: number;
  minimumSampleSize: number;
  measurementWindowDays: number;
  failureAction: 'DISABLE_SCHEDULED_EXECUTION';
}>;

export type EnvelopeCoverageEvaluationGate = Readonly<{
  evaluationStatus: 'NOT_MEASURED' | 'MEASURED';
  contractVersion: string | null;
  scheduledEligible: boolean;
  reason: string;
}>;

/**
 * IPD-002 intentionally remains unapproved. This typed seam makes every
 * required product decision explicit and keeps schedule activation fail
 * closed until an owner checks in a complete, versioned contract.
 */
export const APPROVED_ENVELOPE_COVERAGE_EVALUATION_CONTRACT:
  EnvelopeCoverageEvaluationContract | null = null;

export function validateEnvelopeCoverageEvaluationContract(
  contract: EnvelopeCoverageEvaluationContract,
): string[] {
  const issues: string[] = [];
  if (!contract.version.trim()) issues.push('version is required');
  if (!contract.fixtureCorpusVersion.trim()) issues.push('fixtureCorpusVersion is required');
  if (!contract.baselineVersion.trim()) issues.push('baselineVersion is required');
  if (!(contract.minimumCoverageRatio > 0 && contract.minimumCoverageRatio <= 1)) {
    issues.push('minimumCoverageRatio must be greater than 0 and at most 1');
  }
  if (!Number.isInteger(contract.minimumSampleSize) || contract.minimumSampleSize < 1) {
    issues.push('minimumSampleSize must be a positive integer');
  }
  if (!Number.isInteger(contract.measurementWindowDays) || contract.measurementWindowDays < 1) {
    issues.push('measurementWindowDays must be a positive integer');
  }
  if (contract.failureAction !== 'DISABLE_SCHEDULED_EXECUTION') {
    issues.push('failureAction must fail closed');
  }
  return issues;
}

export function envelopeCoverageEvaluationGate(): EnvelopeCoverageEvaluationGate {
  const contract = APPROVED_ENVELOPE_COVERAGE_EVALUATION_CONTRACT;
  if (!contract) {
    return {
      evaluationStatus: 'NOT_MEASURED',
      contractVersion: null,
      scheduledEligible: false,
      reason: 'IPD-002 has no approved versioned evaluation contract',
    };
  }
  const issues = validateEnvelopeCoverageEvaluationContract(contract);
  return issues.length > 0
    ? {
      evaluationStatus: 'NOT_MEASURED',
      contractVersion: contract.version,
      scheduledEligible: false,
      reason: `evaluation contract ${contract.version} is invalid: ${issues.join('; ')}`,
    }
    : {
      evaluationStatus: 'NOT_MEASURED',
      contractVersion: contract.version,
      scheduledEligible: false,
      reason: `evaluation contract ${contract.version} is valid but has not been measured against its fixture corpus`,
    };
}
