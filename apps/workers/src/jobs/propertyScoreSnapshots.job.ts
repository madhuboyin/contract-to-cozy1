// apps/workers/src/jobs/propertyScoreSnapshots.job.ts
//
// W4 item 4: extracted verbatim out of worker.ts (registry key
// weekly-score-snapshots) so it can be unit-tested directly — worker.ts
// itself has real side effects at module load (connects to Redis/Postgres,
// starts BullMQ workers, schedules cron jobs) and must never be `require`d
// in a test. Same technique already used for claimFollowUpDueTick and
// highPriorityEmailEnqueueTick this session. No logic changes from the
// original inline version.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import { calculateHealthScore } from '../utils/propertyScore.util';

type ScoreType = 'HEALTH' | 'RISK' | 'FINANCIAL';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). The `propertyScoreSnapshot`
// delegate is still accessed via `as any` at its one call site below — a
// deliberate, pre-existing defensive check for a client that hasn't been
// regenerated yet (see the "missing delegate" test), not a typing gap.
export interface PropertyScoreSnapshotsDeps {
  prisma: Pick<
    typeof prisma,
    'propertyScoreSnapshot' | 'riskAssessmentReport' | 'financialEfficiencyReport' | 'property' | 'warranty' | 'document' | 'booking' | 'inventoryItem'
  >;
  logger: AppLogger;
}

const defaultDeps: PropertyScoreSnapshotsDeps = { prisma, logger };

export function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybe = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybe) ? maybe : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getWeekStartUtc(reference = new Date()): Date {
  const weekStart = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, 0, 0, 0)
  );
  const day = (weekStart.getUTCDay() + 6) % 7; // Monday=0
  weekStart.setUTCDate(weekStart.getUTCDate() - day);
  return weekStart;
}

export function getBandForScore(scoreType: ScoreType, score: number): string {
  if (scoreType === 'RISK') {
    if (score >= 80) return 'Low Risk';
    if (score >= 60) return 'Moderate Risk';
    if (score >= 40) return 'Elevated Risk';
    return 'High Risk';
  }

  if (scoreType === 'FINANCIAL') {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Average';
    return 'Below Average';
  }

  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Attention';
}

