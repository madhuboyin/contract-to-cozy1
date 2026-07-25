import type { ToolCapabilityDefinition } from './capability.contract';

export const CAPABILITY_GOVERNANCE_DEFINITION_ISSUES = [
  'MATERIAL_PROFESSIONAL_BOUNDARY_MISSING',
  'REGULATED_PROFESSIONAL_BOUNDARY_MISSING',
  'REGULATED_JURISDICTION_POLICY_MISSING',
  'SAFETY_FALLBACK_MISSING',
  'SAFETY_ESCALATION_MISSING',
  'COMMERCIAL_ACTION_MISMATCH',
  'COMMERCIAL_RELATIONSHIP_NOT_RECORDED',
  'COMMERCIAL_ALTERNATIVE_MISSING',
  'PRIVACY_CLASSIFICATION_TOO_LOW',
] as const;

export type CapabilityGovernanceDefinitionIssue =
  typeof CAPABILITY_GOVERNANCE_DEFINITION_ISSUES[number];

export type CapabilityGovernanceDefinitionValidation = {
  valid: boolean;
  issues: CapabilityGovernanceDefinitionIssue[];
};

const SENSITIVE_DATA_HINT =
  /coverage|document|inspection-report|insurance|tax|disclosure|violation|quote|warranty/i;
const HIGHLY_SENSITIVE_DATA_HINT =
  /trusted-contact|emergency-instruction|financ|mortgage|payment|project-contract|access-policy/i;

function privacySearchText(capability: ToolCapabilityDefinition): string {
  return [
    capability.id,
    capability.presentation.label,
    ...capability.productFramework.livingHomeRecordReads,
    ...capability.productFramework.livingHomeRecordWrites,
  ].join(' ');
}

export function validateCapabilityGovernanceDefinition(
  capability: ToolCapabilityDefinition,
): CapabilityGovernanceDefinitionValidation {
  const issues: CapabilityGovernanceDefinitionIssue[] = [];
  const governance = capability.governance;

  if (
    governance.safetyTier === 'MATERIAL_FINANCIAL'
    && !governance.professionalBoundary
  ) {
    issues.push('MATERIAL_PROFESSIONAL_BOUNDARY_MISSING');
  }
  if (governance.safetyTier === 'REGULATED_COVERAGE') {
    if (!governance.professionalBoundary) {
      issues.push('REGULATED_PROFESSIONAL_BOUNDARY_MISSING');
    }
    if (governance.jurisdictionPolicy === 'NOT_REQUIRED') {
      issues.push('REGULATED_JURISDICTION_POLICY_MISSING');
    }
  }
  if (governance.safetyTier === 'SAFETY_EMERGENCY') {
    if (!governance.conservativeFallback) {
      issues.push('SAFETY_FALLBACK_MISSING');
    }
    if (!governance.emergencyEscalation) {
      issues.push('SAFETY_ESCALATION_MISSING');
    }
  }

  const disclosure = governance.commercialDisclosure;
  if (
    governance.commercialAction
    !== (disclosure.relationshipType !== 'NONE')
  ) {
    issues.push('COMMERCIAL_ACTION_MISMATCH');
  }
  if (
    governance.commercialAction
    && disclosure.relationshipType === 'NOT_RECORDED'
  ) {
    issues.push('COMMERCIAL_RELATIONSHIP_NOT_RECORDED');
  }
  if (
    governance.commercialAction
    && !disclosure.nonCommercialAlternative
  ) {
    issues.push('COMMERCIAL_ALTERNATIVE_MISSING');
  }

  const privacyText = privacySearchText(capability);
  const minimumSensitivity = HIGHLY_SENSITIVE_DATA_HINT.test(privacyText)
    ? 'HIGHLY_SENSITIVE'
    : SENSITIVE_DATA_HINT.test(privacyText)
      ? 'SENSITIVE'
      : 'STANDARD';
  const sensitivityRank = {
    STANDARD: 0,
    SENSITIVE: 1,
    HIGHLY_SENSITIVE: 2,
  } as const;
  if (
    sensitivityRank[governance.privacy.dataSensitivity]
    < sensitivityRank[minimumSensitivity]
  ) {
    issues.push('PRIVACY_CLASSIFICATION_TOO_LOW');
  }

  return {
    valid: issues.length === 0,
    issues: Array.from(new Set(issues)),
  };
}
