export const NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE =
  'No matching permit was found in the records currently available to Contract to Cozy. This does not establish that the work was unpermitted or unlawful.';

export type RetroactiveDispositionInput = {
  currentStatus: string;
  nextStatus?: string;
  resolvedByPermitId?: string | null;
  remediationCaseId?: string | null;
  resolutionNotes?: string | null;
  evidenceDocumentIds?: string[];
  researchChannel?: string | null;
  researchSourceReference?: string | null;
  authorityOutcome?: string | null;
  authorityObservedAt?: string | Date | null;
};

const TERMINAL_STATUSES = new Set([
  'CONFIRMED_PERMITTED',
  'CONFIRMED_UNPERMITTED',
  'REMEDIATED',
  'DISMISSED',
]);

export function validateRetroactiveDisposition(
  input: RetroactiveDispositionInput,
): string[] {
  const nextStatus = input.nextStatus ?? input.currentStatus;
  if (nextStatus === 'WILL_REMEDIATE' && !input.remediationCaseId) {
    return ['Will remediate requires a linked remediation case.'];
  }
  if (!TERMINAL_STATUSES.has(nextStatus)) return [];

  const evidenceCount = input.evidenceDocumentIds?.length ?? 0;
  const hasSource = Boolean(input.researchSourceReference?.trim());
  const hasNotes = Boolean(input.resolutionNotes?.trim());

  if (nextStatus === 'CONFIRMED_PERMITTED') {
    return input.resolvedByPermitId
      || (
        input.authorityOutcome === 'CONFIRMED_PERMITTED'
        && input.researchChannel === 'MUNICIPAL_AUTHORITY'
        && hasSource
        && evidenceCount > 0
        && input.authorityObservedAt
      )
      ? []
      : ['Confirmed permitted requires a matched permit or documented municipal-authority evidence.'];
  }

  if (nextStatus === 'CONFIRMED_UNPERMITTED') {
    return input.authorityOutcome === 'CONFIRMED_UNPERMITTED'
      && input.researchChannel === 'MUNICIPAL_AUTHORITY'
      && hasSource
      && evidenceCount > 0
      && input.authorityObservedAt
      ? []
      : ['Confirmed unpermitted requires a documented determination from the municipal authority.'];
  }

  if (nextStatus === 'REMEDIATED') {
    return input.remediationCaseId && input.resolvedByPermitId && evidenceCount > 0
      ? []
      : ['Remediated requires a linked remediation case, resulting permit, and evidence.'];
  }

  return hasNotes && evidenceCount > 0
    ? []
    : ['Dismissal requires a rationale and supporting evidence.'];
}

export function evidenceConfidenceForFinding(input: {
  recordSearchOutcome: string;
  resolvedByPermitId?: string | null;
  evidenceDocumentIds?: string[];
  researchChannel?: string | null;
  researchSourceReference?: string | null;
  authorityOutcome?: string | null;
  authorityObservedAt?: string | Date | null;
}): 'LOW' | 'MEDIUM' | 'HIGH' | 'AUTHORITY_CONFIRMED' {
  if (
    input.resolvedByPermitId
    || (
      input.researchChannel === 'MUNICIPAL_AUTHORITY'
      && input.authorityOutcome
      && input.authorityOutcome !== 'UNKNOWN'
      && Boolean(input.researchSourceReference?.trim())
      && Boolean(input.authorityObservedAt)
      && (input.evidenceDocumentIds?.length ?? 0) > 0
    )
  ) {
    return 'AUTHORITY_CONFIRMED';
  }
  if ((input.evidenceDocumentIds?.length ?? 0) > 0) return 'HIGH';
  if (input.recordSearchOutcome !== 'NOT_SEARCHED') return 'MEDIUM';
  return 'LOW';
}

export function isHistoricalFindingOpen(status: string): boolean {
  return ['UNKNOWN', 'FLAGGED', 'INVESTIGATING', 'CONFIRMED_UNPERMITTED', 'WILL_REMEDIATE']
    .includes(status);
}
