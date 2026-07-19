import { prisma } from '../lib/prisma';

export const MIN_PERSONALIZATION_FEEDBACK_SAMPLE = 20;

type CountRow = { _count: { _all: number } };

export interface PersonalizationQualitySummary {
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
    complaints: number;
    overrides: number;
    reversals: number;
    corrections: number;
  };
  calibration: Array<{
    band: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    samples: number;
    positiveOutcomes: number;
    observedPositiveRate: number | null;
    averageConfidence: number | null;
    calibrationGap: number | null;
  }>;
  incidents: {
    total: number;
    open: number;
    resolved: number;
    critical: number;
    resolutionRate: number | null;
    medianResolutionHours: number | null;
    byStatus: Array<{ status: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
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

export async function getPersonalizationQuality(
  windowDays = 30,
  now = new Date(),
): Promise<PersonalizationQualitySummary> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const [
    optionalProfilesEnabled,
    recommendationRows,
    feedbackRows,
    profileAnswerRows,
    calibrationRows,
    incidentRows,
  ] = await Promise.all([
    prisma.household.count({ where: { consentedAt: { gte: since }, consentVersion: { not: null } } }),
    prisma.personalizedRecommendation.groupBy({
      by: ['propertyId', 'definitionId', 'status'],
      // Measure guidance evaluated during the window, including a current row
      // first created before the window and refreshed since then.
      where: { lastEvaluatedAt: { gte: since } },
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
    prisma.personalizedRecommendation.findMany({
      where: { feedbackEvents: { some: { createdAt: { gte: since } } } },
      select: {
        confidence: true,
        feedbackEvents: {
          where: { createdAt: { gte: since } },
          select: { type: true },
        },
      },
    }),
    prisma.recommendationIncident.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true, type: true, severity: true, createdAt: true, resolvedAt: true },
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
  let complaints = 0;
  let overrides = 0;
  let reversals = 0;
  let corrections = 0;
  for (const row of feedbackRows) {
    const count = countOf(row);
    feedbackTotal += count;
    if (row.explicit) explicit += count;
    if (row.type === 'ACCEPTED') accepted += count;
    if (row.type === 'NOT_RELEVANT' || row.type === 'DISMISSED') negative += count;
    if (row.type === 'COMPLAINT') { complaints += count; negative += count; }
    if (row.type === 'RECOMMENDATION_OVERRIDDEN') overrides += count;
    if (row.type === 'RECOMMENDATION_REVERSED') { reversals += count; negative += count; }
    if (row.type === 'PROFILE_CORRECTED') corrections += count;
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

  type CalibrationAccumulator = { confidenceTotal: number; knownConfidence: number; samples: number; positive: number };
  const calibration = new Map<'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN', CalibrationAccumulator>();
  for (const band of ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'] as const) {
    calibration.set(band, { confidenceTotal: 0, knownConfidence: 0, samples: 0, positive: 0 });
  }
  for (const row of calibrationRows) {
    const types = new Set(row.feedbackEvents.map((event) => event.type));
    const isNegative = ['NOT_RELEVANT', 'DISMISSED', 'COMPLAINT', 'RECOMMENDATION_REVERSED']
      .some((type) => types.has(type));
    const isPositive = ['ACCEPTED', 'COMPLETED'].some((type) => types.has(type));
    if (!isNegative && !isPositive) continue;
    const band = row.confidence == null ? 'UNKNOWN' : row.confidence < 0.55 ? 'LOW' : row.confidence < 0.8 ? 'MEDIUM' : 'HIGH';
    const accumulator = calibration.get(band)!;
    accumulator.samples += 1;
    if (isPositive && !isNegative) accumulator.positive += 1;
    if (row.confidence != null) {
      accumulator.confidenceTotal += row.confidence;
      accumulator.knownConfidence += 1;
    }
  }

  const incidentStatusCounts = new Map<string, number>();
  const incidentTypeCounts = new Map<string, number>();
  const resolutionHours: number[] = [];
  for (const incident of incidentRows) {
    incidentStatusCounts.set(incident.status, (incidentStatusCounts.get(incident.status) ?? 0) + 1);
    incidentTypeCounts.set(incident.type, (incidentTypeCounts.get(incident.type) ?? 0) + 1);
    if (incident.resolvedAt) {
      resolutionHours.push((incident.resolvedAt.getTime() - incident.createdAt.getTime()) / 3_600_000);
    }
  }
  resolutionHours.sort((a, b) => a - b);
  const midpoint = Math.floor(resolutionHours.length / 2);
  const medianResolutionHours = resolutionHours.length === 0
    ? null
    : Number((resolutionHours.length % 2 === 1
      ? resolutionHours[midpoint]
      : (resolutionHours[midpoint - 1] + resolutionHours[midpoint]) / 2).toFixed(2));
  const resolvedIncidents = incidentRows.filter((incident) => incident.status === 'RESOLVED' || incident.status === 'CLOSED').length;

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
      complaints,
      overrides,
      reversals,
      corrections,
    },
    calibration: [...calibration.entries()].map(([band, value]) => {
      const observedPositiveRate = rate(value.positive, value.samples);
      const averageConfidence = value.knownConfidence === 0
        ? null
        : Number((value.confidenceTotal / value.knownConfidence).toFixed(4));
      return {
        band,
        samples: value.samples,
        positiveOutcomes: value.positive,
        observedPositiveRate,
        averageConfidence,
        calibrationGap: observedPositiveRate == null || averageConfidence == null
          ? null
          : Number(Math.abs(averageConfidence - observedPositiveRate).toFixed(4)),
      };
    }),
    incidents: {
      total: incidentRows.length,
      open: incidentRows.length - resolvedIncidents,
      resolved: resolvedIncidents,
      critical: incidentRows.filter((incident) => incident.severity === 'CRITICAL').length,
      resolutionRate: rate(resolvedIncidents, incidentRows.length),
      medianResolutionHours,
      byStatus: [...incidentStatusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => a.status.localeCompare(b.status)),
      byType: [...incidentTypeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => a.type.localeCompare(b.type)),
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
