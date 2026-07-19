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
  NewHomePunchListInput,
  NewHomeBuilderResponseInput,
  NewHomeWarrantyRightInput,
  NewHomeWarrantyDocumentPromotionSchema,
  NewHomeRegistrationInput,
  NewHomeEvidenceInput,
} from '../productFramework/newHomeSetup.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { processNewHomeWarrantyDeadlines } from './newHomeWarrantyDeadline.service';
import { APP_CONFIG, humanPolicyGateAllows } from '../config/appConfig';

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

function maintenancePriority(priority: BuyerPlanPriority) {
  if (priority === 'NOW') return 'URGENT' as const;
  if (priority === 'SOON') return 'HIGH' as const;
  if (priority === 'PLAN') return 'MEDIUM' as const;
  return 'LOW' as const;
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
        admissionDecision: 'PENDING',
        admissionReasons: [],
        cohortKey: null,
        reviewedByUserId: null,
        reviewedAt: null,
        assessedByUserId: userId,
        assessedAt: new Date(),
      },
    });
  }

  static async getOverview(userId: string, propertyId: string) {
    await this.assertContext(userId, propertyId, 'VIEWER');
    const [assessment, plan, documentTotal, verifiedDocuments, warranties, inventory, identifiedInventory, inspections, punchList, warrantyRights, registrations, evidenceRecords, inspectionBundles, inventoryCandidates, documentCandidates, inspectionCandidates] = await Promise.all([
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
      prisma.newHomePunchListItem.findMany({ where: { propertyId }, include: { responses: { orderBy: { createdAt: 'desc' } } }, orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] }),
      prisma.newHomeWarrantyRight.findMany({ where: { propertyId }, orderBy: { expiresAt: 'asc' } }),
      prisma.newHomeSystemRegistration.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' } }),
      prisma.newHomeEvidenceRecord.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' } }),
      prisma.newHomeInspectionBundle.findMany({ where: { propertyId }, orderBy: { dueAt: 'asc' } }),
      prisma.inventoryItem.findMany({ where: { propertyId }, select: { id: true, name: true, manufacturer: true, modelNumber: true, serialNumber: true }, orderBy: { name: 'asc' } }),
      prisma.document.findMany({ where: { propertyId }, select: { id: true, name: true, type: true, verificationStatus: true }, orderBy: { createdAt: 'desc' } }),
      prisma.inspectionReport.findMany({ where: { propertyId, status: { not: 'ARCHIVED' } }, select: { id: true, reportType: true, inspectionDate: true, status: true }, orderBy: { inspectionDate: 'desc' } }),
    ]);
    return {
      humanPolicyApprovalEnforced: APP_CONFIG.enforceHumanPolicyApprovals,
      assessment,
      plan,
      evidence: {
        documents: { total: documentTotal, verified: verifiedDocuments },
        warranties,
        inventory: { total: inventory, modelAndSerialCaptured: identifiedInventory },
        inspections,
      },
      punchList,
      warrantyRights,
      registrations,
      evidenceRecords,
      inspectionBundles,
      inventoryCandidates,
      documentCandidates,
      inspectionCandidates,
    };
  }

  static async getOrCreatePlan(userId: string, propertyId: string) {
    await this.assertContext(userId, propertyId);
    const assessment = await prisma.newHomePilotAssessment.findUnique({ where: { propertyId } });
    const admissionRequired = APP_CONFIG.enforceHumanPolicyApprovals;
    if (!assessment || assessment.decision !== 'ELIGIBLE'
      || !humanPolicyGateAllows(assessment.admissionDecision === 'ADMITTED', admissionRequired)) {
      throw new APIError(
        admissionRequired
          ? 'Complete the new-home pilot assessment and receive operator admission into a controlled cohort before creating a plan.'
          : 'Complete the new-home pilot assessment and meet the automated qualification criteria before creating a plan.',
        409,
        'NEW_HOME_PILOT_GATE_REQUIRED',
      );
    }
    const existing = await prisma.newHomeSetupPlan.findUnique({
      where: { propertyId },
      include: { tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
    });
    if (existing) {
      await this.syncInspectionBundles(existing);
      return existing;
    }

    const now = new Date();
    const created = await prisma.newHomeSetupPlan.create({
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
    await this.syncInspectionBundles(created);
    return created;
  }

  private static async syncInspectionBundles(plan: { id: string; propertyId: string; planStartDate: Date; targetMoveInDate: Date | null; ownershipStartedAt: Date | null; builderWarrantyEndsAt: Date | null; oneYearInspectionDueAt: Date | null }) {
    const anchor = plan.ownershipStartedAt ?? plan.targetMoveInDate ?? plan.planStartDate;
    const definitions = [
      ['DAY_30', 30, ['Review open punch-list items', 'Photograph settlement, drainage, finishes, and systems', 'Confirm builder notice method and deadline']],
      ['DAY_90', 90, ['Recheck repaired items', 'Capture new or recurring defects', 'Verify warranty notice was acknowledged']],
      ['ONE_YEAR', 335, ['Schedule an independent inspection', 'Review all warranty rights and notice deadlines', 'Submit documented defects before coverage expires']],
    ] as const;
    for (const [milestone, offset, checklist] of definitions) {
      const explicit = milestone === 'ONE_YEAR' ? plan.oneYearInspectionDueAt ?? plan.builderWarrantyEndsAt : null;
      await prisma.newHomeInspectionBundle.upsert({ where: { planId_milestone: { planId: plan.id, milestone } }, create: { propertyId: plan.propertyId, planId: plan.id, milestone, dueAt: explicit ?? new Date(anchor.getTime() + offset * DAY_MS), checklistJson: checklist }, update: { dueAt: explicit ?? new Date(anchor.getTime() + offset * DAY_MS), checklistJson: checklist } });
    }
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
    await this.ensureInspectionBundles(userId, propertyId);
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

  static async createPunchListItem(userId: string, propertyId: string, input: NewHomePunchListInput) {
    const plan = await this.getOrCreatePlan(userId, propertyId);
    return prisma.$transaction(async (tx) => {
      const item = await tx.newHomePunchListItem.create({
        data: {
          propertyId,
          planId: plan.id,
          title: input.title,
          description: input.description,
          location: input.location,
          priority: input.priority,
          builderContact: input.builderContact,
          promisedBy: input.promisedBy ? new Date(input.promisedBy) : null,
          evidenceDocumentIds: input.evidenceDocumentIds,
        },
      });
      const task = await tx.newHomeSetupTask.create({
        data: {
          planId: plan.id,
          actionKey: `new-home:punch-list:${item.id}`,
          title: `Resolve: ${item.title}`,
          description: item.description,
          phase: 'WALKTHROUGH',
          priority: item.priority,
          responsibility: 'BUILDER',
          dueAt: item.promisedBy,
          sourceType: 'WALKTHROUGH',
          sourceEntityType: 'NEW_HOME_PUNCH_LIST_ITEM',
          sourceEntityId: item.id,
          homeActionKey: `new-home:${propertyId}:punch-list:${item.id}`,
          sortOrder: 100,
        },
      });
      return tx.newHomePunchListItem.update({ where: { id: item.id }, data: { linkedTaskId: task.id }, include: { responses: true } });
    });
  }

  static async addBuilderResponse(userId: string, propertyId: string, itemId: string, input: NewHomeBuilderResponseInput) {
    await this.assertContext(userId, propertyId);
    const item = await prisma.newHomePunchListItem.findFirst({ where: { id: itemId, propertyId } });
    if (!item) throw new APIError('Punch-list item not found.', 404, 'PUNCH_LIST_ITEM_NOT_FOUND');
    const statusByResponse = { ACKNOWLEDGED: 'ACKNOWLEDGED', SCHEDULED: 'SCHEDULED', REJECTED: 'DISPUTED', RESOLVED: input.verifyClosure ? 'CLOSED' : 'RESOLVED', COMMENT: item.status } as const;
    return prisma.$transaction(async (tx) => {
      const response = await tx.newHomeBuilderResponse.create({ data: { punchItemId: item.id, responseType: input.responseType, message: input.message, promisedBy: input.promisedBy ? new Date(input.promisedBy) : null, recordedByUserId: userId } });
      const updated = await tx.newHomePunchListItem.update({
        where: { id: item.id },
        data: {
          status: statusByResponse[input.responseType],
          promisedBy: input.promisedBy ? new Date(input.promisedBy) : item.promisedBy,
          resolvedAt: input.responseType === 'RESOLVED' ? new Date() : item.resolvedAt,
          verifiedAt: input.responseType === 'RESOLVED' && input.verifyClosure ? new Date() : null,
        },
      });
      if (updated.linkedTaskId && updated.status === 'CLOSED') {
        await tx.newHomeSetupTask.update({ where: { id: updated.linkedTaskId }, data: { status: 'COMPLETED', completedAt: new Date(), completionEvidenceJson: { proofType: 'BUILDER_RESPONSE_AND_USER_VERIFICATION', responseId: response.id } } });
      }
      return { item: updated, response };
    });
  }

  static async createWarrantyRight(userId: string, propertyId: string, input: NewHomeWarrantyRightInput) {
    const plan = await this.getOrCreatePlan(userId, propertyId);
    if (input.sourceDocumentId) {
      const document = await prisma.document.findFirst({ where: { id: input.sourceDocumentId, propertyId } });
      if (!document) throw new APIError('Warranty source document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }
    const right = await prisma.newHomeWarrantyRight.create({
      data: {
        propertyId,
        planId: plan.id,
        coverageTitle: input.coverageTitle,
        providerName: input.providerName,
        coverageSummary: input.coverageSummary,
        noticeMethod: input.noticeMethod,
        noticeDestination: input.noticeDestination,
        coverageStartsAt: input.coverageStartsAt ? new Date(input.coverageStartsAt) : null,
        expiresAt: new Date(input.expiresAt),
        noticeDeadlineAt: input.noticeDeadlineAt ? new Date(input.noticeDeadlineAt) : null,
        sourceDocumentId: input.sourceDocumentId,
        sourceCitation: input.sourceCitation,
        extractionConfidence: input.extractionConfidence,
        status: input.verified ? 'VERIFIED' : 'DRAFT',
      },
    });
    if (input.verified) await this.promoteWarrantyDeadlines(propertyId);
    return right;
  }

  static async promoteWarrantyDocument(userId: string, propertyId: string, rawInput: unknown) {
    const input = NewHomeWarrantyDocumentPromotionSchema.parse(rawInput);
    await this.assertContext(userId, propertyId);
    const document = await prisma.document.findFirst({ where: { id: input.documentId, propertyId } });
    if (!document) throw new APIError('Warranty source document not found.', 404, 'DOCUMENT_NOT_FOUND');
    const metadata = (document.metadata && typeof document.metadata === 'object' ? document.metadata : {}) as Record<string, any>;
    const extracted = metadata.extractedData && typeof metadata.extractedData === 'object' ? metadata.extractedData : {};
    const expiration = extracted.warrantyExpiration ?? extracted.expiryDate;
    if (!expiration) throw new APIError('The document extraction did not identify a warranty expiration date. Review the source and enter the right manually.', 422, 'WARRANTY_EXPIRATION_MISSING');
    return this.createWarrantyRight(userId, propertyId, {
      coverageTitle: String(extracted.productName ?? `${document.name} warranty`),
      providerName: extracted.vendor ?? extracted.manufacturer ?? null,
      coverageSummary: `Extracted warranty terms for ${String(extracted.productName ?? document.name)}${extracted.modelNumber ? `, model ${extracted.modelNumber}` : ''}. Verify exclusions and notice rules against the cited source.`,
      noticeMethod: input.noticeMethod,
      noticeDestination: input.noticeDestination,
      expiresAt: new Date(expiration).toISOString(),
      noticeDeadlineAt: input.noticeDeadlineAt,
      sourceDocumentId: document.id,
      sourceCitation: input.sourceCitation,
      extractionConfidence: typeof metadata.confidence === 'number' ? metadata.confidence : null,
      verified: false,
    });
  }

  static async verifyWarrantyRight(userId: string, propertyId: string, rightId: string) {
    await this.assertContext(userId, propertyId);
    const right = await prisma.newHomeWarrantyRight.findFirst({ where: { id: rightId, propertyId } });
    if (!right) throw new APIError('Warranty right not found.', 404, 'WARRANTY_RIGHT_NOT_FOUND');
    const updated = await prisma.newHomeWarrantyRight.update({ where: { id: right.id }, data: { status: 'VERIFIED' } });
    await this.promoteWarrantyDeadlines(propertyId);
    return updated;
  }

  static async promoteWarrantyDeadlines(propertyId: string, now = new Date()) {
    return processNewHomeWarrantyDeadlines({ propertyId, now });
  }

  static async upsertRegistration(userId: string, propertyId: string, input: NewHomeRegistrationInput) {
    await this.assertContext(userId, propertyId);
    const item = await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId } });
    if (!item) throw new APIError('Inventory item not found.', 404, 'INVENTORY_ITEM_NOT_FOUND');
    const now = new Date();
    const registration = await prisma.newHomeSystemRegistration.upsert({
      where: { propertyId_inventoryItemId: { propertyId, inventoryItemId: input.inventoryItemId } },
      create: { propertyId, ...input, submittedAt: ['SUBMITTED', 'CONFIRMED'].includes(input.status) ? now : null, confirmedAt: input.status === 'CONFIRMED' ? now : null },
      update: { ...input, submittedAt: ['SUBMITTED', 'CONFIRMED'].includes(input.status) ? now : undefined, confirmedAt: input.status === 'CONFIRMED' ? now : undefined },
    });
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { manufacturer: input.manufacturer, modelNumber: input.modelNumber, serialNumber: input.serialNumber, isVerified: input.status === 'CONFIRMED' || item.isVerified, verificationSource: input.status === 'CONFIRMED' ? 'NEW_HOME_REGISTRATION' : item.verificationSource } });
    return registration;
  }

  static async addEvidence(userId: string, propertyId: string, input: NewHomeEvidenceInput) {
    await this.assertContext(userId, propertyId);
    if (input.documentId) {
      const document = await prisma.document.findFirst({ where: { id: input.documentId, propertyId } });
      if (!document) throw new APIError('Evidence document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }
    return prisma.newHomeEvidenceRecord.create({ data: { propertyId, evidenceType: input.evidenceType, label: input.label, documentId: input.documentId, sourceCitation: input.sourceCitation, observedAt: input.observedAt ? new Date(input.observedAt) : null, verifiedAt: input.verified ? new Date() : null, verifiedByUserId: input.verified ? userId : null, notes: input.notes } });
  }

  static async ensureInspectionBundles(userId: string, propertyId: string) {
    const plan = await this.getOrCreatePlan(userId, propertyId);
    await this.syncInspectionBundles(plan);
    return prisma.newHomeInspectionBundle.findMany({ where: { planId: plan.id }, orderBy: { dueAt: 'asc' } });
  }

  static async updateInspectionBundle(userId: string, propertyId: string, bundleId: string, input: { status: 'PREPARING' | 'READY' | 'COMPLETED'; inspectionReportId?: string | null }) {
    await this.assertContext(userId, propertyId);
    const bundle = await prisma.newHomeInspectionBundle.findFirst({ where: { id: bundleId, propertyId } });
    if (!bundle) throw new APIError('Inspection bundle not found.', 404, 'INSPECTION_BUNDLE_NOT_FOUND');
    if (input.inspectionReportId) {
      const report = await prisma.inspectionReport.findFirst({ where: { id: input.inspectionReportId, propertyId } });
      if (!report) throw new APIError('Inspection report not found.', 404, 'INSPECTION_REPORT_NOT_FOUND');
    }
    return prisma.newHomeInspectionBundle.update({ where: { id: bundle.id }, data: { status: input.status, inspectionReportId: input.inspectionReportId, completedAt: input.status === 'COMPLETED' ? new Date() : null } });
  }

  static async ensureRecurringHandoff(userId: string, propertyId: string, now = new Date()) {
    await this.assertContext(userId, propertyId);
    const plan = await prisma.newHomeSetupPlan.findUnique({ where: { propertyId }, include: { tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } });
    if (!plan) return { handedOff: false, reason: 'NO_NEW_HOME_PLAN', taskCount: 0 };
    if (plan.handoffCompletedAt) return { handedOff: true, reason: 'ALREADY_HANDED_OFF', taskCount: 0 };
    const anchor = plan.ownershipStartedAt ?? plan.targetMoveInDate ?? plan.planStartDate;
    if (now.getTime() < anchor.getTime() + 365 * DAY_MS) return { handedOff: false, reason: 'NOT_DUE', taskCount: 0 };
    await prisma.$transaction(async (tx) => {
      for (const task of plan.tasks) {
        const maintenance = await tx.propertyMaintenanceTask.upsert({ where: { propertyId_actionKey: { propertyId, actionKey: `new-home-handoff:${task.actionKey}` } }, create: { propertyId, title: task.title, description: task.description, status: task.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING', source: 'ACTION_CENTER', actionKey: `new-home-handoff:${task.actionKey}`, priority: maintenancePriority(task.priority), nextDueDate: task.dueAt ?? now, assetType: 'NEW_HOME_FIRST_YEAR_HANDOFF', category: task.phase, assignedToUserId: task.assignedToUserId, completionMetadata: { sourceType: 'NEW_HOME_SETUP_PLAN', newHomeTaskId: task.id, sourceEntityType: task.sourceEntityType, sourceEntityId: task.sourceEntityId } }, update: {} });
        await tx.newHomeSetupTask.update({ where: { id: task.id }, data: { handedOffMaintenanceTaskId: maintenance.id } });
      }
      const priorEvent = await tx.homeEvent.findFirst({ where: { propertyId, idempotencyKey: `new-home-first-year-handoff:${plan.id}` } });
      if (!priorEvent) await tx.homeEvent.create({ data: { propertyId, createdById: userId, type: 'MILESTONE', subtype: 'NEW_HOME_FIRST_YEAR_HANDOFF', occurredAt: now, title: 'New-home first-year plan transitioned to recurring care', summary: `${plan.tasks.length} unresolved actions were retained in the standard Home loop.`, idempotencyKey: `new-home-first-year-handoff:${plan.id}`, sourceBadge: 'VERIFIED', meta: { planId: plan.id, taskCount: plan.tasks.length } } });
      await tx.newHomeSetupPlan.update({ where: { id: plan.id }, data: { status: 'HANDED_OFF', transitionedToRecurringAt: now, handoffCompletedAt: now } });
    });
    return { handedOff: true, reason: 'FIRST_YEAR_REACHED', taskCount: plan.tasks.length };
  }

  static async getAcceptanceStatus(userId: string, propertyId: string) {
    await this.assertContext(userId, propertyId, 'VIEWER');
    const plan = await prisma.newHomeSetupPlan.findUnique({ where: { propertyId }, include: { tasks: true, punchListItems: true, warrantyRights: true, inspectionBundles: true } });
    if (!plan) throw new APIError('New-home plan not found.', 404, 'NEW_HOME_PLAN_NOT_FOUND');
    const registrations = await prisma.newHomeSystemRegistration.findMany({ where: { propertyId } });
    const evidence = await prisma.newHomeEvidenceRecord.findMany({ where: { propertyId } });
    return { propertyId, tasks: { total: plan.tasks.length, completed: plan.tasks.filter((task) => task.status === 'COMPLETED').length }, punchList: { total: plan.punchListItems.length, closed: plan.punchListItems.filter((item) => item.status === 'CLOSED').length }, warrantyRights: { total: plan.warrantyRights.length, verified: plan.warrantyRights.filter((right) => right.status !== 'DRAFT').length, promoted: plan.warrantyRights.filter((right) => Boolean(right.deadlineTaskId)).length }, registrations: { total: registrations.length, confirmed: registrations.filter((item) => item.status === 'CONFIRMED').length }, evidence: { total: evidence.length, verified: evidence.filter((item) => Boolean(item.verifiedAt)).length }, inspectionBundles: { total: plan.inspectionBundles.length, completed: plan.inspectionBundles.filter((bundle) => bundle.status === 'COMPLETED').length }, handoff: { completed: Boolean(plan.handoffCompletedAt), completedAt: plan.handoffCompletedAt } };
  }
}
