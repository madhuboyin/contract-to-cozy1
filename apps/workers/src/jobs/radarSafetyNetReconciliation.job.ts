import { prisma } from '../lib/prisma';
import { logger, type AppLogger } from '../lib/logger';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import {
  radarSourceRegistryService,
  resolveRadarRuntimeEnvironment,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRegistry.service';
import {
  listMatchingPropertyIdsForEventPage,
  type RadarPropertyPageResult,
} from '@worker-shared/modules/homeEventRadar/services/radarMatchDiscovery.service';
import {
  runMatchingForEvent,
} from '@worker-shared/services/homeEventRadarMatcher.service';
import type { WorkerRunResult } from '../lib/workerRunResult';

export const RADAR_SAFETY_NET_VERSION = 'radar-safety-net-v1';
export const RADAR_SAFETY_NET_MATERIAL_UPDATE_HOURS = 72;
export const RADAR_SAFETY_NET_MAX_DEAD_LETTER_RETRIES = 3;

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  return Math.min(maximum, Math.max(1, Number.parseInt(raw, 10)));
}

export function radarSafetyNetLimits(env: NodeJS.ProcessEnv = process.env) {
  return {
    eventLimit: boundedInteger(env.RADAR_SAFETY_NET_EVENT_LIMIT, 20, 100),
    propertyPageSize: boundedInteger(
      env.RADAR_SAFETY_NET_PROPERTY_PAGE_SIZE,
      100,
      500,
    ),
    coverageLimit: boundedInteger(
      env.RADAR_SAFETY_NET_COVERAGE_LIMIT,
      100,
      500,
    ),
    lifecycleLimit: boundedInteger(
      env.RADAR_SAFETY_NET_LIFECYCLE_LIMIT,
      500,
      2_000,
    ),
    failedClaimLimit: boundedInteger(
      env.RADAR_SAFETY_NET_FAILED_CLAIM_LIMIT,
      25,
      100,
    ),
  };
}

type MatchResult = {
  matched: number;
  skipped: number;
  failedPropertyIds: string[];
};

export type RadarSafetyNetResult = WorkerRunResult & {
  activeEventsExamined: number;
  eventClaimsExamined: number;
  eventClaimsReconciled: number;
  eventClaimsCurrent: number;
  coverageEvaluated: number;
  coverageCovered: number;
  failedClaimsRetried: number;
  lifecycleExpired: number;
  materialMarkersExpired: number;
  dryRun: boolean;
};

type RadarSafetyNetDeps = {
  db: any;
  listCandidates(
    eventId: string,
    revisionId: string,
    afterPropertyId: string | undefined,
    pageSize: number,
  ): Promise<RadarPropertyPageResult>;
  matchEvent(
    eventId: string,
    propertyIds: string[],
    revision?: {
      radarEventRevisionId?: string | null;
      revisionIdentity?: string | null;
      sourceRunId?: string | null;
      sourceDefinitionId?: string | null;
      correlationId?: string | null;
    },
  ): Promise<MatchResult>;
  coverageDecision: typeof radarSourceRegistryService.coverageDecision;
  now(): Date;
  env: NodeJS.ProcessEnv;
  logger: AppLogger;
};

