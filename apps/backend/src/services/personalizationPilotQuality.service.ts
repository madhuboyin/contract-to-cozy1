import { prisma } from '../lib/prisma';

export const MIN_PERSONALIZATION_FEEDBACK_SAMPLE = 20;

type CountRow = { _count: { _all: number } };

export interface PersonalizationPilotQualitySummary {
  windowDays: number;
  since: string;
  generatedAt: string;
  optionalProfilesEnabled: number;
  propertiesWithDefaultGuidance: number;
  recommendations: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byDefinition: Array<{ code: string; count: number }>;
  };
  feedback: {
    total: number;
    explicit: number;
    accepted: number;
    negative: number;
    acceptanceRate: number | null;
    negativeRate: number | null;
    reasons: Array<{ reasonCode: string; count: number }>;
  };
  profileAnswers: Array<{ action: string; count: number }>;
  sample: {
    decisionEvents: number;
    minimumRequired: number;
    status: 'NO_DATA' | 'INSUFFICIENT_SAMPLE' | 'REVIEWABLE';
    onlineTuningAllowed: false;
  };
}

function countOf(row: CountRow): number {
  return row._count._all;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

export async function getPersonalizationPilotQuality(
  windowDays = 30,
  now = new Date(),
): Promise<PersonalizationPilotQualitySummary> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const [
    optionalProfilesEnabled,
    recommendationRows,
    feedbackRows,
    profileAnswerRows,
  ] = await Promise.all([
    prisma.household.count({ where: { consentedAt: { gte: since }, consentVersion: { not: null } } }),
    prisma.personalizedRecommendation.groupBy({
      by: ['propertyId', 'definitionId', 'status'],
      where: { firstEligibleAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.recommendationFeedback.groupBy({
      by: ['type', 'explicit', 'reasonCode'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.profileAnswer.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const definitionIds = [...new Set(recommendationRows.map((row) => row.definitionId))];
  const definitions = definitionIds.length === 0
    ? []
    : await prisma.recommendationDefinition.findMany({
      where: { id: { in: definitionIds } },
      select: { id: true, code: true },
    });
  const codeById = new Map(definitions.map((definition) => [definition.id, definition.code]));

  const byStatus = new Map<string, number>();
  const byDefinition = new Map<string, number>();
  for (const row of recommendationRows) {
    const count = countOf(row);
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + count);
    const code = codeById.get(row.definitionId) ?? 'unknown_definition';
    byDefinition.set(code, (byDefinition.get(code) ?? 0) + count);
  }

  const reasons = new Map<string, number>();
  let feedbackTotal = 0;
  let explicit = 0;
  let accepted = 0;
  let negative = 0;
  for (const row of feedbackRows) {
    const count = countOf(row);
    feedbackTotal += count;
    if (row.explicit) explicit += count;
    if (row.type === 'ACCEPTED') accepted += count;
    if (row.type === 'NOT_RELEVANT' || row.type === 'DISMISSED') negative += count;
    if (row.reasonCode) reasons.set(row.reasonCode, (reasons.get(row.reasonCode) ?? 0) + count);
  }

  const decisionEvents = accepted + negative;
  const propertiesWithDefaultGuidance = new Set(
    recommendationRows.map((row) => row.propertyId),
  ).size;
  const sampleStatus = decisionEvents === 0
    ? 'NO_DATA' as const
    : decisionEvents < MIN_PERSONALIZATION_FEEDBACK_SAMPLE
      ? 'INSUFFICIENT_SAMPLE' as const
      : 'REVIEWABLE' as const;

  return {
    windowDays,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    optionalProfilesEnabled,
    propertiesWithDefaultGuidance,
    recommendations: {
      total: recommendationRows.reduce((sum, row) => sum + countOf(row), 0),
      byStatus: [...byStatus.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      byDefinition: [...byDefinition.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    },
    feedback: {
      total: feedbackTotal,
      explicit,
      accepted,
      negative,
      acceptanceRate: rate(accepted, decisionEvents),
      negativeRate: rate(negative, decisionEvents),
      reasons: [...reasons.entries()]
        .map(([reasonCode, count]) => ({ reasonCode, count }))
        .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode)),
    },
    profileAnswers: profileAnswerRows
      .map((row) => ({ action: row.action, count: countOf(row) }))
      .sort((a, b) => a.action.localeCompare(b.action)),
    sample: {
      decisionEvents,
      minimumRequired: MIN_PERSONALIZATION_FEEDBACK_SAMPLE,
      status: sampleStatus,
      onlineTuningAllowed: false,
    },
  };
}
