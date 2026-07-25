import type { ToolCapabilityDefinition } from './capability.contract';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

export const CAPABILITY_COPY_POLICY_VERSION = 'capability-copy-policy-v1' as const;

const PROMOTIONAL_LANGUAGE = /\b(best|perfect|guaranteed?|exclusive|sponsored|risk[- ]free|zero risk|buy now|save big)\b/i;
const PRESSURE_LANGUAGE = /\b(act now|limited time|don't miss|must[- ]have|hurry)\b/i;
const APPROVED_TEMPLATE_PARAMETERS = new Set([
  'capabilityLabel',
  'sourceKind',
  'readinessState',
]);

export type CapabilityCopyIssue = {
  capabilityId: string;
  field: string;
  code:
    | 'PROMOTIONAL_LANGUAGE'
    | 'PRESSURE_LANGUAGE'
    | 'EXCLAMATION'
    | 'ALL_CAPS'
    | 'COPY_TOO_LONG'
    | 'UNAPPROVED_TEMPLATE_PARAMETER';
};

function reviewText(input: {
  capabilityId: string;
  field: string;
  value: string;
  maxWords: number;
  allowTemplates?: boolean;
}): CapabilityCopyIssue[] {
  const issues: CapabilityCopyIssue[] = [];
  const words = input.value.trim().split(/\s+/).filter(Boolean);
  const add = (code: CapabilityCopyIssue['code']) =>
    issues.push({
      capabilityId: input.capabilityId,
      field: input.field,
      code,
    });
  if (PROMOTIONAL_LANGUAGE.test(input.value)) add('PROMOTIONAL_LANGUAGE');
  if (PRESSURE_LANGUAGE.test(input.value)) add('PRESSURE_LANGUAGE');
  if (input.value.includes('!')) add('EXCLAMATION');
  if (
    input.value.length >= 8
    && /[A-Z]/.test(input.value)
    && input.value === input.value.toUpperCase()
  ) add('ALL_CAPS');
  if (words.length > input.maxWords) add('COPY_TOO_LONG');
  if (input.allowTemplates) {
    for (const match of input.value.matchAll(/\{\{([^}]+)\}\}/g)) {
      if (!APPROVED_TEMPLATE_PARAMETERS.has(match[1])) {
        add('UNAPPROVED_TEMPLATE_PARAMETER');
      }
    }
  }
  return issues;
}

function capabilityCopy(
  capability: ToolCapabilityDefinition,
): Array<{
  field: string;
  value: string;
  maxWords: number;
  allowTemplates?: boolean;
}> {
  return [
    {
      field: 'presentation.shortDescription',
      value: capability.presentation.shortDescription,
      maxWords: 35,
    },
    {
      field: 'presentation.longDescription',
      value: capability.presentation.longDescription,
      maxWords: 60,
    },
    {
      field: 'productFramework.homeownerOutcome',
      value: capability.productFramework.homeownerOutcome,
      maxWords: 35,
    },
    {
      field: 'recommendation.expectedOutcome',
      value: capability.recommendation.expectedOutcome,
      maxWords: 35,
    },
    {
      field: 'lifecycle.expectedOutput',
      value: capability.lifecycle.expectedOutput,
      maxWords: 35,
    },
    ...Object.entries(capability.recommendation.reasonTemplates)
      .map(([reasonCode, value]) => ({
        field: `recommendation.reasonTemplates.${reasonCode}`,
        value,
        maxWords: 45,
        allowTemplates: true,
      })),
    ...capability.recommendation.readinessRequirements.map(
      (requirement, index) => ({
        field: `recommendation.readinessRequirements.${index}.reason`,
        value: requirement.reason,
        maxWords: 35,
      }),
    ),
  ];
}

export function reviewCapabilityCopy(
  registry: ToolCapabilityRegistry,
  checkedAt = new Date(),
) {
  const capabilities = registry.capabilities.map((capability) => {
    const issues = capabilityCopy(capability).flatMap((copy) =>
      reviewText({
        capabilityId: capability.id,
        ...copy,
      }));
    return {
      capabilityId: capability.id,
      reviewedFieldCount: capabilityCopy(capability).length,
      passed: issues.length === 0,
      issues,
    };
  });
  const issues = capabilities.flatMap((capability) => capability.issues);
  return {
    contractVersion: 'capability-copy-review-v1' as const,
    policyVersion: CAPABILITY_COPY_POLICY_VERSION,
    checkedAt: checkedAt.toISOString(),
    registryVersion: registry.version,
    capabilityCount: registry.capabilities.length,
    reviewedFieldCount: capabilities.reduce(
      (sum, capability) => sum + capability.reviewedFieldCount,
      0,
    ),
    passed: issues.length === 0,
    capabilities,
    issues,
  };
}
