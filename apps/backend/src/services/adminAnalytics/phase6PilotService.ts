import { prisma } from '../../lib/prisma';
import { resolveDateRange } from './schemas';

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;

export async function getPhase6PilotMetrics(fromRaw?: Date, toRaw?: Date) {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const assessments = await prisma.newHomePilotAssessment.findMany({ where: { assessedAt: { gte: range.from, lte: range.to } } });
  const plans = await prisma.newHomeSetupPlan.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: { tasks: true, punchListItems: true, warrantyRights: true, inspectionBundles: true },
  });
  const propertyIds = plans.map((plan) => plan.propertyId);
  const [registrations, evidence, repairJourneys, blockedSteps, verifiedOutcomes] = await Promise.all([
    prisma.newHomeSystemRegistration.findMany({ where: { propertyId: { in: propertyIds } } }),
    prisma.newHomeEvidenceRecord.findMany({ where: { propertyId: { in: propertyIds } } }),
    prisma.guidanceJourney.findMany({ where: { journeyTypeKey: 'asset_lifecycle_resolution', createdAt: { gte: range.from, lte: range.to } }, select: { id: true, status: true, completedAt: true } }),
    prisma.guidanceJourneyStep.count({ where: { journey: { journeyTypeKey: 'asset_lifecycle_resolution', createdAt: { gte: range.from, lte: range.to } }, status: 'BLOCKED' } }),
    prisma.homeEvent.count({ where: { type: 'VERIFIED_RESOLUTION', occurredAt: { gte: range.from, lte: range.to }, guidanceJourneyId: { not: null } } }),
  ]);
  const tasks = plans.flatMap((plan) => plan.tasks);
  const punch = plans.flatMap((plan) => plan.punchListItems);
  const rights = plans.flatMap((plan) => plan.warrantyRights);
  const bundles = plans.flatMap((plan) => plan.inspectionBundles);
  const eligible = assessments.filter((item) => item.decision === 'ELIGIBLE').length;
  const completedRepairJourneys = repairJourneys.filter((item) => item.status === 'COMPLETED').length;
  const expansionGate = {
    repairJourneyCompletion: { value: rate(completedRepairJourneys, repairJourneys.length), threshold: 0.6, denominator: repairJourneys.length },
    unresolvedBlockerRate: { value: rate(blockedSteps, repairJourneys.length), thresholdMaximum: 0.2, denominator: repairJourneys.length },
    verifiedOutcomeCoverage: { value: rate(verifiedOutcomes, completedRepairJourneys), threshold: 0.8, denominator: completedRepairJourneys },
  };
  const hasEvidence = repairJourneys.length > 0 && completedRepairJourneys > 0;
  const expansionReady = hasEvidence
    && expansionGate.repairJourneyCompletion.value >= expansionGate.repairJourneyCompletion.threshold
    && expansionGate.unresolvedBlockerRate.value <= expansionGate.unresolvedBlockerRate.thresholdMaximum
    && expansionGate.verifiedOutcomeCoverage.value >= expansionGate.verifiedOutcomeCoverage.threshold;
  return {
    metricVersion: 'phase6-v1',
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    cohort: { assessed: assessments.length, eligible, activatedPlans: plans.length, activationRate: rate(plans.length, eligible), averageAcquisitionCents: assessments.filter((item) => item.estimatedAcquisitionCents != null).reduce((sum, item) => sum + (item.estimatedAcquisitionCents ?? 0), 0) / Math.max(1, assessments.filter((item) => item.estimatedAcquisitionCents != null).length) },
    outcomes: {
      taskCompletion: { numerator: tasks.filter((item) => item.status === 'COMPLETED').length, denominator: tasks.length, rate: rate(tasks.filter((item) => item.status === 'COMPLETED').length, tasks.length) },
      punchListClosure: { numerator: punch.filter((item) => item.status === 'CLOSED').length, denominator: punch.length, rate: rate(punch.filter((item) => item.status === 'CLOSED').length, punch.length) },
      warrantyPromotion: { numerator: rights.filter((item) => item.deadlineTaskId).length, denominator: rights.filter((item) => item.status !== 'DRAFT').length, rate: rate(rights.filter((item) => item.deadlineTaskId).length, rights.filter((item) => item.status !== 'DRAFT').length) },
      registrationConfirmation: { numerator: registrations.filter((item) => item.status === 'CONFIRMED').length, denominator: registrations.length, rate: rate(registrations.filter((item) => item.status === 'CONFIRMED').length, registrations.length) },
      verifiedEvidence: { numerator: evidence.filter((item) => item.verifiedAt).length, denominator: evidence.length, rate: rate(evidence.filter((item) => item.verifiedAt).length, evidence.length) },
      inspectionBundleCompletion: { numerator: bundles.filter((item) => item.status === 'COMPLETED').length, denominator: bundles.length, rate: rate(bundles.filter((item) => item.status === 'COMPLETED').length, bundles.length) },
      recurringHandoff: { numerator: plans.filter((item) => item.handoffCompletedAt).length, denominator: plans.length, rate: rate(plans.filter((item) => item.handoffCompletedAt).length, plans.length) },
    },
    expansionGate: { status: expansionReady ? 'READY' : hasEvidence ? 'HOLD' : 'INSUFFICIENT_EVIDENCE', expansionReady, ...expansionGate, providerQualityVisibility: 'REPORTED_BY_PHASE3_PROVIDER_OUTCOME_METRICS', recommendationComprehension: 'REPORTED_BY_PHASE4_RECOMMENDATION_QUALITY_METRICS' },
  };
}
