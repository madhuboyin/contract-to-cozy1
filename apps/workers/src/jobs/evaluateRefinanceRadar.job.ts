import {
  RefinanceEvaluationClaimStatus,
  RefinanceRadarState,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RefinanceRadarService } from '@worker-shared/refinanceRadar/refinanceRadar.service';
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_DURABLE_ATTEMPTS = 8;

type EligibleProfile = {
  id: string;
  propertyId: string;
  updatedAt: Date;
  previousRadarState: RefinanceRadarState | null;
  lastRateSnapshotId: string | null;
};

export interface RefinanceRadarEvaluationRunResult {
  examined: number;
  evaluated: number;
  opened: number;
  closed: number;
  skipped: number;
  failed: number;
  deadLettered: number;
  snapshotId: string;
}

export type RefinanceEvaluationLease = {
  claimId: string;
  leaseToken: string;
  attempt: number;
};

export interface EvaluateRefinanceRadarDeps {
  loadEligibleProfiles: (
    cursor: string | null,
    pageSize: number,
  ) => Promise<EligibleProfile[]>;
  acquireEvaluationClaim: (
    propertyId: string,
    snapshotId: string,
    leaseMs: number,
    maxDurableAttempts: number,
  ) => Promise<RefinanceEvaluationLease | null>;
  completeEvaluationClaim: (
    lease: RefinanceEvaluationLease,
  ) => Promise<boolean>;
  failEvaluationClaim: (
    lease: RefinanceEvaluationLease,
    error: unknown,
    maxDurableAttempts: number,
  ) => Promise<{ updated: boolean; deadLettered: boolean }>;
  evaluateProperty: RefinanceRadarService['evaluateProperty'];
  logger: AppLogger;
}

const refinanceRadarService = new RefinanceRadarService();

async function loadEligibleProfiles(
  cursor: string | null,
  pageSize: number,
): Promise<EligibleProfile[]> {
  const profiles = await prisma.propertyFinancingProfile.findMany({
    where: {
      currentMortgageBalanceCents: { not: null },
      interestRateBps: { not: null },
      remainingTermMonths: { not: null },
    },
    orderBy: { id: 'asc' },
    take: pageSize,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      propertyId: true,
      updatedAt: true,
      property: {
        select: {
          refinanceRadarState: {
            select: {
              radarState: true,
              lastRateSnapshotId: true,
            },
          },
        },
      },
    },
  });

  return profiles.map((profile) => ({
    id: profile.id,
    propertyId: profile.propertyId,
    updatedAt: profile.updatedAt,
    previousRadarState: profile.property.refinanceRadarState?.radarState ?? null,
    lastRateSnapshotId: profile.property.refinanceRadarState?.lastRateSnapshotId ?? null,
  }));
}

async function acquireEvaluationClaim(
  propertyId: string,
  snapshotId: string,
  leaseMs: number,
  maxDurableAttempts: number,
): Promise<RefinanceEvaluationLease | null> {
  const claim = await prisma.refinanceEvaluationClaim.upsert({
    where: {
      propertyId_snapshotId: { propertyId, snapshotId },
    },
    create: {
      propertyId,
      snapshotId,
      status: RefinanceEvaluationClaimStatus.PENDING,
    },
    update: {},
    select: {
      id: true,
      attempts: true,
    },
  });
  const now = new Date();
  const leaseToken = randomUUID();
  const locked = await prisma.refinanceEvaluationClaim.updateMany({
    where: {
      id: claim.id,
      attempts: { lt: maxDurableAttempts },
      OR: [
        { status: RefinanceEvaluationClaimStatus.PENDING },
        { status: RefinanceEvaluationClaimStatus.FAILED },
        {
          status: RefinanceEvaluationClaimStatus.PROCESSING,
          leaseExpiresAt: { lt: now },
        },
      ],
    },
    data: {
      status: RefinanceEvaluationClaimStatus.PROCESSING,
      attempts: { increment: 1 },
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      startedAt: now,
      completedAt: null,
      lastError: null,
    },
  });

  return locked.count === 1
    ? { claimId: claim.id, leaseToken, attempt: claim.attempts + 1 }
    : null;
}

async function completeEvaluationClaim(
  lease: RefinanceEvaluationLease,
): Promise<boolean> {
  const completed = await prisma.refinanceEvaluationClaim.updateMany({
    where: {
      id: lease.claimId,
      leaseToken: lease.leaseToken,
      status: RefinanceEvaluationClaimStatus.PROCESSING,
    },
    data: {
      status: RefinanceEvaluationClaimStatus.COMPLETED,
      completedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: null,
    },
  });
  return completed.count === 1;
}

async function failEvaluationClaim(
  lease: RefinanceEvaluationLease,
  error: unknown,
  maxDurableAttempts: number,
): Promise<{ updated: boolean; deadLettered: boolean }> {
  const deadLettered = lease.attempt >= maxDurableAttempts;
  const message = error instanceof Error ? error.message : String(error);
  const failed = await prisma.refinanceEvaluationClaim.updateMany({
    where: {
      id: lease.claimId,
      leaseToken: lease.leaseToken,
      status: RefinanceEvaluationClaimStatus.PROCESSING,
    },
    data: {
      status: deadLettered
        ? RefinanceEvaluationClaimStatus.DEAD_LETTER
        : RefinanceEvaluationClaimStatus.FAILED,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: message.slice(0, 2000),
    },
  });
  return { updated: failed.count === 1, deadLettered };
}

