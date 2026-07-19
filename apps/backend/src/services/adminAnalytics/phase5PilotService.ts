import { prisma } from '../../lib/prisma';
import { resolveDateRange } from './schemas';

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export async function getPhase5PilotMetrics(fromRaw?: Date, toRaw?: Date) {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const plans = await prisma.homeBuyerChecklist.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: {
      tasks: { select: { status: true, assignedToUserId: true } },
      property: {
        select: {
          inspectionFindings: {
            select: { severity: true, buyerDisposition: true, buyerRepairJourneyId: true },
          },
          documents: { select: { verificationStatus: true } },
        },
      },
    },
  });

  const eligibleHomes = plans.length;
  const homesWithEveryFindingReviewed = plans.filter((plan) =>
    plan.property.inspectionFindings.every((finding) => finding.buyerDisposition !== 'PENDING_REVIEW')).length;
  const actionableMaterial = plans.flatMap((plan) => plan.property.inspectionFindings).filter((finding) =>
    ['SAFETY', 'MAJOR'].includes(finding.severity)
    && ['PRE_CLOSE_NEGOTIATION', 'POST_CLOSE_ACTION'].includes(finding.buyerDisposition));
  const materialBranched = actionableMaterial.filter((finding) => Boolean(finding.buyerRepairJourneyId)).length;
  const homesWithAllTasksAssigned = plans.filter((plan) =>
    plan.tasks.length > 0 && plan.tasks.every((task) => Boolean(task.assignedToUserId))).length;
  const totalTasks = plans.flatMap((plan) => plan.tasks);
  const completedTasks = totalTasks.filter((task) => task.status === 'COMPLETED').length;
  const totalDocuments = plans.flatMap((plan) => plan.property.documents);
  const verifiedDocuments = totalDocuments.filter((document) => document.verificationStatus === 'VERIFIED').length;
  const handedOffHomes = plans.filter((plan) => Boolean(plan.handoffCompletedAt)).length;

  return {
    metricVersion: 'phase5-v1',
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    eligibility: {
      definition: 'Property-scoped buyer acquisition plans created during the selected period.',
      eligibleHomes,
    },
    metrics: {
      completeFindingReview: { numerator: homesWithEveryFindingReviewed, denominator: eligibleHomes, rate: rate(homesWithEveryFindingReviewed, eligibleHomes) },
      materialRepairBranching: { numerator: materialBranched, denominator: actionableMaterial.length, rate: rate(materialBranched, actionableMaterial.length) },
      householdOwnershipCoverage: { numerator: homesWithAllTasksAssigned, denominator: eligibleHomes, rate: rate(homesWithAllTasksAssigned, eligibleHomes) },
      taskCompletion: { numerator: completedTasks, denominator: totalTasks.length, rate: rate(completedTasks, totalTasks.length) },
      documentVerification: { numerator: verifiedDocuments, denominator: totalDocuments.length, rate: rate(verifiedDocuments, totalDocuments.length) },
      recurringHomeHandoff: { numerator: handedOffHomes, denominator: eligibleHomes, rate: rate(handedOffHomes, eligibleHomes) },
    },
  };
}
