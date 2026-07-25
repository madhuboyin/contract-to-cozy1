import { RefinanceRadarState } from '@prisma/client';
import { RefinanceRadarService } from '@worker-shared/refinanceRadar/refinanceRadar.service';
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_ATTEMPTS = 3;

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
  snapshotId: string;
}

export interface EvaluateRefinanceRadarDeps {
  loadEligibleProfiles: (
    cursor: string | null,
    pageSize: number,
  ) => Promise<EligibleProfile[]>;
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

const defaultDeps: EvaluateRefinanceRadarDeps = {
  loadEligibleProfiles,
  evaluateProperty: refinanceRadarService.evaluateProperty.bind(refinanceRadarService),
  logger,
};

/**
 * Evaluate every property whose canonical Financing profile contains the
 * three required radar inputs. The existing lastRateSnapshotId column is the
 * idempotency key: a property is evaluated at most once per market snapshot.
 *
 * Failures are isolated per property so one malformed profile does not block
 * the rest of the portfolio. The next run can retry only failed properties
 * because their lastRateSnapshotId was not advanced.
 */
export async function evaluateRefinanceRadarForSnapshot(
  snapshotId: string,
  deps: EvaluateRefinanceRadarDeps = defaultDeps,
  options?: { pageSize?: number; concurrency?: number; maxAttempts?: number },
): Promise<RefinanceRadarEvaluationRunResult> {
  const pageSize = Math.max(1, options?.pageSize ?? DEFAULT_PAGE_SIZE);
  const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const result: RefinanceRadarEvaluationRunResult = {
    examined: 0,
    evaluated: 0,
    opened: 0,
    closed: 0,
    skipped: 0,
    failed: 0,
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
        if (profile.lastRateSnapshotId === snapshotId) {
          result.skipped++;
          return;
        }

        try {
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
            result.skipped++;
            deps.logger.warn(
              { propertyId: profile.propertyId, reason: status.reason },
              '[REFINANCE-RADAR-EVALUATION] Complete profile became unavailable during evaluation',
            );
            return;
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
          deps.logger.error(
            { err: error, propertyId: profile.propertyId, snapshotId },
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
      `closed=${result.closed} skipped=${result.skipped} failed=${result.failed}`,
  );

  return result;
}
