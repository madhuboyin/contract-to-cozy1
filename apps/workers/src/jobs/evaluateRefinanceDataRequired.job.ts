import {
  DomainEventStatus,
  DomainEventType,
  PropertyMortgageStatus,
} from '@prisma/client';
import { MortgageRateService } from '@worker-shared/refinanceRadar/engine/mortgageRate.service';
import {
  RATE_TREND_LOOKBACK_SNAPSHOTS,
  shouldPromptForMissingMortgageDetails,
} from '@worker-shared/refinanceRadar/config/refinanceRadar.config';
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_COOLDOWN_DAYS = 30;

export type RefinanceDataRequiredField =
  | 'currentMortgageBalance'
  | 'interestRate'
  | 'remainingTerm';

type IncompleteProperty = {
  propertyId: string;
  missingFields: RefinanceDataRequiredField[];
};

export interface RefinanceDataRequiredRunResult {
  snapshotId: string;
  examined: number;
  created: number;
  cooldownSuppressed: number;
  skipped: number;
}

export interface EvaluateRefinanceDataRequiredDeps {
  loadIncompleteProperties: (
    cursor: string | null,
    pageSize: number,
  ) => Promise<IncompleteProperty[]>;
  loadRecentSnapshots: MortgageRateService['getRecentSnapshots'];
  hasRecentPrompt: (
    propertyId: string,
    since: Date,
  ) => Promise<boolean>;
  createPromptEvent: (input: {
    propertyId: string;
    snapshotId: string;
    missingFields: RefinanceDataRequiredField[];
    currentRatePct: number;
    priorRatePct: number;
    occurredAt: Date;
  }) => Promise<void>;
  logger: AppLogger;
}

async function loadIncompleteProperties(
  cursor: string | null,
  pageSize: number,
): Promise<IncompleteProperty[]> {
  const properties = await prisma.property.findMany({
    where: {
      OR: [
        { financingProfile: { is: null } },
        {
          financingProfile: {
            is: {
              mortgageStatus: { not: PropertyMortgageStatus.NO_MORTGAGE },
              OR: [
                { currentMortgageBalanceCents: null },
                { interestRateBps: null },
                { remainingTermMonths: null },
              ],
            },
          },
        },
      ],
    },
    orderBy: { id: 'asc' },
    take: pageSize,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      financingProfile: {
        select: {
          currentMortgageBalanceCents: true,
          interestRateBps: true,
          remainingTermMonths: true,
        },
      },
    },
  });

  return properties.map((property) => {
    const missingFields: RefinanceDataRequiredField[] = [];
    if (property.financingProfile?.currentMortgageBalanceCents == null) {
      missingFields.push('currentMortgageBalance');
    }
    if (property.financingProfile?.interestRateBps == null) {
      missingFields.push('interestRate');
    }
    if (property.financingProfile?.remainingTermMonths == null) {
      missingFields.push('remainingTerm');
    }
    return { propertyId: property.id, missingFields };
  });
}

async function hasRecentPrompt(propertyId: string, since: Date): Promise<boolean> {
  const existing = await prisma.domainEvent.findFirst({
    where: {
      propertyId,
      type: DomainEventType.REFINANCE_DATA_REQUIRED,
      status: { not: DomainEventStatus.DEAD_LETTER },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function createPromptEvent(input: {
  propertyId: string;
  snapshotId: string;
  missingFields: RefinanceDataRequiredField[];
  currentRatePct: number;
  priorRatePct: number;
  occurredAt: Date;
}): Promise<void> {
  await prisma.domainEvent.upsert({
    where: {
      idempotencyKey:
        `refinance:${input.propertyId}:${input.snapshotId}:data-required`,
    },
    update: {},
    create: {
      type: DomainEventType.REFINANCE_DATA_REQUIRED,
      status: DomainEventStatus.PENDING,
      propertyId: input.propertyId,
      idempotencyKey:
        `refinance:${input.propertyId}:${input.snapshotId}:data-required`,
      payload: {
        propertyId: input.propertyId,
        snapshotId: input.snapshotId,
        transitionType: 'DATA_REQUIRED',
        actionKey: `refinance-data-required:${input.propertyId}`,
        missingFields: input.missingFields,
        currentRatePct: input.currentRatePct,
        priorRatePct: input.priorRatePct,
        rateDeclinePct: input.priorRatePct - input.currentRatePct,
        occurredAt: input.occurredAt.toISOString(),
      },
    },
  });
}

const mortgageRateService = new MortgageRateService();
const defaultDeps: EvaluateRefinanceDataRequiredDeps = {
  loadIncompleteProperties,
  loadRecentSnapshots:
    mortgageRateService.getRecentSnapshots.bind(mortgageRateService),
  hasRecentPrompt,
  createPromptEvent,
  logger,
};

export async function evaluateRefinanceDataRequiredForSnapshot(
  snapshotId: string,
  deps: EvaluateRefinanceDataRequiredDeps = defaultDeps,
  options?: { pageSize?: number; cooldownDays?: number },
): Promise<RefinanceDataRequiredRunResult> {
  const pageSize = Math.max(1, options?.pageSize ?? DEFAULT_PAGE_SIZE);
  const cooldownDays = Math.max(
    1,
    options?.cooldownDays ?? DEFAULT_COOLDOWN_DAYS,
  );
  const result: RefinanceDataRequiredRunResult = {
    snapshotId,
    examined: 0,
    created: 0,
    cooldownSuppressed: 0,
    skipped: 0,
  };
  const snapshots = await deps.loadRecentSnapshots(
    RATE_TREND_LOOKBACK_SNAPSHOTS,
  );
  const trend = mortgageRateService.computeTrendSummary(snapshots);
  const shouldPrompt = shouldPromptForMissingMortgageDetails({
    missingFieldCount: 1,
    trend: trend.trend30yr,
    currentRatePct: trend.current30yr,
    priorRatePct: trend.prior30yr,
  });
  if (
    !shouldPrompt ||
    trend.current30yr == null ||
    trend.prior30yr == null
  ) {
    deps.logger.info(
      { snapshotId, trend: trend.trend30yr },
      '[REFINANCE-DATA-REQUIRED] Rate movement does not qualify for a prompt',
    );
    return result;
  }

  const occurredAt = new Date();
  const cooldownSince = new Date(
    occurredAt.getTime() - cooldownDays * 24 * 60 * 60 * 1000,
  );
  let cursor: string | null = null;

  do {
    const properties = await deps.loadIncompleteProperties(cursor, pageSize);
    if (properties.length === 0) break;
    result.examined += properties.length;

    for (const property of properties) {
      if (property.missingFields.length === 0) {
        result.skipped++;
        continue;
      }
      if (await deps.hasRecentPrompt(property.propertyId, cooldownSince)) {
        result.cooldownSuppressed++;
        continue;
      }
      await deps.createPromptEvent({
        propertyId: property.propertyId,
        snapshotId,
        missingFields: property.missingFields,
        currentRatePct: trend.current30yr,
        priorRatePct: trend.prior30yr,
        occurredAt,
      });
      result.created++;
    }

    cursor = properties[properties.length - 1].propertyId;
    if (properties.length < pageSize) break;
  } while (cursor);

  deps.logger.info(
    { ...result },
    '[REFINANCE-DATA-REQUIRED] Completed incomplete-profile sweep',
  );
  return result;
}
