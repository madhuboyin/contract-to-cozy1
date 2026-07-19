import {
  BuyerPlanPriority,
  NewHomePlanPhase,
  NewHomeResponsibility,
  NewHomeTaskSourceType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  NewHomeLifecycleInput,
  NewHomePilotAssessmentInput,
  NewHomeTaskUpdate,
} from '../productFramework/newHomeSetup.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';

const DAY_MS = 86_400_000;

type DefaultTask = readonly [
  actionKey: string,
  title: string,
  description: string,
  phase: NewHomePlanPhase,
  priority: BuyerPlanPriority,
  responsibility: NewHomeResponsibility,
  offsetDays: number,
  sourceType: NewHomeTaskSourceType,
];

const DEFAULT_TASKS: readonly DefaultTask[] = [
  ['new-home:walkthrough:capture', 'Capture walkthrough findings', 'Record photos, locations, and acceptance criteria while the builder walkthrough is fresh.', 'WALKTHROUGH', 'NOW', 'SHARED', 0, 'WALKTHROUGH'],
  ['new-home:punch-list:builder', 'Confirm the builder punch list', 'Separate builder-owned corrections from homeowner setup and record promised dates.', 'WALKTHROUGH', 'NOW', 'BUILDER', 3, 'WALKTHROUGH'],
  ['new-home:documents:handover', 'Store handover and commissioning evidence', 'Keep permits, final inspections, manuals, commissioning records, and certificates with the property.', 'FIRST_30_DAYS', 'SOON', 'BUILDER', 7, 'DOCUMENT'],
  ['new-home:warranty:terms', 'Verify builder warranty terms and deadlines', 'Record covered work, notice rules, exclusions, contacts, and expiration dates from source documents.', 'FIRST_30_DAYS', 'NOW', 'SHARED', 7, 'WARRANTY'],
  ['new-home:systems:registration', 'Register appliances and major systems', 'Capture model and serial numbers and complete manufacturer registrations where useful.', 'FIRST_30_DAYS', 'SOON', 'HOMEOWNER', 21, 'INVENTORY'],
  ['new-home:safety:commissioning', 'Verify safety and system commissioning', 'Confirm life-safety devices, shutoffs, HVAC balancing, water controls, and supplied test records.', 'FIRST_30_DAYS', 'NOW', 'SHARED', 14, 'DOCUMENT'],
  ['new-home:inspection:30-day', 'Prepare the 30-day builder review', 'Recheck early defects, settlement, drainage, finishes, and incomplete punch-list work before the first review window.', 'FIRST_30_DAYS', 'SOON', 'SHARED', 27, 'WALKTHROUGH'],
  ['new-home:seasonal:first-cycle', 'Set the first seasonal care cycle', 'Add climate-relevant owner maintenance without inventing historical condition or service dates.', 'DAYS_31_TO_90', 'PLAN', 'HOMEOWNER', 45, 'SYSTEM'],
  ['new-home:inspection:90-day', 'Prepare the 90-day builder review', 'Verify whether reported items were resolved and capture new evidence before applicable deadlines.', 'DAYS_31_TO_90', 'SOON', 'SHARED', 83, 'WALKTHROUGH'],
  ['new-home:maintenance:responsibilities', 'Separate warranty rights from owner maintenance', 'Record maintenance required to preserve coverage and assign household responsibility.', 'DAYS_31_TO_90', 'PLAN', 'HOMEOWNER', 60, 'WARRANTY'],
  ['new-home:inspection:one-year', 'Schedule the one-year warranty inspection', 'Inspect before the builder warranty deadline and preserve dated evidence for timely notice.', 'FIRST_YEAR', 'NOW', 'SHARED', 335, 'WALKTHROUGH'],
  ['new-home:recurring:handoff', 'Review the recurring Home plan', 'Carry verified records, unresolved work, warranties, and future care into the standard Home feed.', 'RECURRING_HOME', 'CONSIDER', 'HOMEOWNER', 365, 'HOME_ACTION'],
];

