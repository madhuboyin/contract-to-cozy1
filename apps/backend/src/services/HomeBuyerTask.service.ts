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
  BuyerImportReadinessSchema,
} from '../productFramework/buyerAcquisition.contract';

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

const DAY_MS = 24 * 60 * 60 * 1_000;

function offsetDate(anchor: Date, days: number): Date {
  return new Date(anchor.getTime() + days * DAY_MS);
}

function customActionKey(title: string): string {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `buyer:user:${slug || 'task'}:${Date.now()}`;
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
        completedAt: status === 'COMPLETED' ? new Date() : null,
        completedByUserId: status === 'COMPLETED' ? userId : null,
        completionMethod: status === 'COMPLETED' ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: status === 'COMPLETED'
          ? { proofType: 'USER_ATTESTATION', confirmedByUserId: userId, confirmedAt: new Date().toISOString() }
          : undefined,
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
