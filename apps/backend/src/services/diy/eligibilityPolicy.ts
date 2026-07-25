import type {
  DiyDecisionVerdict,
  DiyProjectCategory,
  DiySafetyLevel,
  PermitRequirementStatus,
} from '@prisma/client';

export type DiyEligibilityReason =
  | 'SAFETY_CONTEXT_UNKNOWN'
  | 'NOT_LOW_RISK'
  | 'PERMIT_CONTEXT_UNKNOWN'
  | 'REGULATED_WORK'
  | 'PROFESSIONAL_RECOMMENDED'
  | 'EXCLUDED_ELECTRICAL_WORK'
  | 'EXCLUDED_GAS_WORK'
  | 'EXCLUDED_STRUCTURAL_WORK'
  | 'EXCLUDED_ACTIVE_WATER_WORK'
  | 'EXCLUDED_HAZARDOUS_MATERIAL_WORK';

export type DiyEligibilityDecision = {
  eligible: boolean;
  reviewedLowRisk: boolean;
  reasonCodes: DiyEligibilityReason[];
};

type DiyEligibilityInput = {
  title: string;
  summary?: string | null;
  category: DiyProjectCategory;
  safetyLevel?: DiySafetyLevel | null;
  permitRequirement?: PermitRequirementStatus | null;
  verdict?: DiyDecisionVerdict | null;
  safetyWarnings?: string[];
};

const EXCLUDED_CONTENT: Array<{
  code: DiyEligibilityReason;
  pattern: RegExp;
}> = [
  {
    code: 'EXCLUDED_ELECTRICAL_WORK',
    pattern: /\b(main|service)(?:\s+electrical)?\s+panel\b|\bbreaker\s+panel\b|\bmeter\s+(base|socket)\b|\brewir(?:e|ing)\b|\bservice\s+entrance\b/i,
  },
  {
    code: 'EXCLUDED_GAS_WORK',
    pattern: /\bgas\s+(line|pipe|valve|connection|appliance)\b|\bpropane\s+(line|pipe|tank)\b/i,
  },
  {
    code: 'EXCLUDED_STRUCTURAL_WORK',
    pattern: /\bload[- ]bearing\b|\bstructural\s+(wall|beam|column|repair|change)\b|\bfoundation\s+(repair|crack|movement)\b/i,
  },
  {
    code: 'EXCLUDED_ACTIVE_WATER_WORK',
    pattern: /\bactive\s+(leak|flood|water)\b|\bburst\s+pipe\b|\bflood(?:ing|ed)?\b|\bsewage\s+(backup|spill)\b/i,
  },
  {
    code: 'EXCLUDED_HAZARDOUS_MATERIAL_WORK',
    pattern: /\basbestos\b|\blead\s+(paint|abatement|removal)\b|\bblack\s+mold\b|\bmold\s+remediation\b/i,
  },
];

const REVIEWED_NON_REGULATED_PERMITS = new Set<PermitRequirementStatus>([
  'NOT_REQUIRED',
  'LIKELY_NOT_REQUIRED',
]);

/**
 * The canonical fail-closed boundary for promoting or starting DIY work.
 * Property applicability is evaluated separately because ownership and
 * responsibility facts do not replace project safety review.
 */
export function evaluateDiyEligibility(input: DiyEligibilityInput): DiyEligibilityDecision {
  const reasonCodes: DiyEligibilityReason[] = [];
  const content = [
    input.title,
    input.summary,
    ...(input.safetyWarnings ?? []),
  ].filter(Boolean).join(' ');

  if (!input.safetyLevel) reasonCodes.push('SAFETY_CONTEXT_UNKNOWN');
  else if (input.safetyLevel !== 'LOW') reasonCodes.push('NOT_LOW_RISK');

  if (!input.permitRequirement) reasonCodes.push('PERMIT_CONTEXT_UNKNOWN');
  else if (!REVIEWED_NON_REGULATED_PERMITS.has(input.permitRequirement)) {
    reasonCodes.push(
      input.permitRequirement === 'UNKNOWN' || input.permitRequirement === 'DATA_UNAVAILABLE'
        ? 'PERMIT_CONTEXT_UNKNOWN'
        : 'REGULATED_WORK',
    );
  }

  if (
    input.verdict
    && input.verdict !== 'DIY_RECOMMENDED'
    && input.verdict !== 'BORDERLINE'
  ) {
    reasonCodes.push('PROFESSIONAL_RECOMMENDED');
  }

  for (const exclusion of EXCLUDED_CONTENT) {
    if (exclusion.pattern.test(content)) reasonCodes.push(exclusion.code);
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  return {
    eligible: uniqueReasonCodes.length === 0,
    reviewedLowRisk:
      input.safetyLevel === 'LOW'
      && Boolean(input.permitRequirement)
      && REVIEWED_NON_REGULATED_PERMITS.has(input.permitRequirement!),
    reasonCodes: uniqueReasonCodes,
  };
}
