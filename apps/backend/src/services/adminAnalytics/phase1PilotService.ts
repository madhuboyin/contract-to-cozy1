import { prisma } from '../../lib/prisma';
import { resolveDateRange } from './schemas';

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export async function getPhase1PilotMetrics(fromRaw?: Date, toRaw?: Date) {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const rows = await prisma.propertyOnboarding.findMany({
    where: { entryContextCapturedAt: { gte: range.from, lte: range.to } },
    select: {
      propertyId: true,
      entryContextCapturedAt: true,
      firstValueAt: true,
      firstValueFeedback: true,
      firstValueFeedbackAt: true,
      firstActionResolvedAt: true,
    },
  });

  const eligibleHomes = rows.length;
  const minimumSetupCompleted = rows.filter((row) => row.firstValueAt != null).length;
  const usefulNewIdentified = rows.filter((row) => row.firstValueFeedback === 'USEFUL_NEW').length;
  const usefulAnyIdentified = rows.filter((row) =>
    row.firstValueFeedback === 'USEFUL_NEW' || row.firstValueFeedback === 'USEFUL_KNOWN').length;
  const actionResolvedWithin30Days = rows.filter((row) => {
    if (!row.entryContextCapturedAt || !row.firstActionResolvedAt) return false;
    const elapsed = row.firstActionResolvedAt.getTime() - row.entryContextCapturedAt.getTime();
    return elapsed >= 0 && elapsed <= 30 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    metricVersion: 'phase1-v1',
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    eligibility: {
      definition: 'Distinct homes whose trigger-first entry context was captured during the selected period.',
      eligibleHomes,
    },
    metrics: {
      minimumSetupCompletion: {
        numerator: minimumSetupCompleted,
        denominator: eligibleHomes,
        rate: rate(minimumSetupCompleted, eligibleHomes),
        target: 0.6,
        definition: 'Eligible homes that received an evidence-bounded first value.',
      },
      usefulNewRecommendationIdentification: {
        numerator: usefulNewIdentified,
        denominator: eligibleHomes,
        rate: rate(usefulNewIdentified, eligibleHomes),
        target: 0.5,
        definition: 'Eligible homes whose homeowner explicitly marked the first recommendation useful and new.',
      },
      usefulRecommendationAny: {
        numerator: usefulAnyIdentified,
        denominator: eligibleHomes,
        rate: rate(usefulAnyIdentified, eligibleHomes),
        target: null,
        definition: 'Eligible homes marked useful and new or useful as a reminder.',
      },
      actionResolutionWithin30Days: {
        numerator: actionResolvedWithin30Days,
        denominator: eligibleHomes,
        rate: rate(actionResolvedWithin30Days, eligibleHomes),
        target: 0.3,
        definition: 'Eligible homes with a recorded first-action resolution within 30 days of entry-context capture.',
      },
    },
  };
}
