import type { HomeAction } from '../productFramework';
import { checkRolloutStatus } from '../middleware/rollout.middleware';
import { prisma } from '../lib/prisma';
import { recordOrchestrationEvent } from './orchestrationEvent.service';
import { emitNorthStarLineageEvent } from './analytics';

export const COVERAGE_ACTION_POLICY_VERSION = 'coverage-action-lifecycle-v1';

export type CoverageDependencyStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'DISABLED'
  | 'UNKNOWN';

const DEPENDENCY_STATUSES = new Set<CoverageDependencyStatus>([
  'HEALTHY',
  'DEGRADED',
  'UNAVAILABLE',
  'DISABLED',
  'UNKNOWN',
]);

function dependencyStatus(
  value: string | undefined,
  fallback: CoverageDependencyStatus
): CoverageDependencyStatus {
  const normalized = value?.trim().toUpperCase() as CoverageDependencyStatus | undefined;
  return normalized && DEPENDENCY_STATUSES.has(normalized) ? normalized : fallback;
}

export function coverageActionPromotionDecision(input: {
  rolloutEnabled: boolean;
  killSwitchEnabled: boolean;
  ruleSourceStatus: CoverageDependencyStatus;
}) {
  const blockers: string[] = [];
  if (!input.rolloutEnabled) blockers.push('ROLLOUT_DISABLED');
  if (!input.killSwitchEnabled) blockers.push('ACTION_KILL_SWITCH_ACTIVE');
  if (input.ruleSourceStatus !== 'HEALTHY') {
    blockers.push(`RULE_SOURCE_${input.ruleSourceStatus}`);
  }
  return { enabled: blockers.length === 0, blockers };
}

function appendLaunchContext(href: string, action: HomeAction) {
  if (!href.startsWith('/dashboard/')) return href;
  const [path, query = ''] = href.split('?', 2);
  const params = new URLSearchParams(query);
  params.set('sourceActionId', action.id);
  params.set('coverageReviewId', action.source.entityId);
  if (path.includes('/coverage-intelligence') && !params.has('stage')) {
    params.set('stage', 'questions');
  }
  return `${path}?${params.toString()}`;
}

export function applyCoverageActionLifecyclePolicy(
  actions: HomeAction[],
  input: {
    rolloutEnabled: boolean;
    killSwitchEnabled: boolean;
    ruleSourceStatus: CoverageDependencyStatus;
  }
) {
  const decision = coverageActionPromotionDecision(input);
  let suppressedCount = 0;
  const governed = actions.flatMap((action) => {
    if (action.source.kind !== 'COVERAGE') return [action];
    if (!decision.enabled) {
      suppressedCount += 1;
      return [];
    }
    return [{
      ...action,
      source: { ...action.source, version: action.source.version ?? COVERAGE_ACTION_POLICY_VERSION },
      primaryCta: {
        ...action.primaryCta,
        href: appendLaunchContext(action.primaryCta.href, action),
      },
      secondaryCtas: action.secondaryCtas.map((cta) => ({
        ...cta,
        href: appendLaunchContext(cta.href, action),
      })),
    }];
  });
  return { actions: governed, suppressedCount, decision };
}

export function coverageActionRuntimePolicy(
  userId: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const rollout = checkRolloutStatus('COVERAGE_INTELLIGENCE', userId);
  return {
    rollout,
    killSwitchEnabled: env.COVERAGE_ACTIONS_ENABLED?.trim().toLowerCase() !== 'false',
    ruleSourceStatus: dependencyStatus(env.COVERAGE_RULE_SOURCE_STATUS, 'HEALTHY'),
  };
}

