import {
  GuidanceSeverity,
  GuidanceIssueDomain,
  GuidanceJourneyDTO,
  GuidanceNextStepResult,
  GuidanceStepDTO,
} from '@/lib/api/guidanceApi';
import {
  buildJourneySubtitle,
  buildJourneyTitle,
  resolveGuidanceStepHref,
} from './guidanceDisplay';

export type GuidanceActionModel = {
  journeyId: string;
  journey: GuidanceJourneyDTO;
  issueDomain: GuidanceIssueDomain;
  title: string;
  subtitle: string;
  executionReadiness: GuidanceJourneyDTO['executionReadiness'];
  severity: GuidanceSeverity | null;
  currentStep: GuidanceStepDTO | null;
  nextStep: GuidanceStepDTO | null;
  steps: GuidanceStepDTO[];
  href: string | null;
  blockedReason: string | null;
  warnings: string[];
  missingPrerequisites: Array<{ stepKey: string; label: string }>;
  progress: GuidanceJourneyDTO['progress'];
  isLowContext: boolean;
  priorityScore: number;
  priorityBucket: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityGroup: 'IMMEDIATE' | 'UPCOMING' | 'OPTIMIZATION';
  confidenceScore: number | null;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  financialImpactScore: number | null;
  fundingGapFlag: boolean;
  costOfDelay: number | null;
  coverageImpact: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN' | null;
  explanation: {
    what: string;
    why: string;
    risk: string;
    nextStep: string;
  } | null;
};

function resolveCurrentStep(journey: GuidanceJourneyDTO, next: GuidanceNextStepResult | null): GuidanceStepDTO | null {
  if (next?.currentStep) return next.currentStep;
  return journey.steps.find((step) => step.status === 'IN_PROGRESS' || step.status === 'PENDING' || step.status === 'BLOCKED') ?? null;
}

export function mapGuidanceJourneyToActionModel(args: {
  propertyId: string;
  journey: GuidanceJourneyDTO;
  next: GuidanceNextStepResult | null;
}): GuidanceActionModel {
  const currentStep = resolveCurrentStep(args.journey, args.next);
  const nextStep = args.next?.nextStep ?? currentStep;

  const href =
    nextStep
      ? resolveGuidanceStepHref({
          propertyId: args.propertyId,
          journey: args.journey,
          step: nextStep,
          next: args.next,
        })
      : null;

  return {
    journeyId: args.journey.id,
    journey: args.journey,
    issueDomain: args.journey.issueDomain,
    title: buildJourneyTitle(args.journey),
    subtitle: buildJourneySubtitle(args.journey, nextStep?.label ?? null),
    executionReadiness: args.journey.executionReadiness,
    severity: args.journey.primarySignal?.severity ?? null,
    currentStep,
    nextStep,
    steps: args.journey.steps,
    href,
    blockedReason: args.next?.blockedReason ?? currentStep?.blockedReason ?? null,
    warnings: args.next?.warnings ?? [],
    missingPrerequisites: args.next?.missingPrerequisites ?? [],
    progress: args.journey.progress,
    isLowContext: args.journey.isLowContext,
    priorityScore: args.next?.priorityScore ?? args.journey.priorityScore ?? 0,
    priorityBucket:
      args.next?.priorityBucket ?? args.journey.priorityBucket ?? 'MEDIUM',
    priorityGroup:
      args.next?.priorityGroup ?? args.journey.priorityGroup ?? 'UPCOMING',
    confidenceScore: args.next?.confidenceScore ?? args.journey.confidenceScore ?? null,
    confidenceLabel: args.next?.confidenceLabel ?? args.journey.confidenceLabel ?? null,
    financialImpactScore:
      args.next?.financialImpactScore ?? args.journey.financialImpactScore ?? null,
    fundingGapFlag:
      Boolean(args.next?.fundingGapFlag) || Boolean(args.journey.fundingGapFlag),
    costOfDelay: args.next?.costOfDelay ?? args.journey.costOfDelay ?? null,
    coverageImpact: args.next?.coverageImpact ?? args.journey.coverageImpact ?? null,
    explanation: args.next?.explanation ?? args.journey.explanation ?? null,
  };
}

export function filterGuidanceActions(
  actions: GuidanceActionModel[],
  filters?: {
    issueDomains?: readonly GuidanceIssueDomain[];
    toolKey?: string;
    limit?: number;
  }
): GuidanceActionModel[] {
  const issueDomainSet = filters?.issueDomains ? new Set(filters.issueDomains) : null;

  let filtered = actions.filter((action) => {
    if (issueDomainSet && !issueDomainSet.has(action.issueDomain)) return false;
    if (filters?.toolKey) {
      const hasToolStep = action.steps.some((step) => step.toolKey === filters.toolKey);
      if (!hasToolStep) return false;
    }
    return true;
  });

  filtered = filtered.sort((a, b) => {
    const priorityDiff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    const bucketRank = (value: GuidanceActionModel['priorityBucket']) => {
      if (value === 'HIGH') return 3;
      if (value === 'MEDIUM') return 2;
      return 1;
    };
    const bucketDiff = bucketRank(b.priorityBucket) - bucketRank(a.priorityBucket);
    if (bucketDiff !== 0) return bucketDiff;

    const blockedA = a.executionReadiness === 'NOT_READY' ? 1 : 0;
    const blockedB = b.executionReadiness === 'NOT_READY' ? 1 : 0;
    if (blockedA !== blockedB) return blockedA - blockedB;

    return b.progress.totalCount - a.progress.totalCount;
  });

  if (filters?.limit && filters.limit > 0) {
    return filtered.slice(0, filters.limit);
  }

  return filtered;
}
