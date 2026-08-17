import { Prisma, type BuyerPurchaseLenderReadiness } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerLenderConditionCreateInput,
  type BuyerLenderConditionUpdateInput,
  type BuyerPurchaseLenderReadinessUpdateInput,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const dateValue = (value: string | null | undefined) => value === undefined ? undefined : value === null ? null : new Date(value);
const dateText = (value: Date | null) => value?.toISOString() ?? null;
const mergedDate = (value: string | null | undefined, existing: Date | null | undefined) =>
  value === undefined ? existing ?? null : dateValue(value) ?? null;

function assertChronology(values: {
  appraisalOrderedAt: Date | null;
  appraisalScheduledAt: Date | null;
  appraisalCompletedAt: Date | null;
}) {
  if (values.appraisalOrderedAt && values.appraisalScheduledAt && values.appraisalScheduledAt < values.appraisalOrderedAt) {
    throw new APIError('The appraisal appointment cannot be before it was ordered.', 409, 'APPRAISAL_DATE_ORDER_INVALID');
  }
  if (values.appraisalScheduledAt && values.appraisalCompletedAt && values.appraisalCompletedAt < values.appraisalScheduledAt) {
    throw new APIError('The appraisal completion cannot be before the appointment.', 409, 'APPRAISAL_DATE_ORDER_INVALID');
  }
}

function serializeReadiness(readiness: BuyerPurchaseLenderReadiness & { conditions: Array<{
  id: string;
  category: string;
  status: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  blocking: boolean;
  resolvedAt: Date | null;
  recordedByUserId: string | null;
  lastUpdatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}> }) {
  return {
    ...readiness,
    appraisalOrderedAt: dateText(readiness.appraisalOrderedAt),
    appraisalScheduledAt: dateText(readiness.appraisalScheduledAt),
    appraisalCompletedAt: dateText(readiness.appraisalCompletedAt),
    appraisalIssueResolvedAt: dateText(readiness.appraisalIssueResolvedAt),
    clearToCloseRecordedAt: dateText(readiness.clearToCloseRecordedAt),
    createdAt: readiness.createdAt.toISOString(),
    updatedAt: readiness.updatedAt.toISOString(),
    conditions: readiness.conditions.map((condition) => ({
      ...condition,
      dueAt: dateText(condition.dueAt),
      resolvedAt: dateText(condition.resolvedAt),
      createdAt: condition.createdAt.toISOString(),
      updatedAt: condition.updatedAt.toISOString(),
    })),
  };
}