export async function getCoverageOperationsHealth(
  env: NodeJS.ProcessEnv = process.env
) {
  const rollout = checkRolloutStatus('COVERAGE_INTELLIGENCE');
  const killSwitchEnabled = env.COVERAGE_ACTIONS_ENABLED?.trim().toLowerCase() !== 'false';
  const ruleSourceStatus = dependencyStatus(env.COVERAGE_RULE_SOURCE_STATUS, 'HEALTHY');
  const benchmarkStatus = dependencyStatus(env.COVERAGE_BENCHMARK_SOURCE_STATUS, 'DISABLED');
  const partnerEnabled = env.COVERAGE_PARTNER_HANDOFF_ENABLED?.trim().toLowerCase() === 'true';
  const approvedPartnerCount = partnerEnabled
    ? await prisma.insuranceHandoffRecipient.count({
        where: {
          isActive: true,
          licensingReviewStatus: 'APPROVED',
          operatingModelStatus: 'APPROVED',
          privacyReviewStatus: 'APPROVED',
          quoteIngestionEnabled: true,
          supportedJurisdictions: { isEmpty: false },
          licensingDisclosure: { not: '' },
          commercialDisclosure: { not: '' },
          compensationDisclosure: { not: '' },
          marketScopeDisclosure: { not: '' },
          rankingDisclosure: { not: '' },
          fulfillmentSlaHours: { gt: 0 },
          effectiveAt: { lte: new Date() },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      })
    : 0;
  const partnerStatus: CoverageDependencyStatus = !partnerEnabled
    ? 'DISABLED'
    : approvedPartnerCount > 0
      ? 'HEALTHY'
      : 'UNAVAILABLE';
  const promotion = coverageActionPromotionDecision({
    rolloutEnabled: rollout.enabled,
    killSwitchEnabled,
    ruleSourceStatus,
  });
  return {
    contractVersion: 'coverage-operations-health-v1',
    capabilityId: 'coverage-intelligence',
    rollout,
    actionPromotion: {
      status: promotion.enabled ? 'HEALTHY' as const : 'DISABLED' as const,
      blockers: promotion.blockers,
      policyVersion: COVERAGE_ACTION_POLICY_VERSION,
    },
    dependencies: {
      reviewedRules: { status: ruleSourceStatus },
      benchmark: { status: benchmarkStatus },
      partner: { status: partnerStatus, approvedRecipientCount: approvedPartnerCount },
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function resolveCoverageHomeActionFromDecision(input: {
  propertyId: string;
  userId: string;
  sourceActionId: string | null | undefined;
  decisionId: string;
}) {
  if (!input.sourceActionId) return { resolved: false as const, reason: 'NO_SOURCE_ACTION' };
  if (
    !input.sourceActionId.startsWith('coverage-review:') &&
    !input.sourceActionId.startsWith('guidance:')
  ) {
    return { resolved: false as const, reason: 'UNRECOGNIZED_SOURCE_ACTION' };
  }
  await recordOrchestrationEvent({
    propertyId: input.propertyId,
    actionKey: input.sourceActionId,
    actionType: 'USER_MARKED_COMPLETE',
    source: 'SYSTEM',
    createdBy: input.userId,
    payload: {
      completionKind: 'DECISION_RECORDED',
      coverageDecisionId: input.decisionId,
      policyVersion: COVERAGE_ACTION_POLICY_VERSION,
    },
  });
  const occurredAt = new Date();
  const lineage = {
    propertyId: input.propertyId,
    userId: input.userId,
    occurredAt,
    source: 'coverage_decision',
    entryId: `home:${input.propertyId}`,
    triggerId: `trigger:home-action:${input.sourceActionId}`,
    signalId: input.sourceActionId,
    actionId: input.sourceActionId,
    recommendationVersion: COVERAGE_ACTION_POLICY_VERSION,
    decisionId: input.decisionId,
    resolutionDisposition: 'COMPLETED' as const,
    resolutionReason: 'A durable coverage decision was recorded.',
    consequenceAcknowledged: true,
    unresolvedSafetyRequirement: false,
  };
  emitNorthStarLineageEvent({
    ...lineage,
    eventType: 'HOME_ACTION_RESOLUTION_RECORDED',
    verificationStatus: 'PENDING',
  });
  emitNorthStarLineageEvent({
    ...lineage,
    eventType: 'HOME_ACTION_OUTCOME_VERIFIED',
    verificationId: input.decisionId,
    outcomeId: input.decisionId,
    verificationStatus: 'VERIFIED',
  });
  return { resolved: true as const, actionId: input.sourceActionId };
}