const defaultDeps: RadarSafetyNetDeps = {
  db: prisma,
  listCandidates: listMatchingPropertyIdsForEventPage,
  matchEvent: runMatchingForEvent,
  coverageDecision:
    radarSourceRegistryService.coverageDecision.bind(
      radarSourceRegistryService,
    ),
  now: () => new Date(),
  env: process.env,
  logger,
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceFreshThrough(source: any): Date | null {
  return source.health?.dataFreshThrough
    ?? source.health?.lastSuccessAt
    ?? null;
}

function propertySelect() {
  return {
    id: true,
    city: true,
    state: true,
    zipCode: true,
    normalizedZipCode: true,
    countyFips: true,
    latitude: true,
    longitude: true,
    geographyVersion: true,
  };
}

async function reconcileCoverage(
  deps: RadarSafetyNetDeps,
  args: {
    propertyId?: string;
    dryRun: boolean;
    now: Date;
    limit: number;
  },
): Promise<{ evaluated: number; covered: number; failed: number }> {
  const runtimeEnvironment = resolveRadarRuntimeEnvironment(deps.env);
  const sources = await deps.db.radarSourceDefinition.findMany({
    where: {
      isEnabled: true,
      environments: { has: runtimeEnvironment },
    },
    orderBy: { id: 'asc' },
    include: {
      coverage: true,
      health: true,
    },
  });
  let evaluated = 0;
  let covered = 0;
  let failed = 0;

  for (const source of sources) {
    if (evaluated >= args.limit) break;
    const remaining = args.limit - evaluated;
    const staleBefore = new Date(
      args.now.getTime() - Math.max(60, source.freshnessSeconds) * 1_000,
    );
    const missing = await deps.db.property.findMany({
      where: {
        ...(args.propertyId ? { id: args.propertyId } : {}),
        radarCoverage: {
          none: { sourceDefinitionId: source.id },
        },
      },
      orderBy: { id: 'asc' },
      take: remaining,
      select: propertySelect(),
    });
    const missingIds = new Set(missing.map((property: any) => property.id));
    const staleRows = missing.length < remaining
      ? await deps.db.propertyRadarCoverage.findMany({
          where: {
            sourceDefinitionId: source.id,
            evaluatedAt: { lte: staleBefore },
            ...(args.propertyId ? { propertyId: args.propertyId } : {}),
            ...(missingIds.size > 0
              ? { propertyId: { notIn: [...missingIds] } }
              : {}),
          },
          orderBy: { evaluatedAt: 'asc' },
          take: remaining - missing.length,
          include: {
            property: { select: propertySelect() },
          },
        })
      : [];
    const properties = [
      ...missing,
      ...staleRows.map((row: any) => row.property),
    ];

    for (const property of properties) {
      evaluated += 1;
      try {
        const decision = deps.coverageDecision(source, property, args.now);
        if (decision.status === 'covered') covered += 1;
        if (!args.dryRun) {
          await deps.db.propertyRadarCoverage.upsert({
            where: {
              propertyId_sourceDefinitionId: {
                propertyId: property.id,
                sourceDefinitionId: source.id,
              },
            },
            create: {
              propertyId: property.id,
              sourceDefinitionId: source.id,
              status: decision.status,
              propertyGeographyVersion: property.geographyVersion,
              evaluatedAt: args.now,
              dataFreshThrough: sourceFreshThrough(source),
              detail: decision.detail,
              explanationJson: {
                evaluatorVersion: RADAR_SAFETY_NET_VERSION,
                matchedCoverageIds: decision.matchedCoverageIds,
              },
            },
            update: {
              status: decision.status,
              propertyGeographyVersion: property.geographyVersion,
              evaluatedAt: args.now,
              dataFreshThrough: sourceFreshThrough(source),
              detail: decision.detail,
              explanationJson: {
                evaluatorVersion: RADAR_SAFETY_NET_VERSION,
                matchedCoverageIds: decision.matchedCoverageIds,
              },
            },
          });
        }
      } catch (error) {
        failed += 1;
        deps.logger.error(
          { err: error, propertyId: property.id, sourceDefinitionId: source.id },
          '[RADAR-SAFETY-NET] Coverage evaluation failed',
        );
      }
    }
  }
  return { evaluated, covered, failed };
}

async function retryFailedPropertyClaims(
  deps: RadarSafetyNetDeps,
  args: {
    propertyId?: string;
    dryRun: boolean;
    now: Date;
    limit: number;
  },
): Promise<{ examined: number; retried: number; failed: number }> {
  const retryBefore = new Date(args.now.getTime() - 60 * 60 * 1_000);
  const claims = await deps.db.domainEvent.findMany({
    where: {
      type: 'RADAR_PROPERTY_RECONCILIATION_REQUESTED',
      status: 'DEAD_LETTER',
      updatedAt: { lte: retryBefore },
      ...(args.propertyId ? { propertyId: args.propertyId } : {}),
    },
    orderBy: { updatedAt: 'asc' },
    take: args.limit,
  });
  let retried = 0;
  let failed = 0;
  for (const claim of claims) {
    const payload = jsonObject(claim.payload);
    const retryCount = Number(payload.safetyNetRetryCount ?? 0);
    if (
      !Number.isInteger(retryCount)
      || retryCount >= RADAR_SAFETY_NET_MAX_DEAD_LETTER_RETRIES
    ) {
      continue;
    }
    try {
      retried += 1;
      if (!args.dryRun) {
        await deps.db.domainEvent.update({
          where: { id: claim.id },
          data: {
            status: 'PENDING',
            attempts: 0,
            lastError: null,
            processedAt: null,
            payload: {
              ...payload,
              safetyNetRetryCount: retryCount + 1,
              safetyNetRetriedAt: args.now.toISOString(),
              safetyNetPreviousAttempts: claim.attempts,
            },
          },
        });
      }
    } catch (error) {
      failed += 1;
      deps.logger.error(
        { err: error, domainEventId: claim.id },
        '[RADAR-SAFETY-NET] Failed to release a dead-letter claim',
      );
    }
  }
  return { examined: claims.length, retried, failed };
}

async function expireLifecycleRecords(
  deps: RadarSafetyNetDeps,
  args: {
    propertyId?: string;
    dryRun: boolean;
    now: Date;
    limit: number;
  },
): Promise<{
  examined: number;
  lifecycleExpired: number;
  materialExpired: number;
  failed: number;
}> {
  const visibilityRows = await deps.db.propertyRadarMatch.findMany({
    where: {
      isVisible: true,
      visibleUntil: { lte: args.now },
      ...(args.propertyId ? { propertyId: args.propertyId } : {}),
    },
    orderBy: { visibleUntil: 'asc' },
    take: args.limit,
    select: { id: true },
  });
  const materialCutoff = new Date(
    args.now.getTime()
      - RADAR_SAFETY_NET_MATERIAL_UPDATE_HOURS * 60 * 60 * 1_000,
  );
  const materialRows = await deps.db.propertyRadarMatch.findMany({
    where: {
      isMaterialUpdate: true,
      materialUpdatedAt: { lte: materialCutoff },
      ...(args.propertyId ? { propertyId: args.propertyId } : {}),
    },
    orderBy: { materialUpdatedAt: 'asc' },
    take: args.limit,
    select: { id: true },
  });
  if (args.dryRun) {
    return {
      examined: visibilityRows.length + materialRows.length,
      lifecycleExpired: visibilityRows.length,
      materialExpired: materialRows.length,
      failed: 0,
    };
  }
  try {
    if (visibilityRows.length > 0) {
      await deps.db.propertyRadarMatch.updateMany({
        where: { id: { in: visibilityRows.map((row: any) => row.id) } },
        data: { isVisible: false },
      });
    }
    if (materialRows.length > 0) {
      await deps.db.propertyRadarMatch.updateMany({
        where: { id: { in: materialRows.map((row: any) => row.id) } },
        data: { isMaterialUpdate: false },
      });
    }
    return {
      examined: visibilityRows.length + materialRows.length,
      lifecycleExpired: visibilityRows.length,
      materialExpired: materialRows.length,
      failed: 0,
    };
  } catch (error) {
    deps.logger.error(
      { err: error },
      '[RADAR-SAFETY-NET] Lifecycle expiration failed',
    );
    return {
      examined: visibilityRows.length + materialRows.length,
      lifecycleExpired: 0,
      materialExpired: 0,
      failed: 1,
    };
  }
}

async function reconcileActiveEvents(
  deps: RadarSafetyNetDeps,
  args: {
    propertyId?: string;
    dryRun: boolean;
    now: Date;
    eventLimit: number;
    propertyPageSize: number;
  },
): Promise<{
  events: number;
  claims: number;
  reconciled: number;
  current: number;
  failed: number;
}> {
  const events = await deps.db.radarEvent.findMany({
    where: { status: { in: ['active', 'updated'] } },
    orderBy: [
      { safetyNetEvaluatedAt: { sort: 'asc', nulls: 'first' } },
      { id: 'asc' },
    ],
    take: args.eventLimit,
    select: {
      id: true,
      sourceDefinitionId: true,
      sourceRunId: true,
      safetyNetRevisionId: true,
      safetyNetAfterPropertyId: true,
      revisions: {
        orderBy: [
          { observedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: {
          id: true,
          revisionIdentity: true,
          sourceRunId: true,
        },
      },
    },
  });
  let claims = 0;
  let reconciled = 0;
  let current = 0;
  let failed = 0;

  for (const event of events) {
    const revision = event.revisions?.[0] ?? null;
    if (!revision) {
      failed += 1;
      if (!args.dryRun && !args.propertyId) {
        await deps.db.radarEvent.update({
          where: { id: event.id },
          data: {
            safetyNetStatus: 'failed',
            safetyNetEvaluatedAt: args.now,
            safetyNetLastError: 'Active event has no immutable revision',
            safetyNetFailureCount: { increment: 1 },
          },
        });
      }
      continue;
    }

    let candidateResult: RadarPropertyPageResult;
    const afterPropertyId =
      event.safetyNetRevisionId === revision.id
        ? event.safetyNetAfterPropertyId ?? undefined
        : undefined;
    try {
      candidateResult = args.propertyId
        ? {
            outcome: 'ready',
            propertyIds: [args.propertyId],
            nextCursor: null,
          }
        : await deps.listCandidates(
            event.id,
            revision.id,
            afterPropertyId,
            args.propertyPageSize,
          );
      if (candidateResult.outcome !== 'ready') {
        throw new Error(`Candidate discovery returned ${candidateResult.outcome}`);
      }

      const matches = candidateResult.propertyIds.length > 0
        ? await deps.db.propertyRadarMatch.findMany({
            where: {
              radarEventId: event.id,
              propertyId: { in: candidateResult.propertyIds },
            },
            select: {
              propertyId: true,
              lastEventRevisionId: true,
              propertyGeographyVersion: true,
              lastEvaluatedAt: true,
              lifecycleStatus: true,
              property: {
                select: { geographyVersion: true },
              },
            },
          })
        : [];
      const byProperty = new Map(
        matches.map((match: any) => [match.propertyId, match]),
      );
      let pageFailed = false;
      for (const propertyId of candidateResult.propertyIds) {
        claims += 1;
        const match: any = byProperty.get(propertyId);
        const needsEvaluation =
          !match
          || match.lastEventRevisionId !== revision.id
          || match.lastEvaluatedAt == null
          || match.propertyGeographyVersion !== match.property.geographyVersion;
        if (!needsEvaluation) {
          current += 1;
          continue;
        }
        if (args.dryRun) {
          reconciled += 1;
          continue;
        }
        try {
          const result = await deps.matchEvent(
            event.id,
            [propertyId],
            {
              radarEventRevisionId: revision.id,
              revisionIdentity: revision.revisionIdentity,
              sourceRunId: revision.sourceRunId ?? event.sourceRunId,
              sourceDefinitionId: event.sourceDefinitionId,
              correlationId:
                `radar-safety-net:${event.id}:${revision.id}:${args.now.toISOString()}`,
            },
          );
          if (
            result.skipped > 0
            || result.failedPropertyIds.includes(propertyId)
          ) {
            throw new Error(`Property match failed for ${propertyId}`);
          }
          reconciled += 1;
        } catch (error) {
          pageFailed = true;
          failed += 1;
          deps.logger.error(
            { err: error, radarEventId: event.id, propertyId },
            '[RADAR-SAFETY-NET] Property claim failed',
          );
        }
      }

      if (!args.dryRun && !args.propertyId) {
        await deps.db.radarEvent.update({
          where: { id: event.id },
          data: pageFailed
            ? {
                safetyNetStatus: 'failed',
                safetyNetRevisionId: revision.id,
                safetyNetEvaluatedAt: args.now,
                safetyNetLastError: 'One or more property claims failed',
                safetyNetFailureCount: { increment: 1 },
              }
            : {
                safetyNetStatus: candidateResult.nextCursor
                  ? 'in_progress'
                  : 'complete',
                safetyNetRevisionId: revision.id,
                safetyNetAfterPropertyId: candidateResult.nextCursor,
                safetyNetEvaluatedAt: args.now,
                safetyNetLastError: null,
                safetyNetFailureCount: 0,
              },
        });
      }
    } catch (error) {
      failed += 1;
      deps.logger.error(
        { err: error, radarEventId: event.id },
        '[RADAR-SAFETY-NET] Event reconciliation failed',
      );
      if (!args.dryRun && !args.propertyId) {
        await deps.db.radarEvent.update({
          where: { id: event.id },
          data: {
            safetyNetStatus: 'failed',
            safetyNetRevisionId: revision.id,
            safetyNetEvaluatedAt: args.now,
            safetyNetLastError: (
              error instanceof Error ? error.message : String(error)
            ).slice(0, 1_000),
            safetyNetFailureCount: { increment: 1 },
          },
        });
      }
    }
  }
  return { events: events.length, claims, reconciled, current, failed };
}

export async function radarSafetyNetReconciliationJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: RadarSafetyNetDeps = defaultDeps,
): Promise<RadarSafetyNetResult> {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[RADAR-SAFETY-NET] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const now = deps.now();
  const limits = radarSafetyNetLimits(deps.env);

  const lifecycle = await expireLifecycleRecords(deps, {
    propertyId: opts?.propertyId,
    dryRun,
    now,
    limit: limits.lifecycleLimit,
  });
  const failedClaims = await retryFailedPropertyClaims(deps, {
    propertyId: opts?.propertyId,
    dryRun,
    now,
    limit: limits.failedClaimLimit,
  });
  const coverage = await reconcileCoverage(deps, {
    propertyId: opts?.propertyId,
    dryRun,
    now,
    limit: limits.coverageLimit,
  });
  const activeEvents = await reconcileActiveEvents(deps, {
    propertyId: opts?.propertyId,
    dryRun,
    now,
    eventLimit: limits.eventLimit,
    propertyPageSize: limits.propertyPageSize,
  });

  const failed =
    lifecycle.failed
    + failedClaims.failed
    + coverage.failed
    + activeEvents.failed;
  const examined =
    lifecycle.examined
    + failedClaims.examined
    + coverage.evaluated
    + activeEvents.events
    + activeEvents.claims;
  const refreshed =
    lifecycle.lifecycleExpired
    + lifecycle.materialExpired
    + failedClaims.retried
    + coverage.evaluated
    + activeEvents.reconciled;
  return {
    examined,
    refreshed,
    failed,
    skipped: activeEvents.current,
    reason: failed > 0
      ? `${failed} Radar safety-net operation(s) failed`
      : undefined,
    activeEventsExamined: activeEvents.events,
    eventClaimsExamined: activeEvents.claims,
    eventClaimsReconciled: activeEvents.reconciled,
    eventClaimsCurrent: activeEvents.current,
    coverageEvaluated: coverage.evaluated,
    coverageCovered: coverage.covered,
    failedClaimsRetried: failedClaims.retried,
    lifecycleExpired: lifecycle.lifecycleExpired,
    materialMarkersExpired: lifecycle.materialExpired,
    dryRun,
  };
}
