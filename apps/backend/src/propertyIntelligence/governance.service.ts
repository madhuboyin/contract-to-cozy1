import {
  IntelligenceSourceFamily,
  IntelligenceSourceReviewStatus,
  IntelligenceSourceRunStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { recordAdminAction } from '../services/adminAudit.service';
import {
  containsUnsupportedImpactLanguage,
  evaluateFamilyLaunchAuthorization,
  evaluateSourceFamilyLaunchGate,
  IntelligenceLaunchStage,
  IntelligenceLaunchThresholds,
  SourceFamilyLaunchMetrics,
  SourceFamilyLaunchPolicy,
  parseSourceFamilyLaunchPolicy,
} from './launchGovernance';
import { getIntelligenceSourceHealth } from './propertyIntelligence.service';
import { evaluateSourceActivation } from './sourceGovernance';
import {
  affectedPropertyIntelligencePropertyIds,
  emitSourceHealthChangesForProperties,
} from '../services/intelligence/sourceHealthImpact.service';

const FAMILY_SETTING_PREFIX = 'property-intelligence:family-gate';

function familySettingKey(environment: string, family: IntelligenceSourceFamily) {
  return `${FAMILY_SETTING_PREFIX}:${environment}:${family}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function duplicateCount(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
}

function sourceKeyFromEntityId(
  sourceType: string,
  sourceEntityId: string,
): string | null {
  if (sourceType !== 'INTELLIGENCE_OBSERVATION') return null;
  const separator = sourceEntityId.indexOf(':');
  return separator > 0 ? sourceEntityId.slice(0, separator) : null;
}

function sourceSnapshotKeys(value: unknown): Array<{ key: string; state: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const sources = (value as Record<string, unknown>).sources;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const source =
      record.source && typeof record.source === 'object' && !Array.isArray(record.source)
        ? record.source as Record<string, unknown>
        : {};
    return typeof source.key === 'string' && typeof record.state === 'string'
      ? [{ key: source.key, state: record.state }]
      : [];
  });
}

export async function getPropertyIntelligenceGovernanceReport(
  environment: string,
  windowDays = 30,
) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [
    sources,
    settings,
    briefingItems,
    localFeedback,
    quietDeliveries,
    assessments,
    intelligenceChanges,
    briefingNotifications,
  ] = await Promise.all([
    getIntelligenceSourceHealth(environment),
    prisma.systemSetting.findMany({
      where: { key: { startsWith: `${FAMILY_SETTING_PREFIX}:${environment}:` } },
    }),
    prisma.homeBriefingItem.findMany({
      where: {
        createdAt: { gte: since },
        propertyChange: { sourceType: 'INTELLIGENCE_OBSERVATION' },
      },
      select: {
        title: true,
        summary: true,
        actedAt: true,
        dismissedAt: true,
        notUsefulAt: true,
        canonicalActionId: true,
        canonicalAction: { select: { state: true, workKey: true } },
        canonicalEvent: { select: { idempotencyKey: true, id: true } },
        propertyChange: {
          select: {
            propertyId: true,
            sourceType: true,
            sourceEntityId: true,
            deduplicationKey: true,
          },
        },
      },
    }),
    prisma.propertyLocalObservationState.findMany({
      where: {
        updatedAt: { gte: since },
        disposition: { in: ['FOLLOWING', 'DISMISSED', 'NOT_RELEVANT'] },
      },
      select: {
        disposition: true,
        propertyMatch: {
          select: { observation: { select: { source: { select: { key: true } } } } },
        },
      },
    }),
    prisma.homeBriefingDelivery.findMany({
      where: { generatedAt: { gte: since }, itemCount: 0 },
      select: { sourceHealthSnapshot: true, quietReasonCodes: true },
    }),
    prisma.propertyImpactAssessment.findMany({
      where: { createdAt: { gte: since }, supersededAt: null },
      select: {
        boundedExplanation: true,
        propertyMatch: {
          select: { observation: { select: { source: { select: { key: true } } } } },
        },
      },
    }),
    prisma.propertyChange.findMany({
      where: {
        createdAt: { gte: since },
        sourceType: 'INTELLIGENCE_OBSERVATION',
      },
      select: {
        propertyId: true,
        sourceType: true,
        sourceEntityId: true,
        deduplicationKey: true,
      },
    }),
    prisma.notification.findMany({
      where: {
        createdAt: { gte: since },
        type: 'HOME_BRIEFING_DELIVERED',
        deduplicationKey: { not: null },
      },
      select: { deduplicationKey: true },
    }),
  ]);

  const sourceFamilyByKey = new Map(
    sources.map((source) => [source.key, source.family]),
  );
  const settingByFamily = new Map(
    settings.map((setting) => [
      setting.key.slice(setting.key.lastIndexOf(':') + 1),
      setting.value,
    ]),
  );

  const families = Object.values(IntelligenceSourceFamily);
  const report = families.map((family) => {
    const familySources = sources.filter((source) => source.family === family);
    const sourceKeys = new Set(familySources.map((source) => source.key));
    const familyItems = briefingItems.filter((item) => {
      const key = sourceKeyFromEntityId(
        item.propertyChange.sourceType,
        item.propertyChange.sourceEntityId,
      );
      return key != null && sourceKeys.has(key);
    });
    const responses = familyItems.filter((item) =>
      item.actedAt || item.dismissedAt || item.notUsefulAt);
    const usefulResponses = responses.filter((item) => !item.notUsefulAt);
    const actionEligible = familyItems.filter((item) => item.canonicalActionId);
    const followedThrough = actionEligible.filter((item) =>
      item.canonicalAction
      && ['REPORTED_COMPLETE', 'VERIFIED', 'CLOSED'].includes(
        item.canonicalAction.state,
      ));
    const feedback = localFeedback.filter((entry) =>
      sourceKeys.has(entry.propertyMatch.observation.source.key));
    const falsePositiveCount = feedback.filter((entry) =>
      entry.disposition === 'NOT_RELEVANT').length;
    const reviewedCoverages = familySources.flatMap((source) =>
      source.coverages.filter((coverage) => coverage.qaReviewedAt));
    const currentCoverages = reviewedCoverages.filter((coverage) =>
      coverage.health.state === 'CURRENT');
    const falseAllClearCount = quietDeliveries.reduce((count, delivery) =>
      count + (
        sourceSnapshotKeys(delivery.sourceHealthSnapshot).some((snapshot) =>
          sourceKeys.has(snapshot.key) && snapshot.state !== 'CURRENT')
        && !delivery.quietReasonCodes.includes(
          'NO_MATERIAL_CHANGES_WITH_DEGRADED_COVERAGE',
        )
          ? 1
          : 0
      ), 0);
    const unsupportedImpactLanguageCount =
      assessments.filter((assessment) =>
        sourceKeys.has(assessment.propertyMatch.observation.source.key)
        && containsUnsupportedImpactLanguage(assessment.boundedExplanation)).length
      + familyItems.filter((item) =>
        containsUnsupportedImpactLanguage(`${item.title} ${item.summary}`)).length;
    const familyChanges = intelligenceChanges.filter((change) => {
      const key = sourceKeyFromEntityId(change.sourceType, change.sourceEntityId);
      return key != null && sourceKeys.has(key);
    });
    const actionKeys = familyItems.flatMap((item) =>
      item.canonicalAction?.workKey ? [item.canonicalAction.workKey] : []);
    const eventKeys = familyItems.flatMap((item) =>
      item.canonicalEvent
        ? [item.canonicalEvent.idempotencyKey ?? item.canonicalEvent.id]
        : []);
    const operationalResponseBreaches = familySources.reduce((count, source) => {
      const policy = source.refreshPolicy as {
        operationalResponseMinutes?: number;
      };
      const thresholdMinutes = policy.operationalResponseMinutes ?? 240;
      return count + source.coverages.filter((coverage) =>
        coverage.lastFailureAt
        && (
          !coverage.lastSuccessfulRunAt
          || coverage.lastFailureAt > coverage.lastSuccessfulRunAt
        )
        && Date.now() - coverage.lastFailureAt.getTime()
          > thresholdMinutes * 60_000).length;
    }, 0);

    const metrics: SourceFamilyLaunchMetrics = {
      sourceCount: familySources.length,
      activationFailures: familySources.filter((source) =>
        !source.activation.enabled).length,
      currentCoveragePercent: reviewedCoverages.length > 0
        ? (currentCoverages.length / reviewedCoverages.length) * 100
        : 0,
      freshnessBreaches: reviewedCoverages.filter((coverage) =>
        ['STALE', 'UNAVAILABLE'].includes(coverage.health.state)).length,
      operationalResponseBreaches,
      briefingResponses: responses.length,
      usefulnessRate: ratio(usefulResponses.length, responses.length),
      actionEligibleItems: actionEligible.length,
      actionFollowThroughRate: ratio(
        followedThrough.length,
        actionEligible.length,
      ),
      localFeedbackCount: feedback.length,
      falsePositiveRate: ratio(falsePositiveCount, feedback.length),
      falseAllClearCount,
      unsupportedImpactLanguageCount,
      duplicateActionCount: duplicateCount(actionKeys),
      duplicateChangeCount: duplicateCount(
        familyChanges.map((change) =>
          `${change.propertyId}:${change.deduplicationKey}`),
      ),
      duplicateEventCount: duplicateCount(eventKeys),
      duplicateNotificationCount: duplicateCount(
        briefingNotifications.flatMap((notification) =>
          notification.deduplicationKey ? [notification.deduplicationKey] : []),
      ),
    };
    const policy = parseSourceFamilyLaunchPolicy(settingByFamily.get(family));
    return {
      family,
      environment,
      windowDays,
      policy,
      metrics,
      gate: evaluateSourceFamilyLaunchGate({ policy, metrics }),
      sourceKeys: [...sourceKeys],
    };
  });

  return {
    environment,
    windowDays,
    generatedAt: new Date(),
    families: report,
    launchBoundary:
      'Launch is gated per source family. A working route never substitutes for coverage, freshness, trust, usefulness, or operational readiness.',
    retirementBoundary:
      'Legacy models and flags are removable only when the owning source family is GENERAL, passes every gate, and has an approved migration or deletion runbook.',
  };
}

export async function reviewIntelligenceSourceFamilyGate(input: {
  family: IntelligenceSourceFamily;
  environment: string;
  stage: IntelligenceLaunchStage;
  safetyApproved: boolean;
  privacyApproved: boolean;
  hazardLanguageApproved: boolean;
  thresholds: IntelligenceLaunchThresholds;
  reviewNote: string;
  reviewerId: string;
}) {
  const candidatePolicy: SourceFamilyLaunchPolicy = {
    stage: input.stage,
    safetyApproved: input.safetyApproved,
    privacyApproved: input.privacyApproved,
    hazardLanguageApproved: input.hazardLanguageApproved,
    thresholds: input.thresholds,
  };
  if (input.stage === 'LIMITED' || input.stage === 'GENERAL') {
    const report = await getPropertyIntelligenceGovernanceReport(
      input.environment,
      30,
    );
    const family = report.families.find((entry) => entry.family === input.family);
    const gate = evaluateSourceFamilyLaunchGate({
      policy: candidatePolicy,
      metrics: family?.metrics ?? {
        sourceCount: 0,
        activationFailures: 0,
        currentCoveragePercent: 0,
        freshnessBreaches: 0,
        operationalResponseBreaches: 0,
        briefingResponses: 0,
        usefulnessRate: null,
        actionEligibleItems: 0,
        actionFollowThroughRate: null,
        localFeedbackCount: 0,
        falsePositiveRate: null,
        falseAllClearCount: 0,
        unsupportedImpactLanguageCount: 0,
        duplicateActionCount: 0,
        duplicateChangeCount: 0,
        duplicateEventCount: 0,
        duplicateNotificationCount: 0,
      },
    });
    if (!gate.pass) {
      throw new APIError(
        'The source family does not meet the requested launch-stage gate.',
        422,
        'INTELLIGENCE_FAMILY_GATE_FAILED',
        { issueCodes: gate.issueCodes },
      );
    }
  }
  const key = familySettingKey(input.environment, input.family);
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  const value = {
    stage: input.stage,
    safetyApproved: input.safetyApproved,
    privacyApproved: input.privacyApproved,
    hazardLanguageApproved: input.hazardLanguageApproved,
    thresholds: input.thresholds,
    reviewNote: input.reviewNote,
    reviewedBy: input.reviewerId,
    reviewedAt: new Date().toISOString(),
  };
  const setting = await prisma.$transaction(async (tx) => {
    const updated = await tx.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: json(value),
        description:
          'Property Intelligence source-family launch stage, reviews, and measurable thresholds.',
      },
      update: { value: json(value) },
    });
    await recordAdminAction({
      actorId: input.reviewerId,
      action: 'PROPERTY_INTELLIGENCE_FAMILY_GATE_REVIEW',
      entityType: 'IntelligenceSourceFamily',
      entityId: `${input.environment}:${input.family}`,
      capability: 'INTEGRATION_MANAGE',
      reason: input.reviewNote,
      disposition: input.stage,
      oldValues: existing?.value as Prisma.InputJsonValue | undefined,
      newValues: json(value),
    }, tx);
    return updated;
  });
  return {
    setting,
    policy: parseSourceFamilyLaunchPolicy(setting.value),
  };
}

export async function controlIntelligenceSource(input: {
  sourceKey: string;
  action: 'KILL_SWITCH' | 'RESUME' | 'ROLLBACK';
  reason: string;
  targetRunId?: string;
  actorId: string;
}) {
  const source = await prisma.intelligenceSource.findUnique({
    where: { key: input.sourceKey },
    include: { coverages: true },
  });
  if (!source) {
    throw new APIError(
      `Intelligence source ${input.sourceKey} was not found.`,
      404,
      'INTELLIGENCE_SOURCE_NOT_FOUND',
    );
  }
  let targetRun: { id: string; status: IntelligenceSourceRunStatus } | null = null;
  if (input.action === 'ROLLBACK') {
    targetRun = await prisma.intelligenceSourceRun.findFirst({
      where: { id: input.targetRunId, sourceId: source.id },
      select: { id: true, status: true },
    });
    if (
      !targetRun
      || (
        targetRun.status !== IntelligenceSourceRunStatus.SUCCEEDED
        && targetRun.status !== IntelligenceSourceRunStatus.PARTIAL
      )
    ) {
      throw new APIError(
        'Rollback requires a successful or partial run owned by this source.',
        422,
        'INTELLIGENCE_ROLLBACK_TARGET_INVALID',
      );
    }
  }
  if (input.action === 'RESUME') {
    const familySettings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: source.enabledEnvironments.map((environment) =>
            familySettingKey(environment, source.family)),
        },
      },
      select: { key: true, value: true },
    });
    const policyByEnvironment = new Map(
      familySettings.map((setting) => [setting.key, setting.value]),
    );
    const familyAuthorizationFailures = source.enabledEnvironments.flatMap(
      (environment) => evaluateFamilyLaunchAuthorization(
        parseSourceFamilyLaunchPolicy(
          policyByEnvironment.get(familySettingKey(environment, source.family)),
        ),
      ).reasonCodes,
    );
    const activationFailures = source.enabledEnvironments.flatMap((environment) =>
      evaluateSourceActivation({
        ...source,
        reviewedStatus: IntelligenceSourceReviewStatus.APPROVED,
        pausedAt: null,
      }, source.coverages, environment).reasonCodes.filter((reason) =>
        reason !== 'SOURCE_PAUSED' && reason !== 'SOURCE_NOT_APPROVED'));
    if (
      activationFailures.length > 0
      || familyAuthorizationFailures.length > 0
      || source.enabledEnvironments.length === 0
    ) {
      throw new APIError(
        'The source cannot resume until terms, environments, and reviewed coverage pass activation.',
        422,
        'INTELLIGENCE_SOURCE_RESUME_BLOCKED',
        {
          reasonCodes: [
            ...new Set([
              ...activationFailures,
              ...familyAuthorizationFailures,
            ]),
          ],
        },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const paused = input.action !== 'RESUME';
    const updated = await tx.intelligenceSource.update({
      where: { id: source.id },
      data: {
        reviewedStatus: paused
          ? IntelligenceSourceReviewStatus.PAUSED
          : IntelligenceSourceReviewStatus.APPROVED,
        pausedAt: paused ? new Date() : null,
        pauseReason: paused
          ? input.action === 'ROLLBACK'
            ? `Rollback containment to run ${targetRun?.id}: ${input.reason}`
            : input.reason
          : null,
      },
    });
    await recordAdminAction({
      actorId: input.actorId,
      action: `PROPERTY_INTELLIGENCE_SOURCE_${input.action}`,
      entityType: 'IntelligenceSource',
      entityId: source.id,
      capability: 'INTEGRATION_MANAGE',
      reason: input.reason,
      disposition: paused ? 'CONTAINED' : 'RESUMED',
      oldValues: json({
        reviewedStatus: source.reviewedStatus,
        pausedAt: source.pausedAt,
        pauseReason: source.pauseReason,
      }),
      newValues: json({
        reviewedStatus: updated.reviewedStatus,
        pausedAt: updated.pausedAt,
        pauseReason: updated.pauseReason,
        targetRunId: targetRun?.id ?? null,
      }),
      relatedRefs: targetRun ? { targetRunId: targetRun.id } : undefined,
    }, tx);
    return {
      source: updated,
      action: input.action,
      targetRunId: targetRun?.id ?? null,
      containmentBoundary:
        input.action === 'ROLLBACK'
          ? 'Rollback pauses homeowner visibility and ingestion. It does not rewrite historical observations; reviewed reprocessing is required before resume.'
          : null,
    };
  });
  const latestRun = await prisma.intelligenceSourceRun.findFirst({
    where: { sourceId: source.id },
    orderBy: { startedAt: 'desc' },
    select: { status: true, id: true },
  });
  const health = input.action !== 'RESUME' ? 'NOT_CONFIGURED'
    : latestRun?.status === IntelligenceSourceRunStatus.SUCCEEDED ? 'CURRENT'
      : latestRun?.status === IntelligenceSourceRunStatus.PARTIAL ? 'DEGRADED' : 'UNAVAILABLE';
  await emitSourceHealthChangesForProperties({
    propertyIds: await affectedPropertyIntelligencePropertyIds(source.id),
    sourceType: 'PROPERTY_INTELLIGENCE_SOURCE',
    sourceEntityId: source.key,
    sourceRevision: `${input.action}:${latestRun?.id ?? new Date().toISOString()}`,
    health,
  });
  return result;
}
