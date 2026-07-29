import { ProjectRequirementApplicability } from '@prisma/client';

export type ProjectCompletionCheckStatus =
  | 'PASSED'
  | 'FAILED'
  | 'NOT_EVALUATED'
  | 'NOT_APPLICABLE'
  | 'WAIVED';

export function evaluateRequirementCompletionCheck(args: {
  key: string;
  label: string;
  applicability: ProjectRequirementApplicability;
  basis: string | null;
  requiredSatisfied: boolean;
  requiredBlockers: string[];
}) {
  if (args.applicability !== 'UNKNOWN' && !args.basis?.trim()) {
    return {
      key: args.key,
      label: `${args.label} applicability documented`,
      status: 'NOT_EVALUATED' as ProjectCompletionCheckStatus,
      passed: false,
      blockers: [`Add the source or rationale for the ${args.label.toLowerCase()} applicability decision.`],
    };
  }
  if (args.applicability === 'UNKNOWN') {
    return {
      key: args.key,
      label: `${args.label} applicability determined`,
      status: 'NOT_EVALUATED' as ProjectCompletionCheckStatus,
      passed: false,
      blockers: [`Record whether ${args.label.toLowerCase()} requirements apply and cite the source or rationale.`],
    };
  }
  if (args.applicability === 'NOT_APPLICABLE' || args.applicability === 'NOT_REQUIRED_CONFIRMED') {
    return {
      key: args.key,
      label: `${args.label} requirement resolved`,
      status: 'NOT_APPLICABLE' as ProjectCompletionCheckStatus,
      passed: true,
      blockers: [],
    };
  }
  if (args.applicability === 'WAIVED_WITH_ACKNOWLEDGMENT') {
    return {
      key: args.key,
      label: `${args.label} requirement waived with acknowledgment`,
      status: 'WAIVED' as ProjectCompletionCheckStatus,
      passed: true,
      blockers: [],
    };
  }
  return {
    key: args.key,
    label: args.label,
    status: args.requiredSatisfied ? 'PASSED' as const : 'FAILED' as const,
    passed: args.requiredSatisfied,
    blockers: args.requiredSatisfied ? [] : args.requiredBlockers,
  };
}
