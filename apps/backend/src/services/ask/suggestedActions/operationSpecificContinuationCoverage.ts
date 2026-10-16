// Ask Cozy Suggested Next Actions plan §17: executable inventory for operation-specific continuation coverage.
//
// This ledger is deliberately conservative. Generic curated starters, profile prompts, cross-domain urgent work and capability
// discovery do not prove that the operation which produced the current answer owns a useful continuation. Recovery-only outcomes
// likewise do not prove settled-result coverage. An operation moves out of MIGRATION_REQUIRED only with code-traced evidence here.
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';
import { RESULT_OWNERSHIP_RELATIONSHIPS } from './suggestedNextActionExactFourRegistry';

export const OPERATION_SPECIFIC_CONTINUATION_COVERAGE_CLASSES = [
  'CUSTOM_GOVERNED',
  'CUSTOM_CONTEXTUAL',
  'EXEMPT',
  'MIGRATION_REQUIRED',
] as const;
export type OperationSpecificContinuationCoverageClass = typeof OPERATION_SPECIFIC_CONTINUATION_COVERAGE_CLASSES[number];

export interface OperationSpecificContinuationCoverageEntry {
  operationId: AskOperationId;
  coverageClass: OperationSpecificContinuationCoverageClass;
  evidence: string;
}

/**
 * Reviewed response-level surfaces whose own typed controls are the custom continuation experience. Keep this list narrow: nested
 * entity controls do not qualify, and a generic exact-four footer does not qualify. Each addition needs a handler/result test.
 */
export const REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS: Readonly<Record<string, string>> = Object.freeze({
  SEASONAL_HOME_CARE: 'seasonal-home-care-next owns checklist setup, exact-task walkthrough and home-detail continuation',
  HOME_HABITS: 'home-habits-next owns exact habit workflow actions and is pinned by the Home Habits presentation tests',
});

/** Only state/scope categories for which operation-specific property continuation is not meaningful. */
export const OPERATION_SPECIFIC_CONTINUATION_EXEMPTIONS: Readonly<Record<string, string>> = Object.freeze({
  CAPABILITY_DISCOVERY: 'Property-less capability discovery is itself the navigation surface.',
  EMERGENCY_BOUNDARY: 'Emergency responses show only safety controls and safe recovery.',
  UNSAFE_RESTRICTED_BOUNDARY: 'Restricted responses show only policy-safe alternatives.',
  OUT_OF_SCOPE_BOUNDARY: 'Out-of-scope responses do not invent a property workflow.',
  GROUNDED_GUIDANCE: 'Property-less general guidance has no selected-home operation result to continue.',
});

const RECOVERY_ONLY_OUTCOMES = new Set(['RESTART_AFTER_EXPIRY']);

export function governedOperationSpecificOutcomes(operationId: AskOperationId): readonly string[] {
  return (RESULT_OWNERSHIP_RELATIONSHIPS[operationId] ?? []).filter((key) => {
    const outcome = key.slice(key.indexOf(':') + 1);
    return !RECOVERY_ONLY_OUTCOMES.has(outcome);
  });
}

export function classifyOperationSpecificContinuation(operationId: AskOperationId): OperationSpecificContinuationCoverageEntry {
  const definition = ASK_OPERATION_DEFINITIONS[operationId];
  const contextual = REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS[operationId];
  if (contextual) return { operationId, coverageClass: 'CUSTOM_CONTEXTUAL', evidence: contextual };

  const governed = governedOperationSpecificOutcomes(operationId);
  if (governed.length) {
    return {
      operationId,
      coverageClass: 'CUSTOM_GOVERNED',
      evidence: `Registered current-result outcomes: ${governed.join(', ')}`,
    };
  }

  const exemption = OPERATION_SPECIFIC_CONTINUATION_EXEMPTIONS[operationId];
  if (exemption) return { operationId, coverageClass: 'EXEMPT', evidence: exemption };

  return {
    operationId,
    coverageClass: 'MIGRATION_REQUIRED',
    evidence: `${definition.family} via ${definition.adapterKey} has no reviewed operation-specific continuation yet.`,
  };
}

export function buildOperationSpecificContinuationCoverage(): OperationSpecificContinuationCoverageEntry[] {
  return (Object.keys(ASK_OPERATION_DEFINITIONS) as AskOperationId[]).sort().map(classifyOperationSpecificContinuation);
}

/** Strict completion gate. It intentionally remains non-empty until every applicable operation has been migrated. */
export function validateOperationSpecificContinuationCoverage(): string[] {
  const registered = new Set(Object.keys(ASK_OPERATION_DEFINITIONS));
  const issues: string[] = [];
  for (const operationId of Object.keys(REVIEWED_CONTEXTUAL_CONTINUATION_OPERATIONS)) {
    if (!registered.has(operationId)) issues.push(`${operationId}: contextual continuation evidence outlived the operation`);
  }
  for (const operationId of Object.keys(OPERATION_SPECIFIC_CONTINUATION_EXEMPTIONS)) {
    if (!registered.has(operationId)) issues.push(`${operationId}: continuation exemption outlived the operation`);
  }
  for (const entry of buildOperationSpecificContinuationCoverage()) {
    if (entry.coverageClass === 'MIGRATION_REQUIRED') issues.push(`${entry.operationId}: operation-specific continuation required`);
  }
  return issues;
}

