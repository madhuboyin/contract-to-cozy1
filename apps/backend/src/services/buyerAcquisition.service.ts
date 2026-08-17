import {
  BuyerFindingDisposition,
  BuyerPlanPhase,
  BuyerPlanPriority,
  DocumentVerificationStatus,
  InspectionFindingSeverity,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { HomeBuyerTaskService } from './HomeBuyerTask.service';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { assertBuyerJourneyStageTransition } from '../productFramework/buyerJourneyLifecycle.contract';

const DAY_MS = 86_400_000;

function severityPriority(severity: InspectionFindingSeverity): BuyerPlanPriority {
  if (severity === 'SAFETY') return 'NOW';
  if (severity === 'MAJOR') return 'SOON';
  if (severity === 'MINOR') return 'PLAN';
  return 'CONSIDER';
}

function guidanceSeverity(severity: InspectionFindingSeverity) {
  if (severity === 'SAFETY') return 'CRITICAL' as const;
  if (severity === 'MAJOR') return 'HIGH' as const;
  if (severity === 'MINOR') return 'MEDIUM' as const;
  return 'LOW' as const;
}

function maintenancePriority(priority: BuyerPlanPriority) {
  if (priority === 'NOW') return 'URGENT' as const;
  if (priority === 'SOON') return 'HIGH' as const;
  if (priority === 'PLAN') return 'MEDIUM' as const;
  return 'LOW' as const;
}

function taskAnchor(phase: BuyerPlanPhase, plan: {
  planStartDate: Date;
  targetCloseDate: Date | null;
  ownershipStartedAt: Date | null;
}) {
  if (['OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP'].includes(phase)) {
    return plan.targetCloseDate ?? plan.planStartDate;
  }
  return plan.ownershipStartedAt ?? plan.targetCloseDate ?? plan.planStartDate;
}

export class BuyerAcquisitionService {
  private static async assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
    const access = await resolvePropertyAccess(userId, propertyId);
    if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
      throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
    }
    return access;
  }

  private static async ensureClosingRepairHandoff(
    tx: Prisma.TransactionClient,
    propertyId: string,
    checklistId: string,
    now: Date,
  ) {
    const tasks = await tx.homeBuyerTask.findMany({
      where: {
        checklistId,
        phase: 'FIRST_30_DAYS',
        status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
        sourceEntityType: 'INSPECTION_FINDING',
        sourceEntityId: { not: null },
      },
    });
    for (const task of tasks) {
      const actionKey = `buyer-handoff:${task.actionKey}`;
      const maintenance = await tx.propertyMaintenanceTask.upsert({
        where: { propertyId_actionKey: { propertyId, actionKey } },
        create: {
          propertyId,
          title: task.title,
          description: task.description,
          status: task.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING',
          source: 'ACTION_CENTER',
          actionKey,
          assetType: 'BUYER_CLOSING_REPAIR_HANDOFF',
          category: task.phase,
          priority: maintenancePriority(task.priority),
          serviceCategory: task.serviceCategory,
          nextDueDate: task.dueAt ?? now,
          estimatedCost: task.estimatedCostCents == null ? null : task.estimatedCostCents / 100,
          assignedToUserId: task.assignedToUserId,
          completionMetadata: {
            sourceType: 'BUYER_CLOSING_REPAIR_HANDOFF',
            buyerTaskId: task.id,
            sourceEntityType: task.sourceEntityType,
            sourceEntityId: task.sourceEntityId,
            guidanceJourneyId: task.guidanceJourneyId,
          },
        },
        update: {},
      });
      await tx.homeBuyerTask.update({
        where: { id: task.id },
        data: { handedOffMaintenanceTaskId: maintenance.id },
      });
      await tx.inspectionFinding.updateMany({
        where: { id: task.sourceEntityId as string, propertyId },
        data: { buyerMaintenanceTaskId: maintenance.id },
      });
    }
  }

  static async updateLifecycle(userId: string, propertyId: string, input: {
    targetCloseDate?: string | null;
    moveInDate?: string | null;
    ownershipStartedAt?: string | null;
    stage?: import('@prisma/client').BuyerJourneyStage;
  }) {
    await this.assertAccess(userId, propertyId);
    const plan = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const targetCloseDate = input.targetCloseDate === undefined
      ? plan.targetCloseDate
      : input.targetCloseDate ? new Date(input.targetCloseDate) : null;
    const ownershipStartedAt = input.ownershipStartedAt === undefined
      ? plan.ownershipStartedAt
      : input.ownershipStartedAt ? new Date(input.ownershipStartedAt) : null;
    const moveInDate = input.moveInDate === undefined
      ? plan.moveInDate
      : input.moveInDate ? new Date(input.moveInDate) : null;
    const stage = input.stage ?? plan.stage;
    if (input.stage) assertBuyerJourneyStageTransition(plan.stage, input.stage);

    const updated = await prisma.$transaction(async (tx) => {
      const checklist = await tx.homeBuyerChecklist.update({
        where: { id: plan.id },
        data: {
          targetCloseDate,
          moveInDate,
          ownershipStartedAt,
          stage,
          lastStageChangedAt: input.stage && input.stage !== plan.stage ? new Date() : undefined,
        },
      });

      const tasks = await tx.homeBuyerTask.findMany({
        where: {
          checklistId: plan.id,
          anchorOffsetDays: { not: null },
          status: { notIn: ['COMPLETED', 'NOT_NEEDED', 'CANCELLED'] },
          userEditedAt: null,
        },
        select: { id: true, phase: true, anchorOffsetDays: true },
      });
      for (const task of tasks) {
        const anchor = taskAnchor(task.phase, checklist);
        await tx.homeBuyerTask.update({
          where: { id: task.id },
          data: { dueAt: new Date(anchor.getTime() + (task.anchorOffsetDays ?? 0) * DAY_MS) },
        });
      }

      if (['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'HANDED_OFF'].includes(stage)) {
        await this.ensureClosingRepairHandoff(tx, propertyId, plan.id, new Date());
      }

      const now = new Date();
      const ownershipState = ownershipStartedAt && ownershipStartedAt <= now
        ? 'RECENT_OWNER'
        : targetCloseDate ? 'UNDER_CONTRACT' : undefined;
      if (ownershipState) {
        await tx.propertyOnboarding.updateMany({
          where: { propertyId, entryPath: 'EXISTING_HOME_PURCHASE' },
          data: { ownershipState },
        });
      }
      return checklist;
    });

    return HomeBuyerTaskService.getOrCreateChecklist(userId, updated.propertyId);
  }

  static async getEvidenceReview(userId: string, propertyId: string) {
    await this.assertAccess(userId, propertyId, 'VIEWER');
    const [reports, documents] = await Promise.all([
      prisma.inspectionReport.findMany({
        where: { propertyId, status: { not: 'ARCHIVED' } },
        orderBy: { inspectionDate: 'desc' },
        include: {
          findings: {
            orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              reportId: true,
              homeSystem: true,
              subsystem: true,
              location: true,
              severity: true,
              status: true,
              inspectorDescription: true,
              aiInterpretation: true,
              estimatedCostCentsLow: true,
              estimatedCostCentsHigh: true,
              extractionConfidence: true,
              buyerDisposition: true,
              buyerDispositionNotes: true,
              buyerDispositionAt: true,
              buyerTaskId: true,
              buyerGuidanceJourneyId: true,
              buyerRepairJourneyId: true,
            },
          },
        },
      }),
      prisma.document.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          verificationStatus: true,
          verifiedAt: true,
          parserVersion: true,
          ocrQualityScore: true,
          createdAt: true,
        },
      }),
    ]);
    return { reports, documents };
  }

  static async verifyDocument(userId: string, propertyId: string, documentId: string, input: {
    status: Extract<DocumentVerificationStatus, 'VERIFIED' | 'REJECTED'>;
    notes?: string | null;
  }) {
    await this.assertAccess(userId, propertyId);
    const document = await prisma.document.findFirst({ where: { id: documentId, propertyId } });
    if (!document) throw new APIError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    const metadata = document.metadata && typeof document.metadata === 'object' && !Array.isArray(document.metadata)
      ? document.metadata as Record<string, unknown> : {};
    return prisma.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: input.status,
        verifiedAt: input.status === 'VERIFIED' ? new Date() : null,
        verifiedByUserId: input.status === 'VERIFIED' ? userId : null,
        metadata: { ...metadata, buyerReviewNotes: input.notes ?? null, buyerReviewedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
      select: { id: true, verificationStatus: true, verifiedAt: true },
    });
  }

  static async dispositionFinding(userId: string, propertyId: string, findingId: string, input: {
    disposition: Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'>;
    notes?: string | null;
    assignedToUserId?: string | null;
    dueAt?: string | null;
  }) {
    await this.assertAccess(userId, propertyId);
    const finding = await prisma.inspectionFinding.findFirst({
      where: { id: findingId, propertyId },
      include: { report: { select: { id: true, status: true, inspectionDate: true } } },
    });
    if (!finding) throw new APIError('Inspection finding not found.', 404, 'FINDING_NOT_FOUND');
    if (finding.report.status !== 'CONFIRMED') {
      throw new APIError('Confirm the inspection report before classifying findings.', 409, 'REPORT_NOT_CONFIRMED');
    }

    if (input.assignedToUserId) {
      const member = await prisma.householdMember.findUnique({
        where: { propertyId_userId: { propertyId, userId: input.assignedToUserId } },
      });
      if (!member) throw new APIError('Assigned user is not in this property household.', 400, 'INVALID_ASSIGNEE');
    }

    let taskId: string | null = finding.buyerTaskId;
    let journeyId: string | null = finding.buyerGuidanceJourneyId;
    let repairJourneyId: string | null = finding.buyerRepairJourneyId;
    let checklistId: string | null = null;
    const createsTask = input.disposition === 'PRE_CLOSE_NEGOTIATION' || input.disposition === 'POST_CLOSE_ACTION';
    if (createsTask) {
      const plan = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
      checklistId = plan.id;

      if (finding.severity === 'SAFETY' || finding.severity === 'MAJOR') {
        const result = await guidanceJourneyService.ingestSignal({
          propertyId,
          inventoryItemId: finding.inventoryItemId,
          signalIntentFamily: 'inspection_followup_needed',
          issueDomain: 'MAINTENANCE',
          severity: guidanceSeverity(finding.severity),
          severityScore: finding.severity === 'SAFETY' ? 100 : 80,
          confidenceScore: finding.extractionConfidence === 'HIGH' ? 0.9 : finding.extractionConfidence === 'MEDIUM' ? 0.7 : 0.5,
          sourceType: 'INSPECTION',
          sourceFeatureKey: 'buyer_acquisition_plan',
          sourceToolKey: 'inspection-report',
          sourceEntityType: 'INSPECTION_FINDING',
          sourceEntityId: finding.id,
          dedupeKey: `${propertyId}:inspection_followup_needed:INSPECTION_FINDING:${finding.id}`,
          duplicateGroupKey: `${propertyId}:inspection-finding:${finding.id}`,
          payloadJson: {
            findingId: finding.id,
            reportId: finding.report.id,
            homeSystem: finding.homeSystem,
            severity: finding.severity,
            description: finding.inspectorDescription,
            buyerDisposition: input.disposition,
            observedAt: finding.report.inspectionDate.toISOString(),
          },
          actorUserId: userId,
        });
        journeyId = result.journey.id;
        const repairResult = await guidanceJourneyService.ingestSignal({
          propertyId,
          inventoryItemId: finding.inventoryItemId,
          signalIntentFamily: 'maintenance_failure_risk',
          issueDomain: 'ASSET_LIFECYCLE',
          severity: guidanceSeverity(finding.severity),
          severityScore: finding.severity === 'SAFETY' ? 100 : 80,
          confidenceScore: finding.extractionConfidence === 'HIGH' ? 0.9 : finding.extractionConfidence === 'MEDIUM' ? 0.7 : 0.5,
          sourceType: 'INSPECTION',
          sourceFeatureKey: 'buyer_acquisition_plan',
          sourceToolKey: 'buyer-plan',
          sourceEntityType: 'INSPECTION_FINDING',
          sourceEntityId: finding.id,
          dedupeKey: `${propertyId}:maintenance_failure_risk:INSPECTION_FINDING:${finding.id}`,
          duplicateGroupKey: `${propertyId}:major-repair:inspection-finding:${finding.id}`,
          missingContextKeys: finding.inventoryItemId ? [] : ['inventory_item_link'],
          payloadJson: {
            findingId: finding.id,
            reportId: finding.report.id,
            homeSystem: finding.homeSystem,
            severity: finding.severity,
            description: finding.inspectorDescription,
            buyerDisposition: input.disposition,
            branchSourceJourneyId: journeyId,
            observedAt: finding.report.inspectionDate.toISOString(),
          },
          actorUserId: userId,
        });
        repairJourneyId = repairResult.journey.id;
      }
    }

    const dismissed = input.disposition === 'DISMISSED';
    const verifiedFact = input.disposition === 'VERIFIED_FACT';
    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const linkedJourneyIds = Array.from(new Set([
        finding.buyerGuidanceJourneyId,
        finding.buyerRepairJourneyId,
        journeyId,
        repairJourneyId,
      ].filter(Boolean) as string[]));

      if (createsTask && checklistId) {
        const actionKey = `buyer:inspection-finding:${finding.id}`;
        const existing = await tx.homeBuyerTask.findUnique({
          where: { checklistId_actionKey: { checklistId, actionKey } },
        });
        const phase: BuyerPlanPhase = input.disposition === 'PRE_CLOSE_NEGOTIATION' ? 'DUE_DILIGENCE' : 'FIRST_30_DAYS';
        const title = `${input.disposition === 'PRE_CLOSE_NEGOTIATION' ? 'Negotiate' : 'Address'} ${finding.homeSystem.toLowerCase().replace(/_/g, ' ')} finding`;
        const canonicalTaskData: Pick<Prisma.HomeBuyerTaskUncheckedCreateInput,
          'title' | 'description' | 'phase' | 'priority' | 'sourceType' | 'sourceEntityType' |
          'sourceEntityId' | 'homeActionKey' | 'guidanceJourneyId'> = {
          title,
          description: finding.inspectorDescription,
          phase,
          priority: severityPriority(finding.severity),
          sourceType: 'INSPECTION_FINDING' as const,
          sourceEntityType: 'INSPECTION_FINDING',
          sourceEntityId: finding.id,
          homeActionKey: `inspection:${finding.id}`,
          guidanceJourneyId: repairJourneyId ?? journeyId,
        };
        const task = existing
          ? await tx.homeBuyerTask.update({
            where: { id: existing.id },
            data: {
              ...canonicalTaskData,
              status: ['NOT_NEEDED', 'CANCELLED'].includes(existing.status) ? 'PENDING' : existing.status,
              completedAt: ['NOT_NEEDED', 'CANCELLED'].includes(existing.status) ? null : existing.completedAt,
              ...(input.dueAt !== undefined
                ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
                : {}),
              ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
            },
          })
          : await tx.homeBuyerTask.create({
            data: {
              checklistId,
              actionKey,
              ...canonicalTaskData,
              dueAt: input.dueAt ? new Date(input.dueAt) : null,
              assignedToUserId: input.assignedToUserId ?? userId,
            },
          });
        taskId = task.id;

        if (linkedJourneyIds.length) {
          const linkedJourneys = await tx.guidanceJourney.findMany({
            where: { id: { in: linkedJourneyIds }, propertyId },
            select: { id: true, primarySignalId: true, status: true },
          });
          await tx.guidanceJourney.updateMany({
            where: {
              id: { in: linkedJourneys.map((item) => item.id) },
              status: { in: ['DISMISSED', 'ARCHIVED', 'ABORTED'] },
            },
            data: { status: 'ACTIVE', completedAt: null },
          });
          const signalIds = linkedJourneys.map((item) => item.primarySignalId).filter(Boolean) as string[];
          if (signalIds.length) {
            await tx.guidanceSignal.updateMany({
              where: { id: { in: signalIds }, propertyId },
              data: { status: 'ACTIVE', archivedAt: null },
            });
          }
        }
      } else {
        if (finding.buyerTaskId) {
          await tx.homeBuyerTask.updateMany({
            where: {
              id: finding.buyerTaskId,
              checklist: { propertyId },
              status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
            },
            data: { status: 'NOT_NEEDED', completedAt: null },
          });
        }
        if (linkedJourneyIds.length) {
          const linkedJourneys = await tx.guidanceJourney.findMany({
            where: { id: { in: linkedJourneyIds }, propertyId },
            select: { id: true, primarySignalId: true },
          });
          await tx.guidanceJourney.updateMany({
            where: { id: { in: linkedJourneys.map((item) => item.id) }, propertyId },
            data: { status: 'DISMISSED', completedAt: now },
          });
          const signalIds = linkedJourneys.map((item) => item.primarySignalId).filter(Boolean) as string[];
          if (signalIds.length) {
            await tx.guidanceSignal.updateMany({
              where: { id: { in: signalIds }, propertyId },
              data: { status: 'ARCHIVED', archivedAt: now },
            });
          }
        }
      }

      const row = await tx.inspectionFinding.update({
        where: { id: finding.id },
        data: {
          buyerDisposition: input.disposition,
          buyerDispositionNotes: input.notes ?? null,
          buyerDispositionAt: now,
          buyerDispositionByUserId: userId,
          buyerTaskId: taskId,
          buyerGuidanceJourneyId: journeyId,
          buyerRepairJourneyId: repairJourneyId,
          status: dismissed ? 'DISMISSED' : verifiedFact ? 'ACCEPTED_AS_IS' : 'OPEN',
          resolutionMethod: dismissed ? 'DISMISSED' : null,
          resolutionNotes: dismissed ? input.notes ?? 'Dismissed during buyer review' : null,
          resolvedAt: dismissed ? now : null,
        },
      });
      const openFindings = await tx.inspectionFinding.count({
        where: { reportId: finding.report.id, status: 'OPEN' },
      });
      await tx.inspectionReport.update({
        where: { id: finding.report.id },
        data: { openFindings },
      });
      return row;
    });
    return { finding: updated, taskId, guidanceJourneyId: journeyId, repairJourneyId };
  }

  static async ensureRecurringHandoff(userId: string, propertyId: string, now = new Date()) {
    await this.assertAccess(userId, propertyId);
    const plan = await prisma.homeBuyerChecklist.findUnique({
      where: { propertyId },
      include: {
        property: { select: { onboarding: { select: { ownershipState: true } } } },
        tasks: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
            phase: { in: ['MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'] },
          },
        },
      },
    });
    if (!plan) return { handedOff: false, reason: 'NO_BUYER_PLAN', taskCount: 0 };
    if (plan.handoffCompletedAt) return { handedOff: true, reason: 'ALREADY_HANDED_OFF', taskCount: 0 };

    const ownershipAnchor = plan.ownershipStartedAt ?? plan.targetCloseDate ?? plan.planStartDate;
    const day91Reached = now.getTime() >= ownershipAnchor.getTime() + 90 * DAY_MS;
    const established = plan.property.onboarding?.ownershipState === 'ESTABLISHED_OWNER';
    if (!day91Reached && !established) return { handedOff: false, reason: 'NOT_DUE', taskCount: 0 };

    let taskCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const task of plan.tasks) {
        const actionKey = `buyer-handoff:${task.actionKey}`;
        const maintenance = await tx.propertyMaintenanceTask.upsert({
          where: { propertyId_actionKey: { propertyId, actionKey } },
          create: {
            propertyId,
            title: task.title,
            description: task.description,
            status: task.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING',
            source: 'ACTION_CENTER',
            actionKey,
            assetType: 'BUYER_90_DAY_HANDOFF',
            category: task.phase,
            priority: maintenancePriority(task.priority),
            serviceCategory: task.serviceCategory,
            nextDueDate: task.dueAt ?? now,
            estimatedCost: task.estimatedCostCents == null ? null : task.estimatedCostCents / 100,
            assignedToUserId: task.assignedToUserId,
            completionMetadata: {
              sourceType: 'BUYER_90_DAY_PLAN',
              buyerTaskId: task.id,
              sourceEntityType: task.sourceEntityType,
              sourceEntityId: task.sourceEntityId,
              guidanceJourneyId: task.guidanceJourneyId,
            },
          },
          update: {},
        });
        await tx.homeBuyerTask.update({
          where: { id: task.id },
          data: { handedOffMaintenanceTaskId: maintenance.id },
        });
        if (task.sourceEntityType === 'INSPECTION_FINDING' && task.sourceEntityId) {
          await tx.inspectionFinding.updateMany({
            where: { id: task.sourceEntityId, propertyId },
            data: { buyerMaintenanceTaskId: maintenance.id },
          });
        }
        taskCount += 1;
      }
      await tx.homeBuyerChecklist.update({
        where: { id: plan.id },
        data: { status: 'HANDED_OFF', transitionedToRecurringAt: now, handoffCompletedAt: now },
      });
    });
    return { handedOff: true, reason: day91Reached ? 'DAY_91_REACHED' : 'OWNERSHIP_ESTABLISHED', taskCount };
  }

  static async getAcceptanceStatus(userId: string, propertyId: string) {
    await this.assertAccess(userId, propertyId, 'VIEWER');
    const plan = await prisma.homeBuyerChecklist.findUnique({ where: { propertyId }, include: { tasks: true } });
    if (!plan) throw new APIError('Buyer plan not found.', 404, 'BUYER_PLAN_NOT_FOUND');
    const [findingTotal, reviewedFindings, materialTotal, materialBranched, verifiedDocuments, documentTotal] = await Promise.all([
      prisma.inspectionFinding.count({ where: { propertyId, report: { status: 'CONFIRMED' } } }),
      prisma.inspectionFinding.count({ where: { propertyId, buyerDisposition: { not: 'PENDING_REVIEW' } } }),
      prisma.inspectionFinding.count({ where: { propertyId, severity: { in: ['SAFETY', 'MAJOR'] }, buyerDisposition: { in: ['PRE_CLOSE_NEGOTIATION', 'POST_CLOSE_ACTION'] } } }),
      prisma.inspectionFinding.count({ where: { propertyId, severity: { in: ['SAFETY', 'MAJOR'] }, buyerDisposition: { in: ['PRE_CLOSE_NEGOTIATION', 'POST_CLOSE_ACTION'] }, buyerRepairJourneyId: { not: null } } }),
      prisma.document.count({ where: { propertyId, verificationStatus: 'VERIFIED' } }),
      prisma.document.count({ where: { propertyId } }),
    ]);
    const assignedTasks = plan.tasks.filter((task) => task.assignedToUserId).length;
    const completedTasks = plan.tasks.filter((task) => task.status === 'COMPLETED').length;
    return {
      propertyId,
      planStatus: plan.status,
      findings: { total: findingTotal, reviewed: reviewedFindings, material: materialTotal, materialBranched },
      documents: { total: documentTotal, verified: verifiedDocuments },
      tasks: { total: plan.tasks.length, assigned: assignedTasks, completed: completedTasks },
      handoff: { completed: Boolean(plan.handoffCompletedAt), completedAt: plan.handoffCompletedAt },
      acceptanceReady: findingTotal === reviewedFindings
        && materialTotal === materialBranched
        && assignedTasks === plan.tasks.length
        && documentTotal === verifiedDocuments
        && Boolean(plan.handoffCompletedAt),
    };
  }
}
