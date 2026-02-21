import {
  ClimateRegion,
  InventoryItem,
  InventoryItemCategory,
  PredictionStatus,
  Prisma,
  ServiceCategory,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { incrementStreak, StreakUpdateResult } from './gamification.service';
import { mapInventoryToServiceCategory } from '../utils/inventoryServiceCategory.util';

type RuleGroupKey = 'HVAC' | 'WATER_HEATER' | 'ROOF';

type RuleDefinition = {
  taskName: string;
  intervalMonths: number;
  basePriority: number;
  seasonalTuneUp?: boolean;
};

type ForecastCandidate = {
  propertyId: string;
  inventoryItemId: string;
  taskName: string;
  predictedDate: Date;
  priority: number;
  reasoning: string;
  confidenceScore: number;
};

export const MAINTENANCE_RULES: Record<RuleGroupKey, RuleDefinition[]> = {
  HVAC: [
    {
      taskName: 'Filter Change',
      intervalMonths: 3,
      basePriority: 3,
    },
    {
      taskName: 'Professional Tune-up',
      intervalMonths: 12,
      basePriority: 4,
      seasonalTuneUp: true,
    },
  ],
  WATER_HEATER: [
    {
      taskName: 'Tank Flush',
      intervalMonths: 12,
      basePriority: 3,
    },
  ],
  ROOF: [
    {
      taskName: 'Gutter Cleaning',
      intervalMonths: 6,
      basePriority: 3,
    },
    {
      taskName: 'Visual Inspection',
      intervalMonths: 12,
      basePriority: 4,
    },
  ],
};

const WATER_HEATER_HINTS = ['water heater', 'hot water', 'tankless'];
const FORECAST_WINDOW_MONTHS = 12;

type MaintenancePredictionWithItem = Prisma.MaintenancePredictionGetPayload<{
  include: {
    inventoryItem: {
      select: {
        id: true;
        name: true;
        category: true;
        lastServicedOn: true;
        isVerified: true;
      };
    };
    booking: {
      select: {
        id: true;
        status: true;
      };
    };
  };
}>;

export type ForecastPredictionDTO = MaintenancePredictionWithItem & {
  recommendedServiceCategory: ServiceCategory;
};

export type ForecastStatusUpdateResult = {
  prediction: ForecastPredictionDTO;
  streak: StreakUpdateResult | null;
};

function isWaterHeaterItem(item: Pick<InventoryItem, 'category' | 'name'>): boolean {
  if (item.category !== InventoryItemCategory.PLUMBING) return false;
  const lower = item.name.toLowerCase();
  return WATER_HEATER_HINTS.some((hint) => lower.includes(hint));
}

function resolveRuleGroup(item: Pick<InventoryItem, 'category' | 'name' | 'isVerified'>): RuleGroupKey | null {
  if (item.category === InventoryItemCategory.HVAC && item.isVerified) {
    return 'HVAC';
  }

  if (item.category === InventoryItemCategory.ROOF_EXTERIOR) {
    return 'ROOF';
  }

  if (isWaterHeaterItem(item)) {
    return 'WATER_HEATER';
  }

  return null;
}

function getConfidenceScore(item: Pick<InventoryItem, 'isVerified' | 'sourceType'>): number {
  if (item.isVerified) return 0.9;
  if (item.sourceType === 'MANUAL') return 0.5;
  return 0.6;
}

function getAssetAgeYears(
  item: Pick<InventoryItem, 'installedOn' | 'purchasedOn'>,
  now: Date
): number | null {
  const baseDate = item.installedOn ?? item.purchasedOn;
  if (!baseDate) return null;

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const age = (now.getTime() - baseDate.getTime()) / msPerYear;
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

function clampPriority(priority: number): number {
  return Math.min(5, Math.max(1, Math.round(priority)));
}

function addMonths(base: Date, months: number): Date {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

function normalizeToMidday(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function startOfWindow(now: Date): Date {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfWindow(now: Date): Date {
  const value = addMonths(now, FORECAST_WINDOW_MONTHS);
  value.setHours(23, 59, 59, 999);
  return value;
}

function climateTuneUpMonths(climateRegion: ClimateRegion): [number, number] {
  switch (climateRegion) {
    case ClimateRegion.VERY_COLD:
    case ClimateRegion.COLD:
      return [4, 10]; // May, November
    case ClimateRegion.WARM:
    case ClimateRegion.TROPICAL:
      return [2, 9]; // March, October
    case ClimateRegion.MODERATE:
    default:
      return [3, 9]; // April, October
  }
}

function nextSeasonalTuneUpDate(now: Date, climateRegion: ClimateRegion): Date {
  const [springMonth, fallMonth] = climateTuneUpMonths(climateRegion);
  const candidates: Date[] = [];
  const currentYear = now.getFullYear();

  for (const yearOffset of [0, 1]) {
    const year = currentYear + yearOffset;
    for (const month of [springMonth, fallMonth]) {
      const candidate = new Date(year, month - 1, 15, 12, 0, 0, 0);
      if (candidate.getTime() > now.getTime()) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? addMonths(now, 12);
}

function buildReasoning(
  group: RuleGroupKey,
  rule: RuleDefinition,
  climateRegion: ClimateRegion,
  assetAgeYears: number | null
): { reasoning: string; priority: number } {
  const groupReason =
    group === 'HVAC'
      ? 'Generated from HVAC care rules.'
      : group === 'WATER_HEATER'
        ? 'Generated from water-heater reliability rules.'
        : 'Generated from roof/exterior maintenance rules.';

  let reasoning = `${groupReason} ${rule.taskName} is recommended every ${rule.intervalMonths} month${rule.intervalMonths === 1 ? '' : 's'}.`;
  let priority = rule.basePriority;

  if (rule.seasonalTuneUp) {
    reasoning = `${reasoning} Scheduled for ${climateRegion.toLowerCase().replace(/_/g, ' ')} climate timing (spring/fall preference).`;
  }

  if (assetAgeYears !== null && assetAgeYears > 10) {
    priority = clampPriority(priority + 1);
    reasoning = `${reasoning} System age exceeds 10 years; increased frequency recommended to prevent failure.`;
  }

  return { reasoning, priority };
}

function predictionKey(inventoryItemId: string | null, taskName: string, predictedDate: Date): string {
  const year = predictedDate.getUTCFullYear();
  const month = predictedDate.getUTCMonth() + 1;
  return `${inventoryItemId ?? 'none'}::${taskName.toLowerCase()}::${year}-${month}`;
}

async function resolveClimateRegion(propertyId: string): Promise<ClimateRegion> {
  const setting = await prisma.propertyClimateSetting.findUnique({
    where: { propertyId },
    select: { climateRegion: true },
  });

  return setting?.climateRegion ?? ClimateRegion.MODERATE;
}

function toForecastDTO(prediction: MaintenancePredictionWithItem): ForecastPredictionDTO {
  const categoryHint = prediction.inventoryItem?.category ?? 'OTHER';
  return {
    ...prediction,
    recommendedServiceCategory: mapInventoryToServiceCategory(categoryHint),
  };
}

function buildRuleDates(
  now: Date,
  windowEnd: Date,
  baseDate: Date | null,
  rule: RuleDefinition,
  climateRegion: ClimateRegion
): Date[] {
  if (rule.seasonalTuneUp) {
    const first = nextSeasonalTuneUpDate(now, climateRegion);
    if (first <= windowEnd) return [first];
    return [];
  }

  const dates: Date[] = [];
  const seed = baseDate ?? now;
  let cursor = addMonths(seed, rule.intervalMonths);

  // Ensure at least one near-term suggestion if base date was long ago.
  while (cursor <= now) {
    cursor = addMonths(cursor, rule.intervalMonths);
  }

  while (cursor <= windowEnd) {
    dates.push(normalizeToMidday(cursor));
    cursor = addMonths(cursor, rule.intervalMonths);
  }

  return dates;
}

export async function generateForecast(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });

  if (!property) {
    throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  const now = new Date();
  const windowStart = startOfWindow(now);
  const windowEnd = endOfWindow(now);
  const climateRegion = await resolveClimateRegion(propertyId);

  const items = await prisma.inventoryItem.findMany({
    where: { propertyId },
    select: {
      id: true,
      propertyId: true,
      name: true,
      category: true,
      isVerified: true,
      sourceType: true,
      installedOn: true,
      purchasedOn: true,
      lastServicedOn: true,
    },
  });

  const eligibleItemIds = items.map((item) => item.id);
  const existingPredictions = await prisma.maintenancePrediction.findMany({
    where: {
      propertyId,
      inventoryItemId: { in: eligibleItemIds },
      predictedDate: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  const existingByKey = new Map<string, (typeof existingPredictions)[number]>();
  for (const prediction of existingPredictions) {
    const key = predictionKey(prediction.inventoryItemId, prediction.taskName, prediction.predictedDate);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, prediction);
    }
  }

  const candidates: ForecastCandidate[] = [];

  for (const item of items) {
    const group = resolveRuleGroup(item);
    if (!group) continue;

    const rules = MAINTENANCE_RULES[group];
    const confidenceScore = getConfidenceScore(item);
    const assetAgeYears = getAssetAgeYears(item, now);
    const baseDate = item.lastServicedOn ?? item.installedOn ?? item.purchasedOn ?? null;

    for (const rule of rules) {
      const scheduleDates = buildRuleDates(now, windowEnd, baseDate, rule, climateRegion);
      const { reasoning, priority } = buildReasoning(group, rule, climateRegion, assetAgeYears);

      for (const predictedDate of scheduleDates) {
        candidates.push({
          propertyId,
          inventoryItemId: item.id,
          taskName: rule.taskName,
          predictedDate,
          priority,
          reasoning,
          confidenceScore,
        });
      }
    }
  }

  let created = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const key = predictionKey(candidate.inventoryItemId, candidate.taskName, candidate.predictedDate);
    const existing = existingByKey.get(key);

    if (!existing) {
      await prisma.maintenancePrediction.create({
        data: {
          propertyId: candidate.propertyId,
          inventoryItemId: candidate.inventoryItemId,
          taskName: candidate.taskName,
          predictedDate: candidate.predictedDate,
          priority: clampPriority(candidate.priority),
          reasoning: candidate.reasoning,
          confidenceScore: candidate.confidenceScore,
          status: PredictionStatus.PENDING,
        },
      });
      created += 1;
      continue;
    }

    if (existing.status === PredictionStatus.COMPLETED || existing.status === PredictionStatus.DISMISSED) {
      continue;
    }

    await prisma.maintenancePrediction.update({
      where: { id: existing.id },
      data: {
        predictedDate: candidate.predictedDate,
        priority: clampPriority(candidate.priority),
        reasoning: candidate.reasoning,
        confidenceScore: candidate.confidenceScore,
      },
    });
    updated += 1;
  }

  return {
    propertyId,
    windowMonths: FORECAST_WINDOW_MONTHS,
    generatedAt: now.toISOString(),
    totalCandidates: candidates.length,
    created,
    updated,
  };
}

export async function listForecast(
  propertyId: string,
  options?: {
    statuses?: PredictionStatus[];
    limit?: number;
  }
): Promise<ForecastPredictionDTO[]> {
  const statuses = options?.statuses?.length
    ? options.statuses
    : [PredictionStatus.PENDING, PredictionStatus.OVERDUE];

  const limit = options?.limit && options.limit > 0 ? options.limit : undefined;

  const rows = await prisma.maintenancePrediction.findMany({
    where: {
      propertyId,
      status: { in: statuses },
    },
    include: {
      inventoryItem: {
        select: {
          id: true,
          name: true,
          category: true,
          lastServicedOn: true,
          isVerified: true,
        },
      },
      booking: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: [{ predictedDate: 'asc' }, { priority: 'desc' }],
    ...(limit ? { take: limit } : {}),
  });

  return rows.map(toForecastDTO);
}

export async function updateForecastStatus(
  propertyId: string,
  predictionId: string,
  status: PredictionStatus
): Promise<ForecastStatusUpdateResult> {
  if (status !== PredictionStatus.COMPLETED && status !== PredictionStatus.DISMISSED) {
    throw new APIError('Only COMPLETED or DISMISSED statuses are supported', 400, 'INVALID_STATUS');
  }

  const existing = await prisma.maintenancePrediction.findFirst({
    where: {
      id: predictionId,
      propertyId,
    },
    include: {
      inventoryItem: {
        select: {
          id: true,
          name: true,
          category: true,
          lastServicedOn: true,
          isVerified: true,
        },
      },
      booking: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!existing) {
    throw new APIError('Maintenance prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  const shouldIncrementStreak =
    status === PredictionStatus.COMPLETED && existing.status !== PredictionStatus.COMPLETED;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedPrediction = await tx.maintenancePrediction.update({
      where: { id: predictionId },
      data: { status },
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            category: true,
            lastServicedOn: true,
            isVerified: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (status === PredictionStatus.COMPLETED && existing.inventoryItemId) {
      await tx.inventoryItem.update({
        where: { id: existing.inventoryItemId },
        data: { lastServicedOn: new Date() },
      });
    }

    return updatedPrediction;
  });

  const streak = shouldIncrementStreak ? await incrementStreak(propertyId) : null;

  if (status === PredictionStatus.COMPLETED) {
    generateForecast(propertyId).catch((err) => {
      console.error('[MAINTENANCE_PREDICTION] Forecast revalidation failed:', err);
    });
  }

  return { prediction: toForecastDTO(updated), streak };
}