const defaultDeps: EvaluateRefinanceRadarDeps = {
  loadEligibleProfiles,
  acquireEvaluationClaim,
  completeEvaluationClaim,
  failEvaluationClaim,
  evaluateProperty: refinanceRadarService.evaluateProperty.bind(refinanceRadarService),
  logger,
};

/**
 * Evaluate every property whose canonical Financing profile contains the
 * three required radar inputs. A durable (propertyId, snapshotId) claim is the
 * idempotency key and concurrency boundary. Expired PROCESSING claims and
 * FAILED claims can be safely recovered by a later run.
 *
 * Failures are isolated per property and move to a dead letter state after a
 * bounded number of durable attempts.
 */
export async function evaluateRefinanceRadarForSnapshot(
  snapshotId: string,
  deps: EvaluateRefinanceRadarDeps = defaultDeps,
  options?: {
    pageSize?: number;
    concurrency?: number;
    maxAttempts?: number;
    leaseMs?: number;
    maxDurableAttempts?: number;
  },
): Promise<RefinanceRadarEvaluationRunResult> {
  const pageSize = Math.max(1, options?.pageSize ?? DEFAULT_PAGE_SIZE);
  const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const leaseMs = Math.max(1_000, options?.leaseMs ?? DEFAULT_LEASE_MS);
  const maxDurableAttempts = Math.max(
    1,
    options?.maxDurableAttempts ?? DEFAULT_MAX_DURABLE_ATTEMPTS,
  );
  const result: RefinanceRadarEvaluationRunResult = {
    examined: 0,
    evaluated: 0,
    opened: 0,
    closed: 0,
    skipped: 0,
    failed: 0,
    deadLettered: 0,
    snapshotId,
  };

  let cursor: string | null = null;

  do {
    const profiles = await deps.loadEligibleProfiles(cursor, pageSize);
    if (profiles.length === 0) break;

    result.examined += profiles.length;

    for (let offset = 0; offset < profiles.length; offset += concurrency) {
      const chunk = profiles.slice(offset, offset + concurrency);
      await Promise.all(chunk.map(async (profile) => {
        let lease: RefinanceEvaluationLease | null = null;
        try {
          lease = await deps.acquireEvaluationClaim(
            profile.propertyId,
            snapshotId,
            leaseMs,
            maxDurableAttempts,
          );
          if (!lease) {
            result.skipped++;
            return;
          }

          const propertyContextVersion =
            `financing-profile:${profile.id}:${profile.updatedAt.toISOString()}`;
          let status: Awaited<ReturnType<RefinanceRadarService['evaluateProperty']>> | null = null;
          let lastError: unknown;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              status = await deps.evaluateProperty(
                profile.propertyId,
                propertyContextVersion,
              );
              break;
            } catch (error) {
              lastError = error;
              if (attempt < maxAttempts) {
                deps.logger.warn(
                  { err: error, propertyId: profile.propertyId, snapshotId, attempt },
                  '[REFINANCE-RADAR-EVALUATION] Retrying property evaluation',
                );
              }
            }
          }

          if (!status) throw lastError;

          if (!status.available) {
            await deps.completeEvaluationClaim(lease);
            result.skipped++;
            deps.logger.warn(
              { propertyId: profile.propertyId, reason: status.reason },
              '[REFINANCE-RADAR-EVALUATION] Complete profile became unavailable during evaluation',
            );
            return;
          }

          const completed = await deps.completeEvaluationClaim(lease);
          if (!completed) {
            deps.logger.warn(
              { propertyId: profile.propertyId, snapshotId, claimId: lease.claimId },
              '[REFINANCE-RADAR-EVALUATION] Evaluation completed after its lease was lost',
            );
          }
          result.evaluated++;
          if (
            status.radarState === RefinanceRadarState.OPEN &&
            profile.previousRadarState !== RefinanceRadarState.OPEN
          ) {
            result.opened++;
          } else if (
            status.radarState === RefinanceRadarState.CLOSED &&
            profile.previousRadarState === RefinanceRadarState.OPEN
          ) {
            result.closed++;
          }
        } catch (error) {
          result.failed++;
          let deadLettered = false;
          if (lease) {
            const claimFailure = await deps.failEvaluationClaim(
              lease,
              error,
              maxDurableAttempts,
            );
            deadLettered = claimFailure.updated && claimFailure.deadLettered;
            if (claimFailure.updated && claimFailure.deadLettered) {
              result.deadLettered++;
            }
          }
          deps.logger.error(
            {
              err: error,
              propertyId: profile.propertyId,
              snapshotId,
              claimId: lease?.claimId,
              durableAttempt: lease?.attempt,
              deadLettered,
            },
            '[REFINANCE-RADAR-EVALUATION] Property evaluation failed',
          );
        }
      }));
    }

    cursor = profiles[profiles.length - 1].id;
    if (profiles.length < pageSize) break;
  } while (cursor);

  deps.logger.info(
    { ...result },
    `[REFINANCE-RADAR-EVALUATION] Complete snapshot=${snapshotId} ` +
      `examined=${result.examined} evaluated=${result.evaluated} opened=${result.opened} ` +
      `closed=${result.closed} skipped=${result.skipped} failed=${result.failed} ` +
      `deadLettered=${result.deadLettered}`,
  );

  return result;
}