function dateOrNull(value: string | null | undefined, current: Date | null): Date | null {
  return value === undefined ? current : value ? new Date(value) : null;
}

function qualify(input: NewHomePilotAssessmentInput) {
  const reasons: string[] = [];
  if (input.demandScore < 3) reasons.push('LOW_DEMAND_SIGNAL');
  if (input.engagementIntentScore < 3) reasons.push('LOW_ENGAGEMENT_INTENT');
  if (input.documentAvailability === 'NONE' && input.builderFollowupPainScore < 3) {
    reasons.push('LIMITED_DOCUMENTS_AND_LOW_BUILDER_FOLLOWUP_PAIN');
  }
  return { decision: reasons.length === 0 ? 'ELIGIBLE' as const : 'HOLD' as const, reasons };
}

export class NewHomeSetupService {
  private static async assertContext(
    userId: string,
    propertyId: string,
    minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR',
  ) {
    const access = await resolvePropertyAccess(userId, propertyId);
    if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
      throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
    }
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        onboarding: { select: { entryPath: true, propertyOrigin: true } },
        newHomeSetupPlan: { select: { id: true } },
      },
    });
    if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
    const eligibleContext = property.onboarding?.entryPath === 'NEW_HOME_SETUP'
      && property.onboarding.propertyOrigin === 'NEW_CONSTRUCTION';
    if (!eligibleContext && !property.newHomeSetupPlan) {
      throw new APIError(
        'The new-home path requires NEW_HOME_SETUP entry and NEW_CONSTRUCTION origin.',
        403,
        'NEW_HOME_CONTEXT_REQUIRED',
      );
    }
    return property;
  }

  static async getAssessment(userId: string, propertyId: string) {
    await this.assertContext(userId, propertyId, 'VIEWER');
    return prisma.newHomePilotAssessment.findUnique({ where: { propertyId } });
  }

  static async assessPilot(userId: string, propertyId: string, input: NewHomePilotAssessmentInput) {
    await this.assertContext(userId, propertyId);
    const qualification = qualify(input);
    return prisma.newHomePilotAssessment.upsert({
      where: { propertyId },
      create: {
        propertyId,
        ...input,
        decision: qualification.decision,
        decisionReasons: qualification.reasons,
        assessedByUserId: userId,
      },
      update: {
        ...input,
        decision: qualification.decision,
        decisionReasons: qualification.reasons,
        assessedByUserId: userId,
        assessedAt: new Date(),
      },
    });
  }

  static async getOverview(userId: string, propertyId: string) {
    await this.assertContext(userId, propertyId, 'VIEWER');
    const [assessment, plan, documentTotal, verifiedDocuments, warranties, inventory, identifiedInventory, inspections] = await Promise.all([
      prisma.newHomePilotAssessment.findUnique({ where: { propertyId } }),
      prisma.newHomeSetupPlan.findUnique({
        where: { propertyId },
        include: { tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
      }),
      prisma.document.count({ where: { propertyId } }),
      prisma.document.count({ where: { propertyId, verificationStatus: 'VERIFIED' } }),
      prisma.warranty.count({ where: { propertyId } }),
      prisma.inventoryItem.count({ where: { propertyId } }),
      prisma.inventoryItem.count({
        where: {
          propertyId,
          AND: [
            { OR: [{ modelNumber: { not: null } }, { model: { not: null } }] },
            { OR: [{ serialNumber: { not: null } }, { serialNo: { not: null } }] },
          ],
        },
      }),
      prisma.inspectionReport.count({ where: { propertyId, status: { not: 'ARCHIVED' } } }),
    ]);
    return {
      assessment,
      plan,
      evidence: {
        documents: { total: documentTotal, verified: verifiedDocuments },
        warranties,
        inventory: { total: inventory, modelAndSerialCaptured: identifiedInventory },
        inspections,
      },
    };
  }

  static async getOrCreatePlan(userId: string, propertyId: string) {
    await this.assertContext(userId, propertyId);
    const assessment = await prisma.newHomePilotAssessment.findUnique({ where: { propertyId } });
    if (!assessment || assessment.decision !== 'ELIGIBLE') {
      throw new APIError(
        'Complete the new-home pilot assessment and meet the selective pilot gate before creating a plan.',
        409,
        'NEW_HOME_PILOT_GATE_REQUIRED',
      );
    }
    const existing = await prisma.newHomeSetupPlan.findUnique({
      where: { propertyId },
      include: { tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
    });
    if (existing) return existing;

    const now = new Date();
    return prisma.newHomeSetupPlan.create({
      data: {
        propertyId,
        tasks: {
          create: DEFAULT_TASKS.map(([actionKey, title, description, phase, priority, responsibility, offsetDays, sourceType], index) => ({
            actionKey,
            title,
            description,
            phase,
            priority,
            responsibility,
            dueAt: new Date(now.getTime() + offsetDays * DAY_MS),
            anchorOffsetDays: offsetDays,
            assignedToUserId: responsibility === 'BUILDER' ? null : userId,
            sourceType,
            homeActionKey: `new-home:${propertyId}:${actionKey}`,
            sortOrder: index + 1,
          })),
        },
      },
      include: { tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
    });
  }

  static async updateLifecycle(userId: string, propertyId: string, input: NewHomeLifecycleInput) {
    const plan = await this.getOrCreatePlan(userId, propertyId);
    const targetMoveInDate = dateOrNull(input.targetMoveInDate, plan.targetMoveInDate);
    const ownershipStartedAt = dateOrNull(input.ownershipStartedAt, plan.ownershipStartedAt);
    const builderWarrantyEndsAt = dateOrNull(input.builderWarrantyEndsAt, plan.builderWarrantyEndsAt);
    const oneYearInspectionDueAt = dateOrNull(input.oneYearInspectionDueAt, plan.oneYearInspectionDueAt);
    const anchor = ownershipStartedAt ?? targetMoveInDate ?? plan.planStartDate;

    await prisma.$transaction(async (tx) => {
      await tx.newHomeSetupPlan.update({
        where: { id: plan.id },
        data: { targetMoveInDate, ownershipStartedAt, builderWarrantyEndsAt, oneYearInspectionDueAt },
      });
      const tasks = await tx.newHomeSetupTask.findMany({
        where: { planId: plan.id, status: { not: 'COMPLETED' }, anchorOffsetDays: { not: null } },
      });
      for (const task of tasks) {
        const explicitDeadline = task.actionKey === 'new-home:inspection:one-year'
          ? oneYearInspectionDueAt ?? builderWarrantyEndsAt
          : null;
        await tx.newHomeSetupTask.update({
          where: { id: task.id },
          data: { dueAt: explicitDeadline ?? new Date(anchor.getTime() + (task.anchorOffsetDays ?? 0) * DAY_MS) },
        });
      }
    });
    return this.getOrCreatePlan(userId, propertyId);
  }

  static async updateTask(userId: string, propertyId: string, taskId: string, input: NewHomeTaskUpdate) {
    await this.assertContext(userId, propertyId);
    if (input.assignedToUserId) {
      const member = await prisma.householdMember.findUnique({
        where: { propertyId_userId: { propertyId, userId: input.assignedToUserId } },
      });
      if (!member) throw new APIError('Assigned user is not in this property household.', 400, 'INVALID_ASSIGNEE');
    }
    const task = await prisma.newHomeSetupTask.findFirst({ where: { id: taskId, plan: { propertyId } } });
    if (!task) throw new APIError('New-home task not found.', 404, 'NEW_HOME_TASK_NOT_FOUND');
    return prisma.newHomeSetupTask.update({
      where: { id: task.id },
      data: {
        status: input.status,
        assignedToUserId: input.assignedToUserId === undefined ? task.assignedToUserId : input.assignedToUserId,
        completionEvidenceJson: input.completionEvidence === undefined
          ? undefined
          : input.completionEvidence === null
            ? Prisma.JsonNull
            : input.completionEvidence as Prisma.InputJsonValue,
        completedAt: input.status === 'COMPLETED' ? new Date() : null,
      },
    });
  }
}
