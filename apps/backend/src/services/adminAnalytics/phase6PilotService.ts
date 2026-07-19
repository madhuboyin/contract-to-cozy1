import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { NewHomePilotAdmissionInputSchema } from '../../productFramework/newHomeSetup.contract';
import { resolveDateRange } from './schemas';

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;
const hours = (milliseconds: number) => milliseconds / 3_600_000;

export async function decidePhase6PilotAdmission(
  propertyId: string,
  reviewerUserId: string,
  rawInput: unknown,
) {
  const input = NewHomePilotAdmissionInputSchema.parse(rawInput);
  const assessment = await prisma.newHomePilotAssessment.findUnique({ where: { propertyId } });
  if (!assessment) throw new APIError('Pilot assessment not found.', 404, 'NEW_HOME_PILOT_ASSESSMENT_NOT_FOUND');
  if (input.decision === 'ADMITTED' && assessment.decision !== 'ELIGIBLE') {
    throw new APIError('Only a qualified assessment can be admitted.', 409, 'NEW_HOME_PILOT_NOT_QUALIFIED');
  }
  return prisma.newHomePilotAssessment.update({
    where: { propertyId },
    data: {
      admissionDecision: input.decision,
      admissionReasons: input.reasons,
      cohortKey: input.decision === 'ADMITTED' ? input.cohortKey : null,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
    },
  });
}

function metaBoolean(meta: unknown, key: string): boolean {
  return Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>)[key] === true);
}

