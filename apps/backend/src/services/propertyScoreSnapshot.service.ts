import { prisma } from '../lib/prisma';

export type PropertyScoreType = 'HEALTH' | 'RISK' | 'FINANCIAL';

export type ScorePointDTO = {
  weekStart: string;
  score: number;
  scoreMax: number | null;
  scoreBand: string | null;
  computedAt: string;
  snapshot: Record<string, unknown> | null;
};

export type ScoreSeriesDTO = {
  scoreType: PropertyScoreType;
  latest: ScorePointDTO | null;
  previous: ScorePointDTO | null;
  deltaFromPreviousWeek: number | null;
  trend: ScorePointDTO[];
};

export type PropertyScoreSnapshotSummaryDTO = {
  propertyId: string;
  weeks: number;
  scores: {
    HEALTH: ScoreSeriesDTO;
    RISK: ScoreSeriesDTO;
    FINANCIAL: ScoreSeriesDTO;
  };
};

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybe = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybe) ? maybe : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampWeeks(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 52;
  return Math.max(8, Math.min(104, Math.round(parsed)));
}

function mapPoint(record: any): ScorePointDTO {
  return {
    weekStart: new Date(record.weekStart).toISOString(),
    score: asNumber(record.score),
    scoreMax: record.scoreMax === null || record.scoreMax === undefined ? null : asNumber(record.scoreMax),
    scoreBand: record.scoreBand ?? null,
    computedAt: new Date(record.computedAt).toISOString(),
    snapshot:
      record.snapshotJson && typeof record.snapshotJson === 'object'
        ? (record.snapshotJson as Record<string, unknown>)
        : null,
  };
}

function buildSeries(scoreType: PropertyScoreType, rows: any[]): ScoreSeriesDTO {
  const ordered = [...rows].sort(
    (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
  );

  const trend = ordered.map(mapPoint);
  const latest = trend.length > 0 ? trend[trend.length - 1] : null;
  const previous = trend.length > 1 ? trend[trend.length - 2] : null;
  const deltaFromPreviousWeek =
    latest && previous ? Math.round((latest.score - previous.score) * 10) / 10 : null;

  return {
    scoreType,
    latest,
    previous,
    deltaFromPreviousWeek,
    trend,
  };
}

async function assertPropertyAccess(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: { id: true },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }
}

export async function getPropertyScoreSnapshotSummary(
  propertyId: string,
  userId: string,
  weeksInput?: unknown
): Promise<PropertyScoreSnapshotSummaryDTO> {
  await assertPropertyAccess(propertyId, userId);
  const snapshotModel = (prisma as any).propertyScoreSnapshot;
  if (!snapshotModel) {
    throw new Error('Score snapshot model is unavailable. Run prisma generate.');
  }

  const weeks = clampWeeks(weeksInput);
  const scoreTypes: PropertyScoreType[] = ['HEALTH', 'RISK', 'FINANCIAL'];

  const rowsByType = await Promise.all(
    scoreTypes.map(async (scoreType) => {
      const rows = await snapshotModel.findMany({
        where: { propertyId, scoreType },
        orderBy: [{ weekStart: 'desc' }],
        take: weeks,
        select: {
          weekStart: true,
          score: true,
          scoreMax: true,
          scoreBand: true,
          computedAt: true,
          snapshotJson: true,
        },
      });
      return [scoreType, rows] as const;
    })
  );

  const map = new Map<PropertyScoreType, any[]>(
    rowsByType as readonly (readonly [PropertyScoreType, any[]])[]
  );

  return {
    propertyId,
    weeks,
    scores: {
      HEALTH: buildSeries('HEALTH', map.get('HEALTH') ?? []),
      RISK: buildSeries('RISK', map.get('RISK') ?? []),
      FINANCIAL: buildSeries('FINANCIAL', map.get('FINANCIAL') ?? []),
    },
  };
}