export class BuyerPurchaseLenderReadinessService {
  private static async requireSelectedPlan(propertyId: string) {
    const plan = await prisma.buyerPurchaseFinancingPlan.findFirst({
      where: { propertyId, purchasePath: 'FINANCED', selectedLoanEstimateRevisionId: { not: null } },
    });
    if (!plan?.selectedLoanEstimateRevisionId) {
      throw new APIError('Select a confirmed Loan Estimate before tracking lender readiness.', 409, 'PURCHASE_LOAN_SELECTION_REQUIRED');
    }
    const revision = await prisma.buyerPurchaseLoanEstimateRevision.findFirst({
      where: { id: plan.selectedLoanEstimateRevisionId, status: 'CONFIRMED', offer: { planId: plan.id } },
      select: { id: true },
    });
    if (!revision) {
      throw new APIError('The selected Loan Estimate is no longer current. Review and select the latest confirmed revision.', 409, 'PURCHASE_LOAN_SELECTION_STALE');
    }
    return plan;
  }

  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const plan = await prisma.buyerPurchaseFinancingPlan.findUnique({ where: { propertyId } });
    const readiness = await prisma.buyerPurchaseLenderReadiness.findUnique({
      where: { propertyId },
      include: { conditions: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }] } },
    });
    return {
      purchasePath: plan?.purchasePath ?? 'UNKNOWN',
      selectedRevisionId: plan?.selectedLoanEstimateRevisionId ?? null,
      readiness: readiness && readiness.selectedLoanEstimateRevisionId === plan?.selectedLoanEstimateRevisionId
        ? serializeReadiness(readiness)
        : null,
    };
  }

  static async updateReadiness(
    userId: string,
    propertyId: string,
    input: BuyerPurchaseLenderReadinessUpdateInput,
  ) {
    await assertAccess(userId, propertyId);
    const plan = await this.requireSelectedPlan(propertyId);
    const stored = await prisma.buyerPurchaseLenderReadiness.findUnique({ where: { propertyId } });
    const existing = stored?.selectedLoanEstimateRevisionId === plan.selectedLoanEstimateRevisionId ? stored : null;
    const now = new Date();
    const appraisalStatus = input.appraisalStatus ?? existing?.appraisalStatus ?? 'NOT_ORDERED';
    const appraisalOrderedAt = mergedDate(input.appraisalOrderedAt, existing?.appraisalOrderedAt);
    const appraisalScheduledAt = mergedDate(input.appraisalScheduledAt, existing?.appraisalScheduledAt);
    const appraisalCompletedAt = mergedDate(input.appraisalCompletedAt, existing?.appraisalCompletedAt);
    const appraisalIssueType = input.appraisalIssueType === undefined ? existing?.appraisalIssueType ?? null : input.appraisalIssueType;
    const appraisalIssueNotes = input.appraisalIssueNotes === undefined ? existing?.appraisalIssueNotes ?? null : input.appraisalIssueNotes;
    const underwritingStatus = input.underwritingStatus ?? existing?.underwritingStatus ?? 'NOT_STARTED';
    assertChronology({ appraisalOrderedAt, appraisalScheduledAt, appraisalCompletedAt });
    if (appraisalStatus === 'SCHEDULED' && !appraisalScheduledAt) {
      throw new APIError('Add the appraisal appointment before marking it scheduled.', 409, 'APPRAISAL_SCHEDULE_REQUIRED');
    }
    if (appraisalStatus === 'COMPLETED' && !appraisalCompletedAt) {
      throw new APIError('Add the appraisal completion time before marking it completed.', 409, 'APPRAISAL_COMPLETION_REQUIRED');
    }
    if (appraisalStatus === 'ISSUE_REPORTED' && !appraisalIssueType && !appraisalIssueNotes) {
      throw new APIError('Describe the user-reported appraisal value or condition issue.', 409, 'APPRAISAL_ISSUE_DETAIL_REQUIRED');
    }
    const issueResolvedAt = appraisalStatus === 'RESOLVED'
      ? dateValue(input.appraisalIssueResolvedAt) ?? existing?.appraisalIssueResolvedAt ?? now
      : null;
    const clearToCloseRecordedAt = underwritingStatus === 'USER_RECORDED_CLEAR_TO_CLOSE'
      ? existing?.clearToCloseRecordedAt ?? now
      : null;
    const clearToCloseRecordedByUserId = underwritingStatus === 'USER_RECORDED_CLEAR_TO_CLOSE' ? userId : null;

    await prisma.$transaction(async (tx) => {
      if (stored && !existing) {
        await tx.buyerPurchaseLenderCondition.deleteMany({ where: { readinessId: stored.id } });
      }
      const readiness = await tx.buyerPurchaseLenderReadiness.upsert({
        where: { propertyId },
        create: {
          planId: plan.id,
          propertyId,
          selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId!,
          appraisalStatus,
          appraisalOrderedAt,
          appraisalScheduledAt,
          appraisalCompletedAt,
          appraisalIssueType,
          appraisalIssueNotes,
          appraisalIssueResolvedAt: issueResolvedAt,
          underwritingStatus,
          clearToCloseRecordedAt,
          clearToCloseRecordedByUserId,
          lastUpdatedByUserId: userId,
        },
        update: {
          selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId!,
          appraisalStatus,
          appraisalOrderedAt,
          appraisalScheduledAt,
          appraisalCompletedAt,
          appraisalIssueType,
          appraisalIssueNotes,
          appraisalIssueResolvedAt: issueResolvedAt,
          underwritingStatus,
          clearToCloseRecordedAt,
          clearToCloseRecordedByUserId,
          lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, plan.checklistId, readiness.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async createCondition(userId: string, propertyId: string, input: BuyerLenderConditionCreateInput) {
    await assertAccess(userId, propertyId);
    const plan = await this.requireSelectedPlan(propertyId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const stored = await tx.buyerPurchaseLenderReadiness.findUnique({ where: { propertyId } });
      if (stored && stored.selectedLoanEstimateRevisionId !== plan.selectedLoanEstimateRevisionId) {
        await tx.buyerPurchaseLenderCondition.deleteMany({ where: { readinessId: stored.id } });
      }
      const readiness = await tx.buyerPurchaseLenderReadiness.upsert({
        where: { propertyId },
        create: {
          planId: plan.id,
          propertyId,
          selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId!,
          lastUpdatedByUserId: userId,
        },
        update: stored?.selectedLoanEstimateRevisionId === plan.selectedLoanEstimateRevisionId
          ? { lastUpdatedByUserId: userId }
          : {
              selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId!,
              appraisalStatus: 'NOT_ORDERED',
              appraisalOrderedAt: null,
              appraisalScheduledAt: null,
              appraisalCompletedAt: null,
              appraisalIssueType: null,
              appraisalIssueNotes: null,
              appraisalIssueResolvedAt: null,
              underwritingStatus: 'NOT_STARTED',
              clearToCloseRecordedAt: null,
              clearToCloseRecordedByUserId: null,
              lastUpdatedByUserId: userId,
            },
      });
      await tx.buyerPurchaseLenderCondition.create({
        data: {
          readinessId: readiness.id,
          propertyId,
          category: input.category,
          title: input.title,
          notes: input.notes,
          dueAt: dateValue(input.dueAt),
          blocking: input.blocking,
          recordedByUserId: userId,
          lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, plan.checklistId, readiness.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async updateCondition(
    userId: string,
    propertyId: string,
    conditionId: string,
    input: BuyerLenderConditionUpdateInput,
  ) {
    await assertAccess(userId, propertyId);
    const plan = await this.requireSelectedPlan(propertyId);
    const existing = await prisma.buyerPurchaseLenderCondition.findFirst({
      where: {
        id: conditionId,
        propertyId,
        readiness: { selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId! },
      },
    });
    if (!existing) throw new APIError('Lender condition not found.', 404, 'BUYER_LENDER_CONDITION_NOT_FOUND');
    const status = input.status ?? existing.status;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerPurchaseLenderCondition.update({
        where: { id: conditionId },
        data: {
          ...input,
          dueAt: dateValue(input.dueAt),
          resolvedAt: ['SATISFIED', 'WAIVED'].includes(status) ? existing.resolvedAt ?? now : null,
          lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, plan.checklistId, existing.readinessId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  private static async reconcile(
    tx: Prisma.TransactionClient,
    checklistId: string,
    readinessId: string,
    userId: string,
    now: Date,
  ) {
    const readiness = await tx.buyerPurchaseLenderReadiness.findUniqueOrThrow({
      where: { id: readinessId },
      include: { conditions: true },
    });
    const unresolved = readiness.conditions.filter((condition) => ['OPEN', 'SUBMITTED'].includes(condition.status));
    const blocking = unresolved.filter((condition) => condition.blocking || Boolean(condition.dueAt && condition.dueAt < now));
    const appraisalBlocked = readiness.appraisalStatus === 'ISSUE_REPORTED' && !readiness.appraisalIssueResolvedAt;
    const appraisalComplete = ['COMPLETED', 'RESOLVED'].includes(readiness.appraisalStatus);
    const allComplete = appraisalComplete
      && readiness.underwritingStatus === 'USER_RECORDED_CLEAR_TO_CLOSE'
      && unresolved.length === 0;
    const taskStatus = appraisalBlocked || blocking.length ? 'BLOCKED' : allComplete ? 'COMPLETED' : 'IN_PROGRESS';
    await tx.homeBuyerTask.updateMany({
      where: { checklistId, actionKey: BUYER_ACTION_KEYS.APPRAISAL_TRACKING },
      data: {
        status: taskStatus,
        statusReason: appraisalBlocked
          ? 'A user-reported appraisal issue needs professional resolution.'
          : blocking.length
            ? `${blocking.length} user-recorded lender condition(s) are blocking closing readiness.`
            : allComplete
              ? 'Appraisal is complete, lender conditions are dispositioned, and the buyer recorded clear-to-close status.'
              : 'Appraisal or lender-condition follow-up is in progress.',
        completedAt: allComplete ? now : null,
        completedByUserId: allComplete ? userId : null,
        completionMethod: allComplete ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: allComplete ? {
          lenderReadinessId: readiness.id,
          appraisalStatus: readiness.appraisalStatus,
          underwritingStatus: readiness.underwritingStatus,
          conditionIds: readiness.conditions.map((condition) => condition.id),
          userRecordedAt: now.toISOString(),
        } : Prisma.JsonNull,
      },
    });
    const milestoneStatus = appraisalComplete
      ? 'COMPLETED'
      : readiness.appraisalStatus === 'NOT_ORDERED' ? 'NOT_STARTED' : 'IN_PROGRESS';
    await tx.buyerJourneyMilestone.upsert({
      where: { checklistId_milestoneKey: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.APPRAISAL } },
      create: {
        checklistId,
        milestoneKey: BUYER_MILESTONE_KEYS.APPRAISAL,
        type: 'APPRAISAL',
        status: milestoneStatus,
        dueAt: readiness.appraisalScheduledAt,
        completedAt: appraisalComplete ? readiness.appraisalCompletedAt ?? readiness.appraisalIssueResolvedAt ?? now : null,
        sourceType: 'BUYER_PURCHASE_LENDER_READINESS',
        sourceEntityId: readiness.id,
        confidence: 1,
        notes: readiness.appraisalIssueNotes,
      },
      update: {
        status: milestoneStatus,
        dueAt: readiness.appraisalScheduledAt,
        completedAt: appraisalComplete ? readiness.appraisalCompletedAt ?? readiness.appraisalIssueResolvedAt ?? now : null,
        sourceType: 'BUYER_PURCHASE_LENDER_READINESS',
        sourceEntityId: readiness.id,
        confidence: 1,
        notes: readiness.appraisalIssueNotes,
      },
    });
  }
}