export async function getPhase6PilotMetrics(fromRaw?: Date, toRaw?: Date) {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const assessments = await prisma.newHomePilotAssessment.findMany({
    where: { assessedAt: { gte: range.from, lte: range.to } },
    orderBy: { assessedAt: 'desc' },
  });
  const plans = await prisma.newHomeSetupPlan.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: { tasks: true, punchListItems: true, warrantyRights: true, inspectionBundles: true },
  });
  const propertyIds = plans.map((plan) => plan.propertyId);
  const repairJourneys = await prisma.guidanceJourney.findMany({
    where: { journeyTypeKey: 'asset_lifecycle_resolution', createdAt: { gte: range.from, lte: range.to } },
    include: {
      steps: { select: { status: true, blockedAt: true, unblockedAt: true } },
      projectRecord: {
        include: {
          providerReview: { select: { status: true, verifiedOutcome: true } },
          writeBacks: { select: { targetSystem: true } },
        },
      },
      homeEvents: { where: { type: 'VERIFIED_RESOLUTION' }, select: { meta: true } },
    },
  });
  const [registrations, evidence] = await Promise.all([
    prisma.newHomeSystemRegistration.findMany({ where: { propertyId: { in: propertyIds } } }),
    prisma.newHomeEvidenceRecord.findMany({ where: { propertyId: { in: propertyIds } } }),
  ]);

  const tasks = plans.flatMap((plan) => plan.tasks);
  const punch = plans.flatMap((plan) => plan.punchListItems);
  const rights = plans.flatMap((plan) => plan.warrantyRights);
  const bundles = plans.flatMap((plan) => plan.inspectionBundles);
  const eligible = assessments.filter((item) => item.decision === 'ELIGIBLE').length;
  const admitted = assessments.filter((item) => item.admissionDecision === 'ADMITTED').length;
  const completed = repairJourneys.filter((item) => item.status === 'COMPLETED');
  const completedProjects = completed.map((item) => item.projectRecord).filter(Boolean);
  const providerProjects = completedProjects.filter((project) => project!.fulfillmentMode === 'PROVIDER');
  const now = new Date();
  const unresolvedBlockerMilliseconds = repairJourneys.reduce((total, journey) => total + journey.steps.reduce((stepTotal, step) => {
    if (step.status !== 'BLOCKED' || !step.blockedAt) return stepTotal;
    return stepTotal + Math.max(0, now.getTime() - step.blockedAt.getTime());
  }, 0), 0);
  const verifiedOutcomes = completed.filter((journey) => journey.homeEvents.length > 0).length;
  const comprehensionConfirmed = completed.filter((journey) =>
    journey.projectRecord?.recommendationComprehensionConfirmed
    || journey.homeEvents.some((event) => metaBoolean(event.meta, 'recommendationComprehensionConfirmed'))).length;
  const providerQualityVisible = providerProjects.filter((project) =>
    project!.providerReview?.status === 'APPROVED' && project!.providerReview.verifiedOutcome).length;
  const recurringCareConverted = completed.filter((journey) =>
    journey.projectRecord?.writeBacks.some((writeBack) => writeBack.targetSystem === 'FUTURE_CARE')
    || journey.homeEvents.some((event) => metaBoolean(event.meta, 'recurringCareConverted'))).length;

  const minimumCompletedJourneys = Number(process.env.PHASE6_EXPANSION_MIN_COMPLETED_JOURNEYS || 5);
  const minimumProviderJourneys = Number(process.env.PHASE6_EXPANSION_MIN_PROVIDER_JOURNEYS || 3);
  const expansionGate = {
    milestoneCompletion: { value: rate(completed.length, repairJourneys.length), threshold: 0.6, denominator: repairJourneys.length },
    unresolvedBlockerHoursPerJourney: { value: hours(unresolvedBlockerMilliseconds) / Math.max(1, repairJourneys.length), thresholdMaximum: 72, denominator: repairJourneys.length },
    recommendationComprehension: { value: rate(comprehensionConfirmed, completed.length), threshold: 0.8, denominator: completed.length },
    verifiedOutcomeWriteBack: { value: rate(verifiedOutcomes, completed.length), threshold: 0.8, denominator: completed.length },
    providerQualityVisibility: { value: rate(providerQualityVisible, providerProjects.length), threshold: 0.8, denominator: providerProjects.length },
    recurringCareConversion: { value: rate(recurringCareConverted, completed.length), threshold: 0.8, denominator: completed.length },
    sampleSize: { completedJourneys: completed.length, minimumCompletedJourneys, providerJourneys: providerProjects.length, minimumProviderJourneys },
  };
  const hasEvidence = repairJourneys.length > 0 && completed.length >= minimumCompletedJourneys && providerProjects.length >= minimumProviderJourneys;
  const expansionReady = hasEvidence
    && expansionGate.milestoneCompletion.value >= expansionGate.milestoneCompletion.threshold
    && expansionGate.unresolvedBlockerHoursPerJourney.value <= expansionGate.unresolvedBlockerHoursPerJourney.thresholdMaximum
    && expansionGate.recommendationComprehension.value >= expansionGate.recommendationComprehension.threshold
    && expansionGate.verifiedOutcomeWriteBack.value >= expansionGate.verifiedOutcomeWriteBack.threshold
    && expansionGate.providerQualityVisibility.value >= expansionGate.providerQualityVisibility.threshold
    && expansionGate.recurringCareConversion.value >= expansionGate.recurringCareConversion.threshold;

  return {
    metricVersion: 'phase6-v2',
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    cohort: {
      assessed: assessments.length,
      eligible,
      admitted,
      activatedPlans: plans.length,
      qualificationRate: rate(eligible, assessments.length),
      admissionRate: rate(admitted, eligible),
      activationRate: rate(plans.length, admitted),
      averageAcquisitionCents: assessments.filter((item) => item.estimatedAcquisitionCents != null).reduce((sum, item) => sum + (item.estimatedAcquisitionCents ?? 0), 0) / Math.max(1, assessments.filter((item) => item.estimatedAcquisitionCents != null).length),
    },
    admissionQueue: assessments.map((item) => ({
      propertyId: item.propertyId,
      qualificationDecision: item.decision,
      qualificationReasons: item.decisionReasons,
      admissionDecision: item.admissionDecision,
      admissionReasons: item.admissionReasons,
      cohortKey: item.cohortKey,
      assessedAt: item.assessedAt,
      reviewedAt: item.reviewedAt,
      channelSource: item.channelSource,
      estimatedAcquisitionCents: item.estimatedAcquisitionCents,
    })),
    outcomes: {
      taskCompletion: { numerator: tasks.filter((item) => item.status === 'COMPLETED').length, denominator: tasks.length, rate: rate(tasks.filter((item) => item.status === 'COMPLETED').length, tasks.length) },
      punchListClosure: { numerator: punch.filter((item) => item.status === 'CLOSED').length, denominator: punch.length, rate: rate(punch.filter((item) => item.status === 'CLOSED').length, punch.length) },
      warrantyPromotion: { numerator: rights.filter((item) => item.deadlineTaskId).length, denominator: rights.filter((item) => item.status !== 'DRAFT').length, rate: rate(rights.filter((item) => item.deadlineTaskId).length, rights.filter((item) => item.status !== 'DRAFT').length) },
      registrationConfirmation: { numerator: registrations.filter((item) => item.status === 'CONFIRMED').length, denominator: registrations.length, rate: rate(registrations.filter((item) => item.status === 'CONFIRMED').length, registrations.length) },
      verifiedEvidence: { numerator: evidence.filter((item) => item.verifiedAt).length, denominator: evidence.length, rate: rate(evidence.filter((item) => item.verifiedAt).length, evidence.length) },
      inspectionBundleCompletion: { numerator: bundles.filter((item) => item.status === 'COMPLETED').length, denominator: bundles.length, rate: rate(bundles.filter((item) => item.status === 'COMPLETED').length, bundles.length) },
      recurringHandoff: { numerator: plans.filter((item) => item.handoffCompletedAt).length, denominator: plans.length, rate: rate(plans.filter((item) => item.handoffCompletedAt).length, plans.length) },
    },
    expansionGate: { status: expansionReady ? 'READY' : hasEvidence ? 'BLOCKED' : 'INSUFFICIENT_EVIDENCE', expansionReady, ...expansionGate },
  };
}
