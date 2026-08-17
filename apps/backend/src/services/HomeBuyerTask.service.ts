import {
  BuyerPlanPhase,
  BuyerPlanPriority,
  BuyerTaskSourceType,
  HomeBuyerTask,
  HomeBuyerTaskStatus,
  RecurrenceFrequency,
  ServiceCategory,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import {
  BUYER_ACTION_KEYS,
  BUYER_CHECKLIST_TEMPLATE_VERSION,
  BUYER_MILESTONE_KEYS,
  BuyerClosingHomeResponseSchema,
  BuyerImportReadinessSchema,
  BuyerPlanOverviewSchema,
} from '../productFramework/buyerAcquisition.contract';
import { getPropertyContext } from '../modules/propertyContext';
import {
  BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
  composeBuyerChecklist,
} from './buyerChecklistComposition.service';

type TaskInput = {
  title: string;
  description?: string;
  actionKey?: string;
  phase?: BuyerPlanPhase;
  priority?: BuyerPlanPriority;
  dueAt?: string | Date | null;
  serviceCategory?: ServiceCategory | null;
  assignedToUserId?: string | null;
  sourceType?: BuyerTaskSourceType;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  guidanceJourneyId?: string | null;
  homeActionKey?: string | null;
  completionEvidenceJson?: Record<string, unknown> | null;
};

export type BuyerEntryPlanInput = {
  purchaseStage: 'EXPLORING' | 'OFFER_MADE' | 'UNDER_CONTRACT';
  targetCloseDate?: string | null;
  moveInDate?: string | null;
  inspectionStatus: 'NOT_SCHEDULED' | 'SCHEDULED' | 'REPORT_AVAILABLE' | 'REVIEWED';
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function offsetDate(anchor: Date, days: number): Date {
  return new Date(anchor.getTime() + days * DAY_MS);
}

function customActionKey(title: string): string {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `buyer:user:${slug || 'task'}:${Date.now()}`;
}

function entryStage(input: BuyerEntryPlanInput): 'EXPLORING' | 'OFFER_CONTRACT' | 'DUE_DILIGENCE' {
  if (input.purchaseStage === 'UNDER_CONTRACT') return 'DUE_DILIGENCE';
  if (input.purchaseStage === 'OFFER_MADE') return 'OFFER_CONTRACT';
  return 'EXPLORING';
}

function taskAnchorForEntry(
  phase: BuyerPlanPhase,
  plan: { planStartDate: Date; targetCloseDate: Date | null; moveInDate: Date | null },
): Date {
  if (['OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP'].includes(phase)) {
    return plan.targetCloseDate ?? plan.planStartDate;
  }
  if (['MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'].includes(phase)) {
    return plan.moveInDate ?? plan.targetCloseDate ?? plan.planStartDate;
  }
  return plan.planStartDate;
}

const CLOSING_HOME_LANES = [
  { key: 'CONTRACT' as const, label: 'Contract', phases: ['OFFER_CONTRACT'] as BuyerPlanPhase[] },
  { key: 'DUE_DILIGENCE' as const, label: 'Due diligence', phases: ['DUE_DILIGENCE'] as BuyerPlanPhase[] },
  { key: 'CLOSING' as const, label: 'Closing readiness', phases: ['CLOSING_PREP'] as BuyerPlanPhase[] },
  { key: 'MOVE' as const, label: 'Move & possession', phases: ['MOVE_IN'] as BuyerPlanPhase[] },
];

function milestoneLabel(type: string, customLabel: string | null): string {
  if (customLabel) return customLabel;
  return type.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function closingTaskSummary(task: {
  id: string;
  actionKey: string;
  title: string;
  description: string | null;
  status: HomeBuyerTaskStatus;
  phase: BuyerPlanPhase;
  priority: BuyerPlanPriority;
  checklistSection: HomeBuyerTask['checklistSection'];
  dueAt: Date | null;
  assignedToUserId: string | null;
}) {
  return {
    id: task.id,
    actionKey: task.actionKey,
    title: task.title,
    description: task.description,
    status: task.status,
    phase: task.phase,
    priority: task.priority,
    checklistSection: task.checklistSection,
    dueAt: task.dueAt?.toISOString() ?? null,
    assignedToUserId: task.assignedToUserId,
  };
}

function planOverviewTask(task: HomeBuyerTask) {
  return {
    id: task.id,
    actionKey: task.actionKey,
    title: task.title,
    description: task.description,
    status: task.status,
    phase: task.phase,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    assignedToUserId: task.assignedToUserId,
    taskType: task.taskType,
    checklistSection: task.checklistSection,
    templateKey: task.templateKey,
    evidenceRequirement: task.evidenceRequirement,
    applicability: task.applicability,
    blocking: task.blocking,
    required: task.required,
    statusReason: task.statusReason,
    notes: task.notes,
    assignedContactId: task.assignedContactId,
    sourceType: task.sourceType,
    estimatedCostCents: task.estimatedCostCents,
    bookingId: task.bookingId,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt?.toISOString() ?? null,
    completionMethod: task.completionMethod,
    completionDocumentId: task.completionDocumentId,
    canonicalWorkItemId: task.canonicalWorkItemId,
    handedOffMaintenanceTaskId: task.handedOffMaintenanceTaskId,
    updatedAt: task.updatedAt.toISOString(),
  };
}

/** Property-scoped acquisition and first-90-days ownership plan. */
export class HomeBuyerTaskService {
  private static async assertAccess(
    userId: string,
    propertyId: string,
    minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR',
  ) {
    const access = await resolvePropertyAccess(userId, propertyId);
    if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
      throw new Error('Property not found or user does not have access.');
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        onboarding: {
          select: { entryPath: true, ownershipState: true },
        },
        homeBuyerChecklist: { select: { id: true } },
      },
    });
    if (!property) throw new Error('Property not found or user does not have access.');

    const context = property.onboarding;
    const eligible = property.homeBuyerChecklist
      || context?.entryPath === 'EXISTING_HOME_PURCHASE'
      || ['SHOPPING', 'UNDER_CONTRACT', 'RECENT_OWNER'].includes(context?.ownershipState ?? '');
    if (!eligible) {
      throw new Error('The buyer acquisition plan is only available for a purchase or recent-owner property context.');
    }
    return property;
  }

  /**
   * Read-only dashboard dispatcher and bounded Buyer Closing Home payload.
   * This method never creates a plan or mutates lifecycle state, so an owned
   * property remains independent of buyer records and buyer failures.
   */
  static async getClosingHomePresentation(userId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        OR: [
          { homeownerProfile: { userId } },
          { householdMembers: { some: { userId } } },
        ],
      },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        onboarding: {
          select: { entryPath: true, propertyOrigin: true, ownershipState: true },
        },
        householdMembers: {
          where: { userId },
          select: { role: true },
        },
        homeBuyerChecklist: {
          include: {
            tasks: {
              orderBy: [{ dueAt: 'asc' }, { sortOrder: 'asc' }],
            },
            milestones: {
              orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
            },
            contacts: {
              select: { id: true },
            },
          },
        },
        documents: {
          select: { verificationStatus: true },
        },
        inspectionReports: {
          where: { status: { not: 'ARCHIVED' } },
          select: {
            status: true,
            findings: {
              where: {
                severity: { in: ['SAFETY', 'MAJOR'] },
                status: 'OPEN',
              },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!property) throw new Error('Property not found or user does not have access.');

    const isNewHome = property.onboarding?.entryPath === 'NEW_HOME_SETUP'
      && property.onboarding.propertyOrigin === 'NEW_CONSTRUCTION';
    if (isNewHome) {
      return BuyerClosingHomeResponseSchema.parse({ presentationMode: 'NEW_HOME', overview: null });
    }

    const plan = property.homeBuyerChecklist;
    const isRecentOwner = Boolean(
      plan
      && ['ACTIVE', 'PAUSED'].includes(plan.status)
      && plan.ownershipStartedAt
      && ['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90'].includes(plan.stage)
      && property.onboarding?.ownershipState === 'RECENT_OWNER',
    );
    const isClosingJourney = Boolean(
      plan
      && ['ACTIVE', 'PAUSED'].includes(plan.status)
      && !['CLOSED', 'HANDED_OFF'].includes(plan.stage),
    );
    const isCandidateProperty = ['CANCELLED', 'ARCHIVED'].includes(plan?.status ?? '')
      || (!plan && property.onboarding?.entryPath === 'EXISTING_HOME_PURCHASE');
    if (isCandidateProperty) {
      return BuyerClosingHomeResponseSchema.parse({ presentationMode: 'CANDIDATE', overview: null });
    }
    if (isRecentOwner && plan?.ownershipStartedAt) {
      const ownershipTasks = plan.tasks.filter((task) =>
        task.applicability !== 'NOT_APPLICABLE'
        && ['MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'].includes(task.phase),
      );
      const resolved = ownershipTasks.filter((task) =>
        ['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(task.status),
      ).length;
      const active = ownershipTasks.filter((task) =>
        ['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(task.status),
      ).length;
      const total = ownershipTasks.length;
      const now = new Date();
      const daysSinceOwnershipStart = Math.min(
        90,
        Math.max(0, Math.floor((now.getTime() - plan.ownershipStartedAt.getTime()) / DAY_MS)),
      );
      const verifiedDocumentCount = property.documents.filter((document) => document.verificationStatus === 'VERIFIED').length;
      const openMaterialFindingCount = property.inspectionReports.reduce((count, report) => count + report.findings.length, 0);
      const activeBuyerTasks = plan.tasks.filter((task) =>
        task.applicability !== 'NOT_APPLICABLE'
        && ['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(task.status),
      );
      const hasBuyerUrgency = openMaterialFindingCount > 0 || activeBuyerTasks.some((task) =>
        task.status === 'BLOCKED'
        || task.blocking
        || task.priority === 'NOW'
        || Boolean(task.dueAt && task.dueAt.getTime() <= now.getTime()),
      );
      const completedOwnershipTaskCount = ownershipTasks.filter((task) => task.status === 'COMPLETED').length;
      const successMoment = completedOwnershipTaskCount >= 2
        ? 'FIRST_90_DAY_PROGRESS'
        : verifiedDocumentCount >= 2
          ? 'VERIFIED_HOME_RECORD'
          : null;

      return BuyerClosingHomeResponseSchema.parse({
        presentationMode: 'RECENT_OWNER',
        overview: null,
        recentOwner: {
          property: {
            id: property.id,
            address: property.address,
            city: property.city,
            state: property.state,
            zipCode: property.zipCode,
          },
          journey: {
            stage: plan.stage,
            ownershipStartedAt: plan.ownershipStartedAt.toISOString(),
            daysSinceOwnershipStart,
            progress: {
              resolved,
              total,
              percent: total === 0 ? 0 : Math.round((resolved / total) * 100),
              active,
            },
          },
          evidence: {
            documentCount: property.documents.length,
            verifiedDocumentCount,
            inspectionReportCount: property.inspectionReports.length,
            openMaterialFindingCount,
          },
          advocacy: {
            eligible: Boolean(successMoment) && !hasBuyerUrgency,
            successMoment,
            inviteAvailable: property.householdMembers.some((member) => member.role === 'OWNER'),
          },
          routes: {
            plan: `/dashboard/properties/${property.id}/buyer-plan`,
            timeline: `/dashboard/properties/${property.id}/timeline`,
            homeRecords: `/dashboard/properties/${property.id}/tools/home-records`,
            homeOperations: `/dashboard/properties/${property.id}/home-operations`,
            household: `/dashboard/properties/${property.id}/household?invite=1`,
            ask: `/dashboard/ask?propertyId=${encodeURIComponent(property.id)}`,
          },
        },
      });
    }
    if (!plan || !isClosingJourney) {
      return BuyerClosingHomeResponseSchema.parse({ presentationMode: 'HOMEOWNER', overview: null });
    }

    const visibleTasks = plan.tasks.filter((task) =>
      task.applicability !== 'NOT_APPLICABLE'
      && !['FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'].includes(task.phase),
    );
    const activeTasks = visibleTasks.filter((task) =>
      !['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(task.status),
    );
    const priorityRank: Record<BuyerPlanPriority, number> = { NOW: 0, SOON: 1, PLAN: 2, CONSIDER: 3 };
    const executableTasks = activeTasks
      .filter((task) => task.status !== 'BLOCKED')
      .sort((left, right) => {
        const leftDue = left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue || priorityRank[left.priority] - priorityRank[right.priority] || left.sortOrder - right.sortOrder;
      });
    const blockers = activeTasks.filter((task) => task.status === 'BLOCKED' || task.blocking);
    const completed = visibleTasks.filter((task) => task.status === 'COMPLETED').length;
    const total = visibleTasks.length;
    const verifiedDocumentCount = property.documents.filter((document) => document.verificationStatus === 'VERIFIED').length;
    const reviewPendingReports = property.inspectionReports.filter((report) => report.status === 'REVIEW_PENDING').length;
    const processingReports = property.inspectionReports.filter((report) => report.status === 'PROCESSING').length;
    const confirmedReports = property.inspectionReports.filter((report) => report.status === 'CONFIRMED').length;
    const inspectionState = reviewPendingReports > 0
      ? 'REVIEW_PENDING'
      : processingReports > 0
        ? 'PROCESSING'
        : confirmedReports > 0
          ? 'CONFIRMED'
          : 'NOT_STARTED';

    return BuyerClosingHomeResponseSchema.parse({
      presentationMode: 'BUYER_CLOSING',
      overview: {
        property: {
          id: property.id,
          address: property.address,
          city: property.city,
          state: property.state,
          zipCode: property.zipCode,
        },
        journey: {
          status: plan.status,
          stage: plan.stage,
          targetCloseDate: plan.targetCloseDate?.toISOString() ?? null,
          moveInDate: plan.moveInDate?.toISOString() ?? null,
          progress: {
            completed,
            total,
            percent: total === 0 ? 0 : Math.round((completed / total) * 100),
          },
        },
        nextAction: executableTasks[0] ? closingTaskSummary(executableTasks[0]) : null,
        blockers: blockers.slice(0, 5).map(closingTaskSummary),
        milestones: plan.milestones
          .filter((milestone) => !['CANCELLED', 'WAIVED'].includes(milestone.status))
          .slice(0, 6)
          .map((milestone) => ({
            id: milestone.id,
            milestoneKey: milestone.milestoneKey,
            type: milestone.type,
            label: milestoneLabel(milestone.type, milestone.customLabel),
            status: milestone.status,
            dueAt: milestone.dueAt?.toISOString() ?? null,
          })),
        readinessLanes: CLOSING_HOME_LANES.map((lane) => {
          const tasks = visibleTasks.filter((task) => lane.phases.includes(task.phase));
          return {
            key: lane.key,
            label: lane.label,
            completed: tasks.filter((task) => task.status === 'COMPLETED').length,
            total: tasks.length,
            blocked: tasks.filter((task) => task.status === 'BLOCKED' || task.blocking).length,
          };
        }),
        evidence: {
          inspectionState,
          inspectionReportCount: property.inspectionReports.length,
          openMaterialFindingCount: property.inspectionReports.reduce((count, report) => count + report.findings.length, 0),
          documentCount: property.documents.length,
          verifiedDocumentCount,
          documentsNeedingReviewCount: property.documents.length - verifiedDocumentCount,
        },
        people: {
          contactCount: plan.contacts.length,
          assignedTaskCount: visibleTasks.filter((task) => Boolean(task.assignedToUserId || task.assignedContactId)).length,
        },
        routes: {
          plan: `/dashboard/properties/${property.id}/buyer-plan`,
          documents: `/dashboard/properties/${property.id}/documents`,
          inspection: `/dashboard/properties/${property.id}/inspection-hub`,
          ask: `/dashboard/ask?propertyId=${encodeURIComponent(property.id)}`,
        },
      },
    });
  }

  /** Read-only, one-query core Buyer Plan workspace overview. */
  static async getPlanOverview(userId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        OR: [
          { homeownerProfile: { userId } },
          { householdMembers: { some: { userId } } },
        ],
      },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        homeownerProfile: { select: { userId: true } },
        householdMembers: {
          select: {
            userId: true,
            role: true,
            displayName: true,
            user: { select: { firstName: true, lastName: true } },
          },
          orderBy: [{ isPrimaryOwner: 'desc' }, { joinedAt: 'asc' }],
        },
        homeBuyerChecklist: {
          include: {
            tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] },
            milestones: { orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }] },
            contacts: { orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] },
          },
        },
      },
    });
    if (!property) throw new Error('Property not found or user does not have access.');
    const plan = property.homeBuyerChecklist;
    if (!plan) throw new Error('Buyer plan not found.');

    const member = property.householdMembers.find((candidate) => candidate.userId === userId);
    const accessRole = property.homeownerProfile.userId === userId ? 'OWNER' : member?.role ?? 'VIEWER';
    const activeTasks = plan.tasks.filter((task) =>
      task.applicability !== 'NOT_APPLICABLE'
      && !['COMPLETED', 'NOT_NEEDED', 'CANCELLED', 'BLOCKED'].includes(task.status),
    );
    const priorityRank: Record<BuyerPlanPriority, number> = { NOW: 0, SOON: 1, PLAN: 2, CONSIDER: 3 };
    const nextAction = plan.status === 'PAUSED' ? null : [...activeTasks].sort((left, right) => {
      const leftDue = left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue || priorityRank[left.priority] - priorityRank[right.priority] || left.sortOrder - right.sortOrder;
    })[0] ?? null;
    const count = (status: HomeBuyerTaskStatus) => plan.tasks.filter((task) => task.status === status).length;
    const completed = count('COMPLETED');
    const total = plan.tasks.length;
    const assignedCount = new Map<string, number>();
    for (const task of plan.tasks) {
      if (task.assignedToUserId) assignedCount.set(task.assignedToUserId, (assignedCount.get(task.assignedToUserId) ?? 0) + 1);
    }
    const history = [
      ...plan.tasks.map((task) => ({
        id: `task:${task.id}`,
        kind: 'TASK' as const,
        label: task.title,
        status: task.status,
        occurredAt: task.updatedAt.toISOString(),
      })),
      ...plan.milestones.map((milestone) => ({
        id: `milestone:${milestone.id}`,
        kind: 'MILESTONE' as const,
        label: milestoneLabel(milestone.type, milestone.customLabel),
        status: milestone.status,
        occurredAt: milestone.updatedAt.toISOString(),
      })),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 12);

    return BuyerPlanOverviewSchema.parse({
      property: {
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
      },
      accessRole,
      plan: {
        id: plan.id,
        propertyId: plan.propertyId,
        status: plan.status,
        stage: plan.stage,
        planStartDate: plan.planStartDate.toISOString(),
        targetCloseDate: plan.targetCloseDate?.toISOString() ?? null,
        moveInDate: plan.moveInDate?.toISOString() ?? null,
        ownershipStartedAt: plan.ownershipStartedAt?.toISOString() ?? null,
        pausedAt: plan.pausedAt?.toISOString() ?? null,
        cancelledAt: plan.cancelledAt?.toISOString() ?? null,
        cancellationReason: plan.cancellationReason,
        generationVersion: plan.generationVersion,
        handoffCompletedAt: plan.handoffCompletedAt?.toISOString() ?? null,
      },
      tasks: plan.tasks.map(planOverviewTask),
      milestones: plan.milestones.map((milestone) => ({
        id: milestone.id,
        milestoneKey: milestone.milestoneKey,
        type: milestone.type,
        label: milestoneLabel(milestone.type, milestone.customLabel),
        status: milestone.status,
        dueAt: milestone.dueAt?.toISOString() ?? null,
      })),
      contacts: plan.contacts.map((contact) => ({
        id: contact.id,
        role: contact.role,
        name: contact.name,
        company: contact.company,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
      })),
      summary: {
        total,
        pending: count('PENDING'),
        inProgress: count('IN_PROGRESS'),
        blocked: count('BLOCKED'),
        completed,
        notNeeded: count('NOT_NEEDED'),
        cancelled: count('CANCELLED'),
        progressPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
      },
      nextAction: nextAction ? planOverviewTask(nextAction) : null,
      workload: property.householdMembers.map((householdMember) => ({
        userId: householdMember.userId,
        displayName: householdMember.displayName,
        firstName: householdMember.user.firstName,
        lastName: householdMember.user.lastName,
        role: householdMember.role,
        assignedTaskCount: assignedCount.get(householdMember.userId) ?? 0,
      })),
      history,
    });
  }

  static async getOrCreateChecklist(userId: string, propertyId: string) {
    const property = await this.assertAccess(userId, propertyId);
    const existing = await prisma.homeBuyerChecklist.findUnique({
      where: { propertyId },
      include: { tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
    });
    if (existing) return existing;

    return this.createChecklistWithDefaults(propertyId, userId, property.onboarding?.ownershipState);
  }

  static async getChecklist(userId: string, propertyId: string) {
    await this.assertAccess(userId, propertyId, 'VIEWER');
    const checklist = await prisma.homeBuyerChecklist.findUnique({
      where: { propertyId },
      include: {
        tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] },
        milestones: { orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }] },
        contacts: { orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!checklist) throw new Error('Buyer plan not found.');
    return checklist;
  }

  /** Read-only applicability evaluation and exact before/after checklist delta. */
  static async previewChecklistComposition(userId: string, propertyId: string) {
    const checklist = await this.getChecklist(userId, propertyId);
    const context = await getPropertyContext(
      propertyId,
      { userId },
      { scopes: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS'] },
    );
    return composeBuyerChecklist(context, checklist.tasks.map((task) => ({
      actionKey: task.actionKey,
      applicability: task.applicability,
      generationVersion: task.generationVersion,
    })));
  }

  /** Apply a preview without resetting completion, evidence, assignments, notes, or user edits. */
  static async applyChecklistComposition(userId: string, propertyId: string) {
    await this.assertAccess(userId, propertyId, 'CONTRIBUTOR');
    const checklist = await this.getChecklist(userId, propertyId);
    const composition = await this.previewChecklistComposition(userId, propertyId);
    const existingByActionKey = new Map(checklist.tasks.map((task) => [task.actionKey, task]));

    await prisma.$transaction(async (tx) => {
      for (const [index, item] of composition.items.entries()) {
        const existing = existingByActionKey.get(item.actionKey);
        const applicabilityData = {
          applicability: item.applicability.result,
          applicabilityRuleKey: item.ruleKey,
          applicabilityReasonCodes: item.applicability.reasonCodes,
          applicabilityUsedFactKeys: item.applicability.usedFactKeys,
          applicabilityMissingFactKeys: item.applicability.missingFactKeys,
          applicabilityConflictedFactKeys: item.applicability.conflictedFactKeys,
          applicabilityBasisHash: item.applicability.basisHash,
          applicabilityEvaluatedAt: new Date(item.applicability.evaluatedAt),
        } as const;

        // A user-confirmed not-applicable decision outranks later template
        // evaluation until the user explicitly changes that decision.
        if (existing?.userEditedAt && existing.applicability === 'NOT_APPLICABLE') {
          continue;
        }

        if (item.applicability.result !== 'APPLICABLE') {
          if (existing?.generationVersion?.startsWith('buyer-phase-checklists-')) {
            await tx.homeBuyerTask.update({ where: { id: existing.id }, data: applicabilityData });
          }
          continue;
        }

        if (!existing) {
          const anchor = taskAnchorForEntry(item.phase, checklist);
          await tx.homeBuyerTask.create({
            data: {
              checklistId: checklist.id,
              actionKey: item.actionKey,
              templateKey: item.templateKey,
              templateVersion: item.templateVersion,
              generatedBy: 'SYSTEM_TEMPLATE',
              generationVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
              title: item.title,
              description: item.description,
              whyMatters: item.whyMatters,
              completionCriteria: item.completionCriteria,
              blockedGuidance: item.blockedGuidance,
              phase: item.phase,
              priority: item.priority,
              taskType: item.taskType,
              checklistSection: item.checklistSection,
              evidenceRequirement: item.evidenceRequirement,
              required: item.required,
              blocking: item.blocking,
              dueAt: item.anchorOffsetDays === null ? null : offsetDate(anchor, item.anchorOffsetDays),
              anchorOffsetDays: item.anchorOffsetDays,
              assignedToUserId: userId,
              sourceType: 'SYSTEM',
              sortOrder: index + 1,
              ...applicabilityData,
            },
          });
          continue;
        }

        const preservesUserWork = Boolean(
          existing.userEditedAt
          || ['COMPLETED', 'NOT_NEEDED', 'CANCELLED'].includes(existing.status)
          || existing.completionEvidenceJson
          || existing.notes,
        );
        const anchor = taskAnchorForEntry(item.phase, checklist);
        await tx.homeBuyerTask.update({
          where: { id: existing.id },
          data: {
            ...applicabilityData,
            templateKey: item.templateKey,
            templateVersion: item.templateVersion,
            generationVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
            generatedBy: existing.generatedBy ?? 'SYSTEM_TEMPLATE',
            ...(preservesUserWork ? {} : {
              title: item.title,
              description: item.description,
              whyMatters: item.whyMatters,
              completionCriteria: item.completionCriteria,
              blockedGuidance: item.blockedGuidance,
              phase: item.phase,
              priority: item.priority,
              taskType: item.taskType,
              checklistSection: item.checklistSection,
              evidenceRequirement: item.evidenceRequirement,
              required: item.required,
              blocking: item.blocking,
              anchorOffsetDays: item.anchorOffsetDays,
              dueAt: item.anchorOffsetDays === null ? null : offsetDate(anchor, item.anchorOffsetDays),
            }),
          },
        });
      }
      await tx.homeBuyerChecklist.update({
        where: { id: checklist.id },
        data: { generationVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION },
      });
    });

    return {
      ...composition,
      applied: true as const,
      checklist: await this.getChecklist(userId, propertyId),
    };
  }

  static async initializeFromEntryContext(
    userId: string,
    propertyId: string,
    input: BuyerEntryPlanInput,
  ) {
    const plan = await this.getOrCreateChecklist(userId, propertyId);
    const targetCloseDate = input.targetCloseDate ? new Date(input.targetCloseDate) : null;
    const moveInDate = input.moveInDate ? new Date(input.moveInDate) : null;
    const stage = entryStage(input);
    const now = new Date();
    const inspectionMilestoneStatus = input.inspectionStatus === 'REVIEWED'
      ? 'COMPLETED'
      : input.inspectionStatus === 'NOT_SCHEDULED'
        ? 'NOT_STARTED'
        : 'IN_PROGRESS';

    await prisma.$transaction(async (tx) => {
      const checklist = await tx.homeBuyerChecklist.update({
        where: { id: plan.id },
        data: {
          stage,
          targetCloseDate,
          moveInDate,
          lastStageChangedAt: plan.stage === stage ? plan.lastStageChangedAt : now,
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
        const anchor = taskAnchorForEntry(task.phase, checklist);
        await tx.homeBuyerTask.update({
          where: { id: task.id },
          data: { dueAt: offsetDate(anchor, task.anchorOffsetDays ?? 0) },
        });
      }

      await tx.buyerJourneyMilestone.upsert({
        where: {
          checklistId_milestoneKey: {
            checklistId: plan.id,
            milestoneKey: BUYER_MILESTONE_KEYS.INSPECTION,
          },
        },
        create: {
          checklistId: plan.id,
          milestoneKey: BUYER_MILESTONE_KEYS.INSPECTION,
          type: 'INSPECTION',
          status: inspectionMilestoneStatus,
          completedAt: inspectionMilestoneStatus === 'COMPLETED' ? now : null,
          sourceType: 'USER_ONBOARDING',
          confidence: 1,
        },
        update: {
          status: inspectionMilestoneStatus,
          completedAt: inspectionMilestoneStatus === 'COMPLETED' ? now : null,
          sourceType: 'USER_ONBOARDING',
          confidence: 1,
        },
      });

      await tx.buyerJourneyMilestone.upsert({
        where: {
          checklistId_milestoneKey: {
            checklistId: plan.id,
            milestoneKey: BUYER_MILESTONE_KEYS.CLOSING,
          },
        },
        create: {
          checklistId: plan.id,
          milestoneKey: BUYER_MILESTONE_KEYS.CLOSING,
          type: 'CLOSING',
          dueAt: targetCloseDate,
          sourceType: 'USER_ONBOARDING',
          confidence: targetCloseDate ? 1 : null,
        },
        update: {
          dueAt: targetCloseDate,
          sourceType: 'USER_ONBOARDING',
          confidence: targetCloseDate ? 1 : null,
        },
      });

      if (moveInDate) {
        await tx.buyerJourneyMilestone.upsert({
          where: {
            checklistId_milestoneKey: {
              checklistId: plan.id,
              milestoneKey: BUYER_MILESTONE_KEYS.MOVE_IN,
            },
          },
          create: {
            checklistId: plan.id,
            milestoneKey: BUYER_MILESTONE_KEYS.MOVE_IN,
            type: 'MOVE_IN',
            dueAt: moveInDate,
            sourceType: 'USER_ONBOARDING',
            confidence: 1,
          },
          update: {
            dueAt: moveInDate,
            sourceType: 'USER_ONBOARDING',
            confidence: 1,
          },
        });
      }

      const completedMilestone = input.purchaseStage === 'UNDER_CONTRACT'
        ? { key: BUYER_MILESTONE_KEYS.CONTRACT_ACCEPTED, type: 'CONTRACT_ACCEPTED' as const }
        : input.purchaseStage === 'OFFER_MADE'
          ? { key: BUYER_MILESTONE_KEYS.OFFER_SUBMITTED, type: 'OFFER_SUBMITTED' as const }
          : null;
      if (completedMilestone) {
        await tx.buyerJourneyMilestone.upsert({
          where: {
            checklistId_milestoneKey: {
              checklistId: plan.id,
              milestoneKey: completedMilestone.key,
            },
          },
          create: {
            checklistId: plan.id,
            milestoneKey: completedMilestone.key,
            type: completedMilestone.type,
            status: 'COMPLETED',
            completedAt: now,
            sourceType: 'USER_ONBOARDING',
            confidence: 1,
          },
          update: {
            status: 'COMPLETED',
            completedAt: now,
            sourceType: 'USER_ONBOARDING',
            confidence: 1,
          },
        });
      }
    });

    return this.getChecklist(userId, propertyId);
  }

  private static async createChecklistWithDefaults(
    propertyId: string,
    ownerUserId: string,
    ownershipState?: string | null,
  ) {
    const now = new Date();
    const defaults = [
      [BUYER_ACTION_KEYS.INSPECTION_IMPORT, 'Import inspection report', 'Bring inspection findings into the property record for review.', 'DUE_DILIGENCE', 'NOW', -21, ServiceCategory.INSPECTION],
      [BUYER_ACTION_KEYS.INSPECTION_VERIFY, 'Verify material inspection findings', 'Confirm safety and major findings before deciding what belongs in negotiation or ownership.', 'DUE_DILIGENCE', 'NOW', -14, null],
      [BUYER_ACTION_KEYS.NEGOTIATION_SEPARATE, 'Separate pre-close negotiation from ownership work', 'Record which findings are resolved by the seller and which transfer into your ownership plan.', 'DUE_DILIGENCE', 'SOON', -10, ServiceCategory.ATTORNEY],
      [BUYER_ACTION_KEYS.COVERAGE_BIND, 'Confirm homeowners coverage', 'Bind coverage and store the policy before ownership begins.', 'CLOSING_PREP', 'NOW', -5, ServiceCategory.INSURANCE],
      [BUYER_ACTION_KEYS.CLOSING_DOCUMENTS, 'Store closing, disclosure, and warranty documents', 'Keep the durable source documents attached to this property.', 'CLOSING_PREP', 'SOON', 0, null],
      [BUYER_ACTION_KEYS.SAFETY_ACCESS, 'Secure access and verify life-safety basics', 'Rekey locks and verify smoke and carbon-monoxide protection.', 'FIRST_30_DAYS', 'NOW', 2, ServiceCategory.LOCKSMITH],
      [BUYER_ACTION_KEYS.UTILITIES_SETUP, 'Confirm utilities and essential services', 'Verify power, water, gas, waste, internet, and emergency shutoff access.', 'FIRST_30_DAYS', 'NOW', 3, null],
      [BUYER_ACTION_KEYS.INSPECTION_REPAIR_JOURNEYS, 'Start repair journeys for material findings', 'Turn each accepted major or safety finding into a scoped, traceable repair journey.', 'FIRST_30_DAYS', 'SOON', 10, null],
      [BUYER_ACTION_KEYS.HOUSEHOLD_RESPONSIBILITY, 'Assign household responsibilities', 'Choose owners for recurring care, documents, coverage, and urgent home decisions.', 'FIRST_30_DAYS', 'PLAN', 21, null],
      [BUYER_ACTION_KEYS.SYSTEMS_BASELINE, 'Build home systems baseline', 'Capture age, condition, warranty, and maintenance context for major systems.', 'DAYS_31_TO_90', 'PLAN', 45, ServiceCategory.HVAC],
      [BUYER_ACTION_KEYS.MAINTENANCE_FIRST_CYCLE, 'Schedule the first maintenance cycle', 'Prioritize seasonal and preventive work using verified property context.', 'DAYS_31_TO_90', 'PLAN', 60, null],
      [BUYER_ACTION_KEYS.RECURRING_HANDOFF, 'Review the recurring Home plan', 'Confirm unresolved work, owners, timing, and the next normal Home feed actions.', 'RECURRING_HOME', 'CONSIDER', 90, null],
    ] as const;

    return prisma.homeBuyerChecklist.create({
      data: {
        propertyId,
        planStartDate: now,
        stage: ownershipState === 'UNDER_CONTRACT'
          ? 'DUE_DILIGENCE'
          : ownershipState === 'RECENT_OWNER'
            ? 'FIRST_30_DAYS'
            : 'EXPLORING',
        lastStageChangedAt: now,
        generationVersion: BUYER_CHECKLIST_TEMPLATE_VERSION,
        tasks: {
          create: defaults.map(([actionKey, title, description, phase, priority, days, serviceCategory], index) => ({
            actionKey,
            templateKey: actionKey,
            templateVersion: BUYER_CHECKLIST_TEMPLATE_VERSION,
            generatedBy: 'SYSTEM_TEMPLATE',
            generationVersion: BUYER_CHECKLIST_TEMPLATE_VERSION,
            title,
            description,
            phase,
            priority,
            dueAt: offsetDate(now, days),
            anchorOffsetDays: days,
            serviceCategory,
            assignedToUserId: ownerUserId,
            sourceType: 'SYSTEM',
            sortOrder: index + 1,
          })),
        },
      },
      include: { tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
    });
  }

  static async getTasks(userId: string, propertyId: string) {
    return (await this.getChecklist(userId, propertyId)).tasks;
  }

  static async getTask(
    userId: string,
    propertyId: string,
    taskId: string,
    minimum: 'VIEWER' | 'CONTRIBUTOR' = 'VIEWER',
  ) {
    await this.assertAccess(userId, propertyId, minimum);
    const task = await prisma.homeBuyerTask.findFirst({
      where: { id: taskId, checklist: { propertyId } },
      include: { booking: true },
    });
    if (!task) throw new Error('Task not found or user does not have access.');
    return task;
  }

  static async updateTaskStatus(userId: string, propertyId: string, taskId: string, status: HomeBuyerTaskStatus): Promise<HomeBuyerTask> {
    await this.getTask(userId, propertyId, taskId, 'CONTRIBUTOR');
    return prisma.homeBuyerTask.update({
      where: { id: taskId },
      data: {
        status,
        userEditedAt: new Date(),
        completedAt: status === 'COMPLETED' ? new Date() : null,
        completedByUserId: status === 'COMPLETED' ? userId : null,
        completionMethod: status === 'COMPLETED' ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: status === 'COMPLETED'
          ? { proofType: 'USER_ATTESTATION', confirmedByUserId: userId, confirmedAt: new Date().toISOString() }
          : Prisma.JsonNull,
      },
    });
  }

  static async updateTask(userId: string, propertyId: string, taskId: string, data: Partial<TaskInput> & {
    status?: HomeBuyerTaskStatus;
    frequency?: RecurrenceFrequency | null;
    estimatedCostCents?: number | null;
  }): Promise<HomeBuyerTask> {
    await this.getTask(userId, propertyId, taskId, 'CONTRIBUTOR');
    if (data.serviceCategory) await this.validateServiceCategory(data.serviceCategory);
    if (data.assignedToUserId) {
      const member = await prisma.householdMember.findUnique({
        where: { propertyId_userId: { propertyId, userId: data.assignedToUserId } },
        select: { id: true },
      });
      const owner = member ? null : await prisma.property.findFirst({
        where: { id: propertyId, homeownerProfile: { userId: data.assignedToUserId } },
        select: { id: true },
      });
      if (!member && !owner) throw new Error('Assigned user is not a member of this property household.');
    }
    return prisma.homeBuyerTask.update({
      where: { id: taskId },
      data: {
        ...data,
        userEditedAt: new Date(),
        dueAt: data.dueAt === undefined ? undefined : data.dueAt === null ? null : new Date(data.dueAt),
        completedAt: data.status === undefined ? undefined : data.status === 'COMPLETED' ? new Date() : null,
        completedByUserId: data.status === undefined ? undefined : data.status === 'COMPLETED' ? userId : null,
        completionMethod: data.status === undefined ? undefined : data.status === 'COMPLETED' ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: data.completionEvidenceJson === null
          ? Prisma.JsonNull
          : data.completionEvidenceJson as Prisma.InputJsonValue | undefined
            ?? (data.status === 'COMPLETED'
              ? { proofType: 'USER_ATTESTATION', confirmedByUserId: userId, confirmedAt: new Date().toISOString() }
              : undefined),
      },
    });
  }

  static async createTask(userId: string, propertyId: string, data: TaskInput): Promise<HomeBuyerTask> {
    const checklist = await this.getOrCreateChecklist(userId, propertyId);
    if (data.serviceCategory) await this.validateServiceCategory(data.serviceCategory);
    const maxTask = await prisma.homeBuyerTask.findFirst({
      where: { checklistId: checklist.id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
    });
    return prisma.homeBuyerTask.create({
      data: {
        checklistId: checklist.id,
        title: data.title,
        description: data.description ?? null,
        actionKey: data.actionKey ?? customActionKey(data.title),
        phase: data.phase ?? 'FIRST_30_DAYS',
        priority: data.priority ?? 'PLAN',
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        anchorOffsetDays: null,
        serviceCategory: data.serviceCategory ?? null,
        assignedToUserId: data.assignedToUserId ?? userId,
        sourceType: data.sourceType ?? 'USER',
        sourceEntityType: data.sourceEntityType ?? null,
        sourceEntityId: data.sourceEntityId ?? null,
        guidanceJourneyId: data.guidanceJourneyId ?? null,
        homeActionKey: data.homeActionKey ?? null,
        sortOrder: (maxTask?.sortOrder ?? 0) + 1,
      },
    });
  }

  static async deleteTask(userId: string, propertyId: string, taskId: string): Promise<void> {
    const task = await this.getTask(userId, propertyId, taskId, 'CONTRIBUTOR');
    if (task.sourceType === 'SYSTEM') throw new Error('Default plan tasks cannot be deleted; mark them not needed instead.');
    await prisma.homeBuyerTask.delete({ where: { id: taskId } });
  }

  static async linkToBooking(userId: string, propertyId: string, taskId: string, bookingId: string): Promise<HomeBuyerTask> {
    await this.getTask(userId, propertyId, taskId, 'CONTRIBUTOR');
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, homeownerId: userId } });
    if (!booking) throw new Error('Booking not found or user does not have access.');
    return prisma.homeBuyerTask.update({ where: { id: taskId }, data: { bookingId } });
  }

  private static async validateServiceCategory(category: ServiceCategory): Promise<void> {
    const config = await prisma.serviceCategoryConfig.findUnique({ where: { category } });
    if (!config || !config.isActive || !config.availableForHomeBuyer) {
      throw new Error(`Service category '${category}' is not available for buyer acquisition plans.`);
    }
  }

  static async getTaskStats(userId: string, propertyId: string) {
    const checklist = await this.getChecklist(userId, propertyId);
    const counts = await prisma.homeBuyerTask.groupBy({ by: ['status'], where: { checklistId: checklist.id }, _count: true });
    const count = (status: HomeBuyerTaskStatus) => counts.find((item) => item.status === status)?._count ?? 0;
    const total = checklist.tasks.length;
    const completed = count('COMPLETED');
    const progressPercentage = total ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      pending: count('PENDING'),
      inProgress: count('IN_PROGRESS'),
      blocked: count('BLOCKED'),
      notNeeded: count('NOT_NEEDED'),
      cancelled: count('CANCELLED'),
      progress: progressPercentage,
      progressPercentage,
    };
  }

  static async getImportReadiness(userId: string, propertyId: string) {
    await this.assertAccess(userId, propertyId, 'VIEWER');
    const [reportGroups, materialFindings, documentGroups] = await Promise.all([
      prisma.inspectionReport.groupBy({ by: ['status'], where: { propertyId }, _count: true }),
      prisma.inspectionFinding.count({ where: { propertyId, status: 'OPEN', severity: { in: ['SAFETY', 'MAJOR'] } } }),
      prisma.document.groupBy({ by: ['verificationStatus'], where: { propertyId }, _count: true }),
    ]);
    const reportCount = (status: string) => reportGroups.find((item) => item.status === status)?._count ?? 0;
    const documentCount = (status: string) => documentGroups.find((item) => item.verificationStatus === status)?._count ?? 0;
    const reportTotal = reportGroups.reduce((sum, item) => sum + item._count, 0);
    const documentTotal = documentGroups.reduce((sum, item) => sum + item._count, 0);
    const verified = documentCount('VERIFIED');
    const reviewPending = reportCount('REVIEW_PENDING');
    const confirmed = reportCount('CONFIRMED');
    const nextRecommendedStep = reportTotal === 0 ? 'IMPORT_INSPECTION'
      : reviewPending > 0 ? 'REVIEW_EXTRACTION'
      : materialFindings > 0 ? 'VERIFY_MATERIAL_FINDINGS'
      : documentTotal > verified ? 'VERIFY_DOCUMENTS'
      : 'BUILD_90_DAY_PLAN';
    return BuyerImportReadinessSchema.parse({
      propertyId,
      inspectionReports: { total: reportTotal, reviewPending, confirmed, openMaterialFindings: materialFindings },
      documents: { total: documentTotal, verified, unverified: documentTotal - verified },
      nextRecommendedStep,
    });
  }
}