export async function upsertPropertyScoreSnapshot(
  input: {
    propertyId: string;
    homeownerProfileId: string;
    scoreType: ScoreType;
    score: number;
    scoreMax?: number | null;
    scoreBand?: string | null;
    snapshotJson?: Record<string, unknown>;
    computedAt?: Date;
    weekStart?: Date;
  },
  deps: PropertyScoreSnapshotsDeps = defaultDeps,
) {
  const { prisma, logger } = deps;
  const snapshotModel = (prisma as any).propertyScoreSnapshot;
  if (!snapshotModel) {
    logger.warn('[SCORE-SNAPSHOT] Prisma client missing propertyScoreSnapshot delegate. Run prisma generate.');
    return;
  }

  const {
    propertyId,
    homeownerProfileId,
    scoreType,
    score,
    scoreMax = null,
    scoreBand = null,
    snapshotJson = {},
    computedAt = new Date(),
    weekStart = getWeekStartUtc(computedAt),
  } = input;

  const existing = await snapshotModel.findFirst({
    where: {
      propertyId,
      scoreType,
      weekStart,
    },
    select: { id: true },
  });

  if (existing?.id) {
    await snapshotModel.update({
      where: { id: existing.id },
      data: {
        homeownerProfileId,
        score,
        scoreMax,
        scoreBand,
        computedAt,
        snapshotJson: snapshotJson as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await snapshotModel.create({
    data: {
      propertyId,
      homeownerProfileId,
      scoreType,
      score,
      scoreMax,
      scoreBand,
      weekStart,
      computedAt,
      snapshotJson: snapshotJson as Prisma.InputJsonValue,
      sourceVersion: 1,
    },
  });
}

export async function capturePropertyScoreSnapshots(
  propertyId: string,
  homeownerProfileId: string,
  deps: PropertyScoreSnapshotsDeps = defaultDeps,
): Promise<void> {
  const { prisma } = deps;
  const [riskReport, financialReport, propertyCore, warranties, documentCount, activeBookings, applianceItems] =
    await Promise.all([
      prisma.riskAssessmentReport.findUnique({
        where: { propertyId },
        select: {
          riskScore: true,
          financialExposureTotal: true,
          details: true,
          lastCalculatedAt: true,
        },
      }),
      prisma.financialEfficiencyReport.findUnique({
        where: { propertyId },
        select: {
          financialEfficiencyScore: true,
          actualInsuranceCost: true,
          actualUtilityCost: true,
          actualWarrantyCost: true,
          marketAverageTotal: true,
          lastCalculatedAt: true,
        },
      }),
      prisma.property.findUnique({
        where: { id: propertyId },
      }),
      prisma.warranty.findMany({
        where: { propertyId },
        select: {
          id: true,
          homeownerProfileId: true,
          propertyId: true,
          providerName: true,
          policyNumber: true,
          coverageDetails: true,
          cost: true,
          startDate: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.document.count({
        where: { propertyId },
      }),
      prisma.booking.findMany({
        where: {
          propertyId,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        },
        select: {
          id: true,
          category: true,
          status: true,
          insightFactor: true,
          insightContext: true,
          propertyId: true,
          providerId: true,
          scheduledDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.inventoryItem.findMany({
        where: {
          propertyId,
          category: 'APPLIANCE',
        },
        select: {
          id: true,
          sourceHash: true,
          tags: true,
          name: true,
          installedOn: true,
        },
      }),
    ]);

  if (riskReport) {
    const details = Array.isArray(riskReport.details) ? (riskReport.details as Array<Record<string, unknown>>) : [];
    const highRiskCount = details.filter((detail) => String(detail.riskLevel || '').toUpperCase() === 'HIGH').length;
    await upsertPropertyScoreSnapshot({
      propertyId,
      homeownerProfileId,
      scoreType: 'RISK',
      score: Math.round(asNumber(riskReport.riskScore) * 10) / 10,
      scoreMax: 100,
      scoreBand: getBandForScore('RISK', asNumber(riskReport.riskScore)),
      computedAt: riskReport.lastCalculatedAt ? new Date(riskReport.lastCalculatedAt) : new Date(),
      snapshotJson: {
        financialExposureTotal: asNumber(riskReport.financialExposureTotal),
        highRiskAssets: highRiskCount,
      },
    }, deps);
  }

  if (financialReport) {
    const actualInsuranceCost = asNumber(financialReport.actualInsuranceCost);
    const actualUtilityCost = asNumber(financialReport.actualUtilityCost);
    const actualWarrantyCost = asNumber(financialReport.actualWarrantyCost);
    const annualCost = actualInsuranceCost + actualUtilityCost + actualWarrantyCost;

    await upsertPropertyScoreSnapshot({
      propertyId,
      homeownerProfileId,
      scoreType: 'FINANCIAL',
      score: Math.round(asNumber(financialReport.financialEfficiencyScore) * 10) / 10,
      scoreMax: 100,
      scoreBand: getBandForScore('FINANCIAL', asNumber(financialReport.financialEfficiencyScore)),
      computedAt: financialReport.lastCalculatedAt ? new Date(financialReport.lastCalculatedAt) : new Date(),
      snapshotJson: {
        annualCost,
        marketAverageTotal: asNumber(financialReport.marketAverageTotal),
      },
    }, deps);
  }

  if (propertyCore) {
    const healthInput = {
      ...(propertyCore as Record<string, unknown>),
      inventoryItems: applianceItems || [],
      warranties: warranties || [],
    };

    const health = calculateHealthScore(healthInput as any, documentCount || 0, (activeBookings || []) as any[]);
    await upsertPropertyScoreSnapshot({
      propertyId,
      homeownerProfileId,
      scoreType: 'HEALTH',
      score: Math.round(asNumber(health.totalScore) * 10) / 10,
      scoreMax: asNumber(health.maxPotentialScore),
      scoreBand: getBandForScore('HEALTH', asNumber(health.totalScore)),
      computedAt: new Date(),
      snapshotJson: {
        requiredActions: health.insights.filter((insight: { status: string }) =>
          ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'].includes(insight.status)
        ).length,
        insights: health.insights.slice(0, 8),
      },
    }, deps);
  }
}

export async function captureWeeklyScoreSnapshotsJob(deps: PropertyScoreSnapshotsDeps = defaultDeps) {
  const { prisma, logger } = deps;
  logger.info(`[${new Date().toISOString()}] Running weekly property score snapshot job...`);
  try {
    const properties = await prisma.property.findMany({
      select: {
        id: true,
        homeownerProfileId: true,
      },
    });

    let successCount = 0;
    let failureCount = 0;

    for (const property of properties as Array<{ id: string; homeownerProfileId: string }>) {
      try {
        await capturePropertyScoreSnapshots(property.id, property.homeownerProfileId, deps);
        successCount += 1;
      } catch (error) {
        failureCount += 1;
        logger.error({ err: error }, `[SCORE-SNAPSHOT] Failed for property ${property.id}`);
      }
    }

    logger.info(
      `[SCORE-SNAPSHOT] Weekly snapshot completed. Success: ${successCount}, Failed: ${failureCount}, Total: ${properties.length}`
    );
  } catch (error) {
    logger.error({ err: error }, '[SCORE-SNAPSHOT] Weekly snapshot job failed');
  }
}
