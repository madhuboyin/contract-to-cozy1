import {
  Prisma,
  ProjectRecordStatus,
  ProjectMilestoneStatus,
  ProjectPaymentStatus,
  ProjectChangeOrderStatus,
  ProjectIssueStatus,
  ProjectIssueSeverity,
  ProjectIssueCategory,
  ProjectPaymentTriggerType,
  InventoryItemCategory,
  ProductAnalyticsEventType,
  ServiceCategory,
  PropertyMaintenanceTask,
  ProjectRequirementApplicability,
} from '@prisma/client';
import {
  emitServiceQuoteDecisionAnalytics,
  outcomeConsentAllows,
  ServiceQuoteDecisionEvent,
} from './serviceQuoteDecisionAnalytics.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { withSerializableDedupe } from './projectCompliance/serializableDedupe';
import JobQueueService from './JobQueue.service';
import { resolveWorkKey } from '../modules/homeOperations/domain/workKey';
import { findWorkItemByWorkKey, linkWorkExecution } from '../modules/homeOperations/infrastructure/workItemRepository';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { maintenanceTaskSourceAdapter } from '../modules/homeOperations/adapters/maintenanceTask.adapter';
import { resolveInspectionFindingWorkKey, propagateFindingResolutionFromExecution } from '../modules/homeOperations/adapters/inspectionFinding.adapter';
import { invalidateStatusForInventoryItem } from './homeStatusBoard.service';
import type { OperationalWorkItemState } from '@prisma/client';
import { evaluateRequirementCompletionCheck } from './projectCompliance/completionPolicy';

// ── Guards ────────────────────────────────────────────────────────────────────

async function assertProject(projectId: string, propertyId: string) {
  const project = await prisma.projectRecord.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      propertyId: true,
      status: true,
      contractAmountCents: true,
      approvedChangeOrderDeltaCents: true,
      permitApplicability: true,
      permitApplicabilityBasis: true,
      hoaApplicability: true,
      hoaApplicabilityBasis: true,
      renovationCaseId: true,
    },
  });
  if (!project || project.propertyId !== propertyId) {
    throw new APIError('Project not found', 404, 'NOT_FOUND');
  }
  return project;
}

export function assertProjectRequirementApplicability(
  label: 'Permit' | 'HOA',
  applicability: ProjectRequirementApplicability,
  basis: string | null | undefined,
) {
  if (applicability === 'UNKNOWN' && basis?.trim()) {
    throw new APIError(
      `${label} applicability must be decided before adding a basis.`,
      400,
      'PROJECT_REQUIREMENT_DECISION_REQUIRED',
      { requirement: label.toUpperCase() },
    );
  }
  if (applicability !== 'UNKNOWN' && !basis?.trim()) {
    throw new APIError(
      `${label} applicability requires a source or rationale.`,
      400,
      'PROJECT_REQUIREMENT_BASIS_REQUIRED',
      { requirement: label.toUpperCase(), applicability },
    );
  }
}

async function assertMilestoneLinks(
  projectId: string,
  propertyId: string,
  data: { dependsOnMilestoneId?: string | null; linkedPermitMilestoneId?: string | null },
) {
  if (data.dependsOnMilestoneId) {
    const dependency = await prisma.projectMilestone.findFirst({
      where: { id: data.dependsOnMilestoneId, projectId, propertyId },
      select: { id: true },
    });
    if (!dependency) {
      throw new APIError(
        'Milestone dependency must belong to the same project and property.',
        409,
        'PROJECT_MILESTONE_SCOPE_MISMATCH',
      );
    }
  }
  if (data.linkedPermitMilestoneId) {
    const project = await prisma.projectRecord.findFirst({
      where: { id: projectId, propertyId },
      select: { renovationCaseId: true },
    });
    const permitMilestone = await prisma.permitInspectionMilestone.findFirst({
      where: {
        id: data.linkedPermitMilestoneId,
        propertyId,
        permitRecord: {
          isActive: true,
          OR: [
            { sourceEntityType: 'PROJECT', sourceEntityId: projectId },
            ...(project?.renovationCaseId
              ? [{ sourceEntityType: 'RENOVATION_CASE', sourceEntityId: project.renovationCaseId }]
              : []),
          ],
        },
      },
      select: { id: true },
    });
    if (!permitMilestone) {
      throw new APIError(
        'Permit milestone must belong to a permit linked to the same project and property.',
        409,
        'PROJECT_PERMIT_SCOPE_MISMATCH',
      );
    }
  }
}

// ── Home Operations work-item reconciliation (Slice 4) ──────────────────────
//
// A Project spawned from a guidance journey shares that journey's own
// OperationalWorkItem (see homeActionWorkItem.adapter.ts's Slice 4 comment —
// PROJECT actions with a relatedJourneyId resolve to the same
// `guidance-${journeyId}` obligation, PROPERTY subject). This helper
// resolves that same workKey directly, without going through a HomeAction,
// so project-lifecycle events (handoff, verified completion, cancellation)
// can transition it. Best-effort throughout: a sync failure must never
// block the actual project mutation (Slice 2/3 precedent).
export function resolveJourneyWorkKey(propertyId: string, journeyId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: { type: 'PROPERTY', id: propertyId },
    obligationType: 'DECISION',
    occurrence: { obligationSlug: `guidance-${journeyId}` },
  });
}

export async function syncJourneyWorkItemForProjectEvent(
  propertyId: string,
  guidanceJourneyId: string | null | undefined,
  projectId: string,
  event: 'HANDOFF' | 'VERIFIED' | 'CANCELLED',
  actorUserId: string | null,
): Promise<void> {
  if (!guidanceJourneyId) return;
  const actorType = actorUserId ? 'USER' : 'SYSTEM';
  try {
    const workKey = resolveJourneyWorkKey(propertyId, guidanceJourneyId);
    const workItem = await findWorkItemByWorkKey(propertyId, workKey);
    if (!workItem) return;

    if (event === 'HANDOFF') {
      if (['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'IN_GUIDANCE'].includes(workItem.state)) {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'IN_PROJECT',
          actorType,
          actorUserId,
          idempotencyKey: `project-handoff:${workItem.id}:${projectId}`,
        });
      }
      await linkWorkExecution({ workItemId: workItem.id, executionType: 'PROJECT', executionEntityId: projectId });
      return;
    }

    if (event === 'VERIFIED') {
      let state: OperationalWorkItemState = workItem.state;
      if (state !== 'REPORTED_COMPLETE' && state !== 'VERIFIED') {
        const reported = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'REPORTED_COMPLETE',
          actorType,
          actorUserId,
          idempotencyKey: `project-verified-reported:${workItem.id}:${projectId}`,
        });
        state = reported.state;
      }
      if (state === 'REPORTED_COMPLETE') {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'VERIFIED',
          actorType: 'SYSTEM',
          idempotencyKey: `project-verified:${workItem.id}:${projectId}`,
        });
      }
      return;
    }

    // CANCELLED
    if (workItem.state === 'IN_PROJECT' || workItem.state === 'IN_PROGRESS') {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType,
        actorUserId,
        idempotencyKey: `project-cancelled-reconciled:${workItem.id}:${projectId}`,
      });
    }
  } catch (err) {
    logger.warn({ err, propertyId, guidanceJourneyId, projectId, event }, 'Home Operations work item sync failed; project mutation proceeds regardless');
  }
}

// Home Operations Slice 6: no closer ProjectIssueCategory exists for the
// validator's PERMIT/FUNCTIONAL exception types — both fall back to OTHER,
// a documented imprecision, same class as prior slices' accepted mapping
// gaps (e.g. Slice 3's deletion disposition, Slice 5's resolutionMethod).
const EXCEPTION_TYPE_TO_ISSUE_CATEGORY: Record<string, ProjectIssueCategory> = {
  QUALITY: 'QUALITY_CONCERN',
  SAFETY: 'SAFETY',
  SCOPE: 'SCOPE_DISPUTE',
  PERMIT: 'OTHER',
  FUNCTIONAL: 'OTHER',
  OTHER: 'OTHER',
};

/**
 * Preserves a confirmCompletion unresolvedException as a real, trackable
 * ProjectIssue rather than only free text folded into a HomeEvent summary.
 * By the time this runs, a VERIFIED_SUCCESS completion can only carry
 * non-blocking exceptions (ConfirmCompletionSchema's superRefine rejects
 * blocksClosure:true on VERIFIED_SUCCESS) — a non-VERIFIED_SUCCESS closure
 * may still carry blocking ones, hence the severity mapping below.
 */
export function mapUnresolvedExceptionToProjectIssue(
  projectId: string,
  exception: { type: string; summary: string; blocksClosure: boolean },
): Prisma.ProjectIssueCreateManyInput {
  const severity: ProjectIssueSeverity = exception.blocksClosure ? 'BLOCKING' : 'MINOR';
  return {
    projectId,
    title: exception.summary.length > 120 ? `${exception.summary.slice(0, 117)}...` : exception.summary,
    description: exception.summary,
    severity,
    category: EXCEPTION_TYPE_TO_ISSUE_CATEGORY[exception.type] ?? 'OTHER',
    status: 'OPEN' as ProjectIssueStatus,
    blocksPayment: severity === 'BLOCKING',
  };
}

/**
 * Home Operations Slice 6: completes Slice 5's deliberately-deferred
 * PROJECT-policy path — when a Project is created referencing an Inspection
 * Finding (projectData.sourceEntityType/'sourceEntityId, an already-existing
 * generic passthrough), hand the finding's own work item off to the project
 * exactly like createProject already does for a linked guidance journey.
 * Best-effort: never blocks project creation.
 */
export async function syncFindingWorkItemForProjectHandoff(
  propertyId: string,
  sourceEntityType: string | null | undefined,
  sourceEntityId: string | null | undefined,
  projectId: string,
): Promise<void> {
  if (sourceEntityType !== 'INSPECTION_FINDING' || !sourceEntityId) return;
  try {
    const workKey = resolveInspectionFindingWorkKey(sourceEntityId, propertyId);
    const workItem = await findWorkItemByWorkKey(propertyId, workKey);
    if (!workItem) return;
    if (['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'IN_GUIDANCE'].includes(workItem.state)) {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'IN_PROJECT',
        actorType: 'SYSTEM',
        idempotencyKey: `finding-project-handoff:${workItem.id}:${projectId}`,
      });
    }
    await linkWorkExecution({ workItemId: workItem.id, executionType: 'PROJECT', executionEntityId: projectId });
  } catch (err) {
    logger.warn({ err, propertyId, sourceEntityId, projectId }, 'Home Operations work item sync failed; project creation proceeds regardless');
  }
}

/**
 * Home Operations Slice 6: confirmCompletion's future-care tasks are
 * created via a raw tx.propertyMaintenanceTask.upsert (see confirmCompletion
 * below), bypassing PropertyMaintenanceTaskService entirely — so unlike
 * every other task creation path, they never get an OperationalWorkItem via
 * Slice 3's syncTaskWorkItem. Called post-transaction, per task, to close
 * that gap. Each future-care task is its own new obligation (a distinct
 * maintenance-task-${id} workKey) — this does not touch or reopen whatever
 * work item the just-completed project or its journey already carries.
 */
export async function syncFutureCareTaskWorkItem(propertyId: string, task: PropertyMaintenanceTask): Promise<void> {
  try {
    const proposal = maintenanceTaskSourceAdapter.propose(task, propertyId);
    if (!proposal) return;
    const workItem = await resolveAndUpsertWorkItem(proposal);
    if (workItem.state === 'CANDIDATE') {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType: 'SYSTEM',
        idempotencyKey: `future-care-task-accepted:${workItem.id}`,
      });
    }
  } catch (err) {
    logger.warn({ err, propertyId, taskId: task.id }, 'Home Operations work item sync failed; future-care task creation proceeds regardless');
  }
}

async function assertMilestone(milestoneId: string, projectId: string) {
  const milestone = await prisma.projectMilestone.findUnique({
    where: { id: milestoneId },
    select: {
      id: true,
      projectId: true,
      status: true,
      requiresPhotoEvidence: true,
      milestoneType: true,
      linkedPermitMilestoneId: true,
      executionSourceType: true,
      executionSourceId: true,
    },
  });
  if (!milestone || milestone.projectId !== projectId) {
    throw new APIError('Milestone not found', 404, 'NOT_FOUND');
  }
  return milestone;
}

async function assertPayment(paymentId: string, projectId: string) {
  const payment = await prisma.projectPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, projectId: true, status: true, triggerType: true, triggerMilestoneId: true, amountCents: true },
  });
  if (!payment || payment.projectId !== projectId) {
    throw new APIError('Payment not found', 404, 'NOT_FOUND');
  }
  return payment;
}

async function assertChangeOrder(changeOrderId: string, projectId: string) {
  const co = await prisma.projectChangeOrder.findUnique({
    where: { id: changeOrderId },
    select: {
      id: true,
      projectId: true,
      status: true,
      costDeltaCents: true,
      complianceStatus: true,
      complianceImpact: true,
      amendedPermitStatus: true,
      hoaReapprovalStatus: true,
    },
  });
  if (!co || co.projectId !== projectId) {
    throw new APIError('Change order not found', 404, 'NOT_FOUND');
  }
  return co;
}

async function assertIssue(issueId: string, projectId: string) {
  const issue = await prisma.projectIssue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      projectId: true,
      status: true,
      severity: true,
      blocksPayment: true,
      sourceEntityType: true,
      sourceEntityId: true,
    },
  });
  if (!issue || issue.projectId !== projectId) {
    throw new APIError('Issue not found', 404, 'NOT_FOUND');
  }
  return issue;
}

// Recalculate currentContractAmountCents from source of truth
async function recalcProjectTotals(projectId: string) {
  const [project, approvedOrders, paidPayments] = await Promise.all([
    prisma.projectRecord.findUnique({
      where: { id: projectId },
      select: { contractAmountCents: true },
    }),
    prisma.projectChangeOrder.aggregate({
      where: { projectId, status: 'APPROVED' },
      _sum: { costDeltaCents: true },
    }),
    prisma.projectPayment.aggregate({
      where: { projectId, status: 'PAID' },
      _sum: { amountCents: true },
    }),
  ]);

  if (!project) return;

  const approvedDelta = approvedOrders._sum.costDeltaCents ?? 0;
  const paid = paidPayments._sum.amountCents ?? 0;

  await prisma.projectRecord.update({
    where: { id: projectId },
    data: {
      approvedChangeOrderDeltaCents: approvedDelta,
      currentContractAmountCents: project.contractAmountCents + approvedDelta,
      paidToDateCents: paid,
    },
  });
}

// Put all DUE/PENDING payments on hold when a BLOCKING issue is logged
async function holdPaymentsForBlockingIssue(projectId: string) {
  await prisma.projectPayment.updateMany({
    where: { projectId, status: { in: ['PENDING', 'DUE'] } },
    data: { status: 'ON_HOLD' },
  });
  await prisma.projectRecord.update({
    where: { id: projectId },
    data: { status: 'PAUSED' },
  });
}

// Restore ON_HOLD payments after the last BLOCKING issue is resolved
async function restorePaymentsAfterBlockingResolved(projectId: string) {
  const remainingBlockers = await prisma.projectIssue.count({
    where: { projectId, severity: 'BLOCKING', status: { not: 'RESOLVED' } },
  });
  if (remainingBlockers > 0) return;

  await prisma.projectPayment.updateMany({
    where: { projectId, status: 'ON_HOLD' },
    data: { status: 'PENDING' },
  });
  await prisma.projectRecord.update({
    where: { id: projectId },
    data: { status: 'IN_PROGRESS' },
  });
}

// Trigger payments whose milestone just completed
async function triggerMilestonePayments(milestoneId: string, projectId: string) {
  await prisma.projectPayment.updateMany({
    where: { projectId, triggerMilestoneId: milestoneId, status: 'PENDING', triggerType: 'MILESTONE' },
    data: { status: 'DUE' },
  });
}

// ── Milestone templates ───────────────────────────────────────────────────────

const MILESTONE_TEMPLATES: Record<string, Array<{ name: string; position: number; requiresPhotoEvidence: boolean }>> = {
  ROOF_REPLACEMENT: [
    { name: 'Old materials removed (tear-off)', position: 0, requiresPhotoEvidence: true },
    { name: 'Underlayment installed', position: 1, requiresPhotoEvidence: false },
    { name: 'Shingles installed', position: 2, requiresPhotoEvidence: true },
    { name: 'Gutters and flashing complete', position: 3, requiresPhotoEvidence: false },
    { name: 'Final inspection passed', position: 4, requiresPhotoEvidence: true },
  ],
  HVAC_REPLACEMENT: [
    { name: 'Equipment delivered on site', position: 0, requiresPhotoEvidence: true },
    { name: 'Old unit removed', position: 1, requiresPhotoEvidence: false },
    { name: 'New unit installed', position: 2, requiresPhotoEvidence: true },
    { name: 'Ductwork and connections complete', position: 3, requiresPhotoEvidence: false },
    { name: 'System commissioned and tested', position: 4, requiresPhotoEvidence: true },
    { name: 'Final inspection passed', position: 5, requiresPhotoEvidence: true },
  ],
  KITCHEN_REMODEL: [
    { name: 'Demolition complete', position: 0, requiresPhotoEvidence: true },
    { name: 'Rough-in plumbing complete', position: 1, requiresPhotoEvidence: false },
    { name: 'Rough-in electrical complete', position: 2, requiresPhotoEvidence: false },
    { name: 'Rough-in inspections passed', position: 3, requiresPhotoEvidence: true },
    { name: 'Cabinets installed', position: 4, requiresPhotoEvidence: true },
    { name: 'Countertops installed', position: 5, requiresPhotoEvidence: true },
    { name: 'Appliances installed', position: 6, requiresPhotoEvidence: false },
    { name: 'Final walkthrough and punch list', position: 7, requiresPhotoEvidence: true },
  ],
  BATHROOM_REMODEL: [
    { name: 'Demolition complete', position: 0, requiresPhotoEvidence: true },
    { name: 'Rough-in plumbing complete', position: 1, requiresPhotoEvidence: false },
    { name: 'Rough-in electrical complete', position: 2, requiresPhotoEvidence: false },
    { name: 'Rough-in inspections passed', position: 3, requiresPhotoEvidence: true },
    { name: 'Tile installed', position: 4, requiresPhotoEvidence: true },
    { name: 'Fixtures installed', position: 5, requiresPhotoEvidence: true },
    { name: 'Final walkthrough', position: 6, requiresPhotoEvidence: true },
  ],
  HVAC_REPAIR: [
    { name: 'Diagnosis complete', position: 0, requiresPhotoEvidence: false },
    { name: 'Repair complete', position: 1, requiresPhotoEvidence: true },
    { name: 'System tested and running', position: 2, requiresPhotoEvidence: false },
  ],
  WATER_HEATER: [
    { name: 'Old unit removed', position: 0, requiresPhotoEvidence: false },
    { name: 'New unit installed', position: 1, requiresPhotoEvidence: true },
    { name: 'Gas/electric connection complete', position: 2, requiresPhotoEvidence: false },
    { name: 'Unit commissioned', position: 3, requiresPhotoEvidence: false },
  ],
  ELECTRICAL_PANEL: [
    { name: 'Permit issued', position: 0, requiresPhotoEvidence: false },
    { name: 'Old panel removed', position: 1, requiresPhotoEvidence: true },
    { name: 'New panel installed', position: 2, requiresPhotoEvidence: true },
    { name: 'Final inspection passed', position: 3, requiresPhotoEvidence: true },
  ],
  FOUNDATION_WORK: [
    { name: 'Assessment and excavation complete', position: 0, requiresPhotoEvidence: true },
    { name: 'Repair complete', position: 1, requiresPhotoEvidence: true },
    { name: 'Waterproofing applied', position: 2, requiresPhotoEvidence: true },
    { name: 'Backfill and site restoration', position: 3, requiresPhotoEvidence: false },
    { name: 'Final inspection passed', position: 4, requiresPhotoEvidence: true },
  ],
  FLOORING: [
    { name: 'Subfloor prep complete', position: 0, requiresPhotoEvidence: false },
    { name: 'Material installation complete', position: 1, requiresPhotoEvidence: true },
    { name: 'Transitions and trim installed', position: 2, requiresPhotoEvidence: false },
    { name: 'Cleanup and final walkthrough', position: 3, requiresPhotoEvidence: true },
  ],
};

export function getMilestoneTemplate(projectType: string) {
  return MILESTONE_TEMPLATES[projectType] ?? [
    { name: 'Work begins', position: 0, requiresPhotoEvidence: false },
    { name: 'Work complete', position: 1, requiresPhotoEvidence: true },
  ];
}

export async function getProviderExecutionReadiness(
  propertyId: string,
  providerId: string,
  serviceCategory: string,
) {
  if (!Object.values(ServiceCategory).includes(serviceCategory as ServiceCategory)) {
    throw new APIError('Unsupported service category.', 400, 'INVALID_SERVICE_CATEGORY');
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { state: true } });
  if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  const [provider, eligibility, requirements, credentials] = await Promise.all([
    prisma.providerProfile.findUnique({ where: { id: providerId }, select: { id: true, businessName: true, status: true } }),
    prisma.providerCategoryEligibility.findUnique({
      where: { providerProfileId_serviceCategory: { providerProfileId: providerId, serviceCategory: serviceCategory as any } },
      select: { isEligible: true, missingCredentialTypes: true, computedAt: true },
    }),
    prisma.providerCredentialRequirement.findMany({
      where: {
        serviceCategory: serviceCategory as any,
        isActive: true,
        OR: [{ stateCode: null }, { stateCode: property.state }],
      },
      select: { credentialType: true, stateCode: true, isRequired: true },
    }),
    prisma.providerCredential.findMany({
      where: { providerProfileId: providerId, status: 'APPROVED', serviceCategories: { has: serviceCategory as any } },
      select: { type: true, serviceCategories: true, issueDate: true, expiryDate: true, reviewedAt: true },
      orderBy: { expiryDate: 'asc' },
    }),
  ]);
  if (!provider) throw new APIError('Provider not found', 404, 'PROVIDER_NOT_FOUND');

  const approvedTypes = new Set(credentials.map((credential) => credential.type));
  const missingRequired = requirements
    .filter((requirement) => requirement.isRequired && !approvedTypes.has(requirement.credentialType))
    .map((requirement) => requirement.credentialType);
  const jurisdictionStatus = provider.status === 'ACTIVE' && eligibility?.isEligible && missingRequired.length === 0
    ? 'VERIFIED'
    : 'INCOMPLETE';

  return {
    provider: { id: provider.id, businessName: provider.businessName, status: provider.status },
    serviceCategory,
    jurisdiction: property.state,
    jurisdictionStatus,
    checkedAt: eligibility?.computedAt ?? new Date(),
    missingCredentialTypes: Array.from(new Set([...(eligibility?.missingCredentialTypes ?? []), ...missingRequired])),
    requirements,
    credentials: credentials.map((credential) => ({
      type: credential.type,
      serviceCategories: credential.serviceCategories,
      issueDate: credential.issueDate,
      expiryDate: credential.expiryDate,
      verifiedAt: credential.reviewedAt,
      verificationSource: 'ContractToCozy credential review',
    })),
  };
}

// ── Project CRUD ──────────────────────────────────────────────────────────────

export async function listProjects(propertyId: string) {
  return prisma.projectRecord.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      projectType: true,
      status: true,
      contractorName: true,
      sourceType: true,
      guidanceJourneyId: true,
      inventoryItemId: true,
      executionPath: true,
      fulfillmentMode: true,
      fundingMode: true,
      complexity: true,
      recommendationVersion: true,
      outcomeStatus: true,
      functionalVerificationResult: true,
      actualCostCents: true,
      providerOutcome: true,
      verifiedAt: true,
      followUpDueAt: true,
      startDate: true,
      expectedEndDate: true,
      actualEndDate: true,
      contractAmountCents: true,
      currentContractAmountCents: true,
      paidToDateCents: true,
      warrantyExpiresAt: true,
      createdAt: true,
      _count: { select: { milestones: true, issues: true } },
    },
  });
}

export async function createProject(propertyId: string, data: any) {
  const { milestones: initialMilestones, ...projectData } = data;

  const activeStatuses: ProjectRecordStatus[] = ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'];
  const sourceConflict = projectData.renovationCaseId
    ? { renovationCaseId: projectData.renovationCaseId }
    : projectData.guidanceJourneyId
    ? { guidanceJourneyId: projectData.guidanceJourneyId }
    : projectData.priceFinalizationId
    ? { priceFinalizationId: projectData.priceFinalizationId }
    : projectData.bookingId
      ? { bookingId: projectData.bookingId }
      : null;
  const project = await withSerializableDedupe(async (tx) => {
    const [journey, inventoryItem, priceFinalization, booking, provider, renovationCase] = await Promise.all([
      projectData.guidanceJourneyId
        ? tx.guidanceJourney.findFirst({
            where: { id: projectData.guidanceJourneyId, propertyId },
            select: { id: true, inventoryItemId: true, templateVersion: true, status: true },
          })
        : null,
      projectData.inventoryItemId
        ? tx.inventoryItem.findFirst({ where: { id: projectData.inventoryItemId, propertyId }, select: { id: true } })
        : null,
      projectData.priceFinalizationId
        ? tx.priceFinalization.findFirst({ where: { id: projectData.priceFinalizationId, propertyId }, select: { id: true } })
        : null,
      projectData.bookingId
        ? tx.booking.findFirst({ where: { id: projectData.bookingId, propertyId }, select: { id: true } })
        : null,
      projectData.contractorId
        ? tx.providerProfile.findUnique({
            where: { id: projectData.contractorId },
            select: {
              id: true,
              status: true,
              licenseVerified: true,
              insuranceVerified: true,
              categoryEligibility: projectData.serviceCategory
                ? { where: { serviceCategory: projectData.serviceCategory }, select: { isEligible: true, missingCredentialTypes: true } }
                : undefined,
            },
          })
        : null,
      projectData.renovationCaseId
        ? tx.renovationCase.findFirst({
            where: {
              id: projectData.renovationCaseId,
              propertyId,
              currentScopeVersionId: projectData.renovationScopeVersionId,
              archivedAt: null,
            },
            select: { id: true },
          })
        : null,
    ]);
    if (projectData.guidanceJourneyId && !journey) {
      throw new APIError('Guidance journey not found for this property.', 400, 'INVALID_GUIDANCE_JOURNEY');
    }
    if (projectData.inventoryItemId && !inventoryItem) {
      throw new APIError('Inventory item not found for this property.', 400, 'INVALID_INVENTORY_ITEM');
    }
    if (projectData.priceFinalizationId && !priceFinalization) {
      throw new APIError('Price finalization not found for this property.', 400, 'INVALID_PRICE_FINALIZATION');
    }
    if (projectData.bookingId && !booking) {
      throw new APIError('Booking not found for this property.', 400, 'INVALID_BOOKING');
    }
    if (journey?.inventoryItemId && projectData.inventoryItemId && journey.inventoryItemId !== projectData.inventoryItemId) {
      throw new APIError('The project item must match the guidance journey item.', 409, 'JOURNEY_ITEM_MISMATCH');
    }
    if (projectData.contractorId && !provider) {
      throw new APIError('Selected provider was not found.', 400, 'INVALID_PROVIDER');
    }
    if (projectData.renovationCaseId && !renovationCase) {
      throw new APIError(
        'Renovation handoff must reference this property and its current scope version.',
        409,
        'RENOVATION_PROJECT_SCOPE_MISMATCH',
      );
    }
    const eligibility = provider?.categoryEligibility?.[0];
    if (projectData.sourceType === 'GUIDANCE' && provider && (
      provider.status !== 'ACTIVE' ||
      !provider.licenseVerified ||
      !provider.insuranceVerified ||
      (projectData.serviceCategory && !eligibility?.isEligible)
    )) {
      throw new APIError(
        'The selected provider does not have current credentials for this project category.',
        409,
        'PROVIDER_CREDENTIALS_INCOMPLETE',
        { missingCredentialTypes: eligibility?.missingCredentialTypes ?? [] },
      );
    }

    const duplicate = await tx.projectRecord.findFirst({
      where: {
        propertyId,
        status: { in: activeStatuses },
        ...(sourceConflict ?? {
          projectType: projectData.projectType,
          ...(projectData.homeSystemsAffected?.length
            ? { homeSystemsAffected: { hasSome: projectData.homeSystemsAffected as InventoryItemCategory[] } }
            : projectData.serviceCategory
              ? { serviceCategory: projectData.serviceCategory }
              : {}),
        }),
      },
      select: { id: true, name: true, status: true, projectType: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (duplicate) {
      throw new APIError(
        `An active ${duplicate.projectType.toLowerCase().replace(/_/g, ' ')} project already exists.`,
        409,
        'ACTIVE_PROJECT_DUPLICATE',
        { existingProjectId: duplicate.id, existingProjectName: duplicate.name, existingProjectStatus: duplicate.status },
      );
    }

    const created = await tx.projectRecord.create({
      data: {
        propertyId,
        name: projectData.name,
        projectType: projectData.projectType,
        contractorName: projectData.contractorName,
        contractorLicense: projectData.contractorLicense,
        contractorPhone: projectData.contractorPhone,
        contractorEmail: projectData.contractorEmail,
        contractorId: projectData.contractorId,
        description: projectData.description,
        sourceType: projectData.sourceType ?? 'MANUAL',
        guidanceJourneyId: projectData.guidanceJourneyId,
        inventoryItemId: projectData.inventoryItemId ?? journey?.inventoryItemId,
        priceFinalizationId: projectData.priceFinalizationId,
        bookingId: projectData.bookingId,
        executionPath: projectData.executionPath,
        fulfillmentMode: projectData.fulfillmentMode ?? 'PROVIDER',
        fundingMode: projectData.fundingMode ?? 'SELF_PAID',
        complexity: projectData.complexity ?? 'MAJOR',
        recommendationVersion: projectData.recommendationVersion ?? journey?.templateVersion,
        sourceActionId: projectData.sourceActionId,
        sourceEntityType: projectData.sourceEntityType,
        sourceEntityId: projectData.sourceEntityId,
        sourceJourneyId: projectData.sourceJourneyId,
        renovationCaseId: projectData.renovationCaseId,
        renovationScopeVersionId: projectData.renovationScopeVersionId,
        ...(projectData.renovationScopeSnapshot !== undefined && {
          renovationScopeSnapshot: projectData.renovationScopeSnapshot as Prisma.InputJsonValue,
        }),
        ...(projectData.inheritedConditions !== undefined && {
          inheritedConditions: projectData.inheritedConditions as Prisma.InputJsonValue,
        }),
        ...(projectData.inheritedDependencies !== undefined && {
          inheritedDependencies: projectData.inheritedDependencies as Prisma.InputJsonValue,
        }),
        ...(projectData.evidenceRequirements !== undefined && {
          evidenceRequirements: projectData.evidenceRequirements as Prisma.InputJsonValue,
        }),
        contractDocumentIds: projectData.contractDocumentIds ?? [],
        permitApplicability: projectData.permitApplicability ?? 'UNKNOWN',
        permitApplicabilityBasis: projectData.permitApplicabilityBasis,
        hoaApplicability: projectData.hoaApplicability ?? 'UNKNOWN',
        hoaApplicabilityBasis: projectData.hoaApplicabilityBasis,
        providerRankingRationale: projectData.providerRankingRationale,
        commercialDisclosure: projectData.commercialDisclosure,
        credentialCheck: projectData.contractorId ? {
          checkedAt: new Date().toISOString(),
          providerStatus: provider?.status,
          licenseVerified: provider?.licenseVerified,
          insuranceVerified: provider?.insuranceVerified,
          categoryEligible: eligibility?.isEligible ?? null,
          missingCredentialTypes: eligibility?.missingCredentialTypes ?? [],
        } : {
          checkedAt: new Date().toISOString(),
          userSuppliedProvider: true,
          status: 'NOT_PLATFORM_VERIFIED',
        },
        contractAmountCents: projectData.contractAmountCents,
        currentContractAmountCents: projectData.contractAmountCents,
        startDate: new Date(projectData.startDate),
        expectedEndDate: projectData.expectedEndDate ? new Date(projectData.expectedEndDate) : undefined,
        homeSystemsAffected: (projectData.homeSystemsAffected ?? []) as InventoryItemCategory[],
        serviceCategory: projectData.serviceCategory,
        contractDocumentKey: projectData.contractDocumentKey,
        status: 'DRAFT',
      },
    });

    if (initialMilestones?.length) {
      await tx.projectMilestone.createMany({
        data: initialMilestones.map((m: any) => ({
          projectId: created.id,
          propertyId,
          name: m.name,
          description: m.description,
          milestoneType: m.milestoneType ?? 'STANDARD',
          scheduledDate: m.scheduledDate ? new Date(m.scheduledDate) : undefined,
          requiresPhotoEvidence: m.requiresPhotoEvidence ?? false,
          position: m.position,
        })),
      });
    }
    return created;
  });

  await syncJourneyWorkItemForProjectEvent(propertyId, project.guidanceJourneyId, project.id, 'HANDOFF', null);
  await syncFindingWorkItemForProjectHandoff(propertyId, project.sourceEntityType, project.sourceEntityId, project.id);

  return getProjectDetail(project.id, propertyId);
}

export async function getProjectDetail(projectId: string, propertyId: string) {
  const project = await prisma.projectRecord.findUnique({
    where: { id: projectId },
    include: {
      milestones: { orderBy: { position: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' } },
      changeOrders: { orderBy: { changeNumber: 'asc' } },
      issues: { orderBy: { createdAt: 'desc' } },
      _count: { select: { progressLogs: true, writeBacks: true } },
    },
  });
  if (!project || project.propertyId !== propertyId) {
    throw new APIError('Project not found', 404, 'NOT_FOUND');
  }
  return project;
}

/**
 * Home Operations Slice 6: the reconciliation ledger deliverable's data
 * layer — ProjectWriteBack is already the append-only audit ledger
 * confirmCompletion writes to on every write-back; nothing previously read
 * it back out.
 */
export async function listProjectWriteBacks(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectWriteBack.findMany({
    where: { projectId },
    orderBy: { appliedAt: 'asc' },
  });
}

export async function updateProject(projectId: string, propertyId: string, data: any) {
  const existing = await assertProject(projectId, propertyId);
  const permitApplicability = data.permitApplicability ?? existing.permitApplicability;
  const permitApplicabilityBasis = data.permitApplicability === 'UNKNOWN'
    ? null
    : data.permitApplicabilityBasis !== undefined
      ? data.permitApplicabilityBasis
      : existing.permitApplicabilityBasis;
  const hoaApplicability = data.hoaApplicability ?? existing.hoaApplicability;
  const hoaApplicabilityBasis = data.hoaApplicability === 'UNKNOWN'
    ? null
    : data.hoaApplicabilityBasis !== undefined
      ? data.hoaApplicabilityBasis
      : existing.hoaApplicabilityBasis;
  assertProjectRequirementApplicability('Permit', permitApplicability, permitApplicabilityBasis);
  assertProjectRequirementApplicability('HOA', hoaApplicability, hoaApplicabilityBasis);

  return prisma.projectRecord.update({
    where: { id: projectId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.contractorName && { contractorName: data.contractorName }),
      ...(data.contractorLicense !== undefined && { contractorLicense: data.contractorLicense }),
      ...(data.contractorPhone !== undefined && { contractorPhone: data.contractorPhone }),
      ...(data.contractorEmail !== undefined && { contractorEmail: data.contractorEmail }),
      ...(data.contractorId !== undefined && { contractorId: data.contractorId }),
      ...(data.expectedEndDate && { expectedEndDate: new Date(data.expectedEndDate) }),
      ...(data.homeSystemsAffected && { homeSystemsAffected: data.homeSystemsAffected }),
      ...(data.serviceCategory !== undefined && { serviceCategory: data.serviceCategory }),
      ...(data.contractDocumentKey !== undefined && { contractDocumentKey: data.contractDocumentKey }),
      ...(data.status && { status: data.status as ProjectRecordStatus }),
      ...(data.permitApplicability !== undefined && { permitApplicability, permitApplicabilityBasis }),
      ...(data.permitApplicabilityBasis !== undefined && data.permitApplicability === undefined && { permitApplicabilityBasis }),
      ...(data.hoaApplicability !== undefined && { hoaApplicability, hoaApplicabilityBasis }),
      ...(data.hoaApplicabilityBasis !== undefined && data.hoaApplicability === undefined && { hoaApplicabilityBasis }),
    },
  });
}

export async function cancelProject(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  const cancelled = await prisma.projectRecord.update({
    where: { id: projectId },
    data: { status: 'CANCELLED' },
  });
  await syncJourneyWorkItemForProjectEvent(propertyId, cancelled.guidanceJourneyId, projectId, 'CANCELLED', null);
  return cancelled;
}

// ── Milestones ────────────────────────────────────────────────────────────────

export async function listMilestones(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectMilestone.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
    include: {
      triggeredPayments: { select: { id: true, description: true, amountCents: true, status: true } },
    },
  });
}

export async function createMilestone(projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
  if (data.linkedPermitMilestoneId || data.milestoneType === 'PERMIT_INSPECTION') {
    throw new APIError(
      'Permit inspection milestones are created by execution reconciliation and remain read-only in Project Tracker.',
      409,
      'PERMIT_TRACKER_AUTHORITY_REQUIRED',
    );
  }
  await assertMilestoneLinks(projectId, propertyId, data);

  // Auto-assign position if not provided (append to end)
  let position = data.position;
  if (position === undefined) {
    const max = await prisma.projectMilestone.aggregate({
      where: { projectId },
      _max: { position: true },
    });
    position = (max._max.position ?? -1) + 1;
  }

  return prisma.projectMilestone.create({
    data: {
      projectId,
      propertyId,
      name: data.name,
      description: data.description,
      milestoneType: data.milestoneType ?? 'STANDARD',
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
      requiresPhotoEvidence: data.requiresPhotoEvidence ?? false,
      position,
      dependsOnMilestoneId: data.dependsOnMilestoneId,
      linkedPermitMilestoneId: data.linkedPermitMilestoneId,
    },
  });
}

export async function updateMilestone(milestoneId: string, projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
  const milestone = await assertMilestone(milestoneId, projectId);
  if (milestone.executionSourceType !== 'MANUAL' || milestone.linkedPermitMilestoneId) {
    throw new APIError(
      'This is a read-only compliance projection. Update its authoritative source and reconcile again.',
      409,
      'EXECUTION_PROJECTION_READ_ONLY',
      {
        sourceType: milestone.executionSourceType,
        sourceId: milestone.executionSourceId ?? milestone.linkedPermitMilestoneId,
      },
    );
  }
  await assertMilestoneLinks(projectId, propertyId, data);

  return prisma.projectMilestone.update({
    where: { id: milestoneId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.scheduledDate && { scheduledDate: new Date(data.scheduledDate) }),
      ...(data.requiresPhotoEvidence !== undefined && { requiresPhotoEvidence: data.requiresPhotoEvidence }),
      ...(data.status && { status: data.status as ProjectMilestoneStatus }),
      ...(data.position !== undefined && { position: data.position }),
      ...(data.dependsOnMilestoneId !== undefined && { dependsOnMilestoneId: data.dependsOnMilestoneId }),
      ...(data.linkedPermitMilestoneId !== undefined && { linkedPermitMilestoneId: data.linkedPermitMilestoneId }),
    },
  });
}

export async function completeMilestone(
  milestoneId: string, projectId: string, propertyId: string,
  userId: string, data: any,
) {
  await assertProject(projectId, propertyId);
  const milestone = await assertMilestone(milestoneId, projectId);

  if (milestone.executionSourceType !== 'MANUAL' || milestone.linkedPermitMilestoneId) {
    throw new APIError(
      'Compliance projections can only complete from their authoritative source.',
      409,
      'EXECUTION_PROJECTION_READ_ONLY',
      {
        sourceType: milestone.executionSourceType,
        sourceId: milestone.executionSourceId ?? milestone.linkedPermitMilestoneId,
      },
    );
  }
  if (milestone.status === 'COMPLETE') {
    throw new APIError('Milestone is already complete', 400, 'ALREADY_COMPLETE');
  }
  if (milestone.status === 'DISPUTED') {
    throw new APIError('Disputed milestone cannot be completed — resolve the dispute first', 400, 'DISPUTED');
  }

  // Check photo evidence requirement
  if (milestone.requiresPhotoEvidence) {
    const photoCount = await prisma.projectProgressLog.count({
      where: {
        projectId,
        milestoneId,
        photoKeys: { isEmpty: false },
      },
    });
    if (photoCount === 0) {
      throw new APIError(
        'This milestone requires at least one photo before it can be marked complete',
        400, 'PHOTO_REQUIRED',
      );
    }
  }

  const completedDate = data.actualCompletedDate ? new Date(data.actualCompletedDate) : new Date();

  const updated = await prisma.projectMilestone.update({
    where: { id: milestoneId },
    data: {
      status: 'COMPLETE',
      actualCompletedDate: completedDate,
      completionNotes: data.completionNotes,
      completedByUserId: userId,
    },
  });

  // Release payments gated on this milestone
  await triggerMilestonePayments(milestoneId, projectId);

  return updated;
}

export async function deleteMilestone(milestoneId: string, projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  const milestone = await assertMilestone(milestoneId, projectId);
  if (milestone.executionSourceType !== 'MANUAL' || milestone.linkedPermitMilestoneId) {
    throw new APIError(
      'Compliance projections are removed only when their authoritative source is no longer in scope.',
      409,
      'EXECUTION_PROJECTION_READ_ONLY',
    );
  }
  await prisma.projectMilestone.delete({ where: { id: milestoneId } });
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function listPayments(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectPayment.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: {
      triggerMilestone: { select: { id: true, name: true, status: true } },
    },
  });
}

export async function createPayment(projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
  return prisma.projectPayment.create({
    data: {
      projectId,
      description: data.description,
      amountCents: data.amountCents,
      triggerType: data.triggerType ?? 'MANUAL',
      triggerMilestoneId: data.triggerMilestoneId,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      notes: data.notes,
    },
  });
}

export async function updatePayment(paymentId: string, projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
  await assertPayment(paymentId, projectId);

  return prisma.projectPayment.update({
    where: { id: paymentId },
    data: {
      ...(data.description && { description: data.description }),
      ...(data.amountCents && { amountCents: data.amountCents }),
      ...(data.triggerType && { triggerType: data.triggerType as ProjectPaymentTriggerType }),
      ...(data.triggerMilestoneId !== undefined && { triggerMilestoneId: data.triggerMilestoneId }),
      ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status && { status: data.status as ProjectPaymentStatus }),
    },
  });
}

export async function markPaymentPaid(
  paymentId: string, projectId: string, propertyId: string, data: any,
) {
  await assertProject(projectId, propertyId);
  const payment = await assertPayment(paymentId, projectId);

  if (payment.status === 'PAID') {
    throw new APIError('Payment is already marked as paid', 400, 'ALREADY_PAID');
  }
  if (payment.status === 'ON_HOLD') {
    throw new APIError('Payment is on hold due to a blocking issue', 400, 'PAYMENT_ON_HOLD');
  }

  // Enforce milestone gate: MILESTONE-triggered payments must have milestone COMPLETE
  if (payment.triggerType === 'MILESTONE' && payment.triggerMilestoneId) {
    const ms = await prisma.projectMilestone.findUnique({
      where: { id: payment.triggerMilestoneId },
      select: { status: true },
    });
    if (!ms || ms.status !== 'COMPLETE') {
      throw new APIError(
        'The milestone linked to this payment must be completed before marking it paid',
        400, 'MILESTONE_GATE',
      );
    }
  }

  const updated = await prisma.projectPayment.update({
    where: { id: paymentId },
    data: {
      status: 'PAID',
      paidDate: data.paidDate ? new Date(data.paidDate) : new Date(),
      paymentMethod: data.paymentMethod,
      receiptDocumentKey: data.receiptDocumentKey,
    },
  });

  await recalcProjectTotals(projectId);
  return updated;
}

export async function deletePayment(paymentId: string, projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  const payment = await assertPayment(paymentId, projectId);
  if (payment.status === 'PAID') {
    throw new APIError('Cannot delete a paid payment', 400, 'PAYMENT_PAID');
  }
  await prisma.projectPayment.delete({ where: { id: paymentId } });
}

// ── Change Orders ─────────────────────────────────────────────────────────────

type ChangeComplianceImpact = {
  workItemsChanged?: boolean;
  spacesChanged?: boolean;
  systemsChanged?: boolean;
  dimensionsChanged?: boolean;
  structuralEffectsChanged?: boolean;
  exteriorEffectsChanged?: boolean;
  regulatedMaterialsChanged?: boolean;
  scheduleOnly?: boolean;
  explanation?: string;
};

export function evaluateChangeOrderComplianceImpact(impact: ChangeComplianceImpact | null | undefined) {
  if (!impact) {
    return {
      complianceStatus: 'NOT_EVALUATED' as const,
      permitRecheckRequired: false,
      hoaReapprovalRequired: false,
    };
  }
  const permitRecheckRequired = Boolean(
    impact.workItemsChanged
    || impact.systemsChanged
    || impact.dimensionsChanged
    || impact.structuralEffectsChanged
    || impact.regulatedMaterialsChanged,
  );
  const hoaReapprovalRequired = Boolean(
    impact.workItemsChanged
    || impact.spacesChanged
    || impact.dimensionsChanged
    || impact.structuralEffectsChanged
    || impact.exteriorEffectsChanged
    || impact.regulatedMaterialsChanged,
  );
  return {
    complianceStatus: permitRecheckRequired || hoaReapprovalRequired
      ? 'RECHECK_REQUIRED' as const
      : 'NO_RECHECK_REQUIRED' as const,
    permitRecheckRequired,
    hoaReapprovalRequired,
  };
}

export async function listChangeOrders(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectChangeOrder.findMany({
    where: { projectId },
    orderBy: { changeNumber: 'asc' },
  });
}

export async function createChangeOrder(projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
  const impactAssessment = evaluateChangeOrderComplianceImpact(data.complianceImpact);

  const max = await prisma.projectChangeOrder.aggregate({
    where: { projectId },
    _max: { changeNumber: true },
  });
  const changeNumber = (max._max.changeNumber ?? 0) + 1;

  return prisma.projectChangeOrder.create({
    data: {
      projectId,
      changeNumber,
      title: data.title,
      description: data.description,
      category: data.category,
      costDeltaCents: data.costDeltaCents,
      status: 'PROPOSED',
      proposedByName: data.proposedByName,
      supportingDocumentKey: data.supportingDocumentKey,
      notes: data.notes,
      complianceImpact: data.complianceImpact,
      complianceStatus: impactAssessment.complianceStatus,
      amendedPermitStatus: impactAssessment.permitRecheckRequired ? 'REQUIRED' : 'NOT_APPLICABLE',
      hoaReapprovalStatus: impactAssessment.hoaReapprovalRequired ? 'REQUIRED' : 'NOT_APPLICABLE',
    },
  });
}

export async function updateChangeOrder(
  changeOrderId: string, projectId: string, propertyId: string, data: any,
) {
  await assertProject(projectId, propertyId);
  const co = await assertChangeOrder(changeOrderId, projectId);
  if (co.status !== 'PROPOSED') {
    throw new APIError('Only PROPOSED change orders can be edited', 400, 'CHANGE_ORDER_NOT_EDITABLE');
  }
  const impactAssessment = data.complianceImpact !== undefined
    ? evaluateChangeOrderComplianceImpact(data.complianceImpact)
    : null;

  return prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description && { description: data.description }),
      ...(data.category && { category: data.category }),
      ...(data.costDeltaCents !== undefined && { costDeltaCents: data.costDeltaCents }),
      ...(data.proposedByName && { proposedByName: data.proposedByName }),
      ...(data.supportingDocumentKey !== undefined && { supportingDocumentKey: data.supportingDocumentKey }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.complianceImpact !== undefined && {
        complianceImpact: data.complianceImpact,
        complianceStatus: impactAssessment!.complianceStatus,
        amendedPermitStatus: impactAssessment!.permitRecheckRequired ? 'REQUIRED' : 'NOT_APPLICABLE',
        hoaReapprovalStatus: impactAssessment!.hoaReapprovalRequired ? 'REQUIRED' : 'NOT_APPLICABLE',
        complianceReviewNotes: null,
        complianceEvidenceDocumentIds: [],
        complianceReviewedByUserId: null,
        complianceReviewedAt: null,
      }),
    },
  });
}

export async function reviewChangeOrderCompliance(
  changeOrderId: string,
  projectId: string,
  propertyId: string,
  userId: string,
  data: any,
) {
  await assertProject(projectId, propertyId);
  const co = await assertChangeOrder(changeOrderId, projectId);
  if (co.status !== 'PROPOSED') {
    throw new APIError(
      'Compliance review can only be recorded while a change order is PROPOSED.',
      409,
      'CHANGE_ORDER_NOT_EDITABLE',
    );
  }
  if (co.complianceStatus === 'NOT_EVALUATED') {
    throw new APIError(
      'Record the structured scope impact before reviewing compliance.',
      409,
      'CHANGE_ORDER_IMPACT_REQUIRED',
    );
  }

  const impact = (co.complianceImpact ?? {}) as ChangeComplianceImpact;
  const assessment = evaluateChangeOrderComplianceImpact(impact);
  const permitStatus = assessment.permitRecheckRequired
    ? data.amendedPermitStatus
    : 'NOT_APPLICABLE';
  const hoaStatus = assessment.hoaReapprovalRequired
    ? data.hoaReapprovalStatus
    : 'NOT_APPLICABLE';
  const evidenceIds: string[] = data.evidenceDocumentIds ?? [];
  const recheckComplete = (
    (!assessment.permitRecheckRequired || permitStatus === 'CONFIRMED')
    && (!assessment.hoaReapprovalRequired || hoaStatus === 'CONFIRMED')
  );

  if (recheckComplete && evidenceIds.length === 0) {
    throw new APIError(
      'Authority or association evidence is required before compliance recheck can be completed.',
      409,
      'CHANGE_ORDER_COMPLIANCE_EVIDENCE_REQUIRED',
    );
  }

  return prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: {
      amendedPermitStatus: permitStatus,
      hoaReapprovalStatus: hoaStatus,
      complianceStatus: recheckComplete ? 'RECHECK_COMPLETE' : assessment.complianceStatus,
      complianceReviewNotes: data.reviewNotes,
      complianceEvidenceDocumentIds: evidenceIds,
      complianceReviewedByUserId: userId,
      complianceReviewedAt: new Date(),
    },
  });
}

export async function approveChangeOrder(
  changeOrderId: string, projectId: string, propertyId: string, userId: string,
) {
  await assertProject(projectId, propertyId);
  const co = await assertChangeOrder(changeOrderId, projectId);
  if (co.status !== 'PROPOSED') {
    throw new APIError('Only PROPOSED change orders can be approved', 400, 'INVALID_STATUS');
  }
  if (
    co.complianceStatus === 'NOT_EVALUATED'
    || co.complianceStatus === 'RECHECK_REQUIRED'
    || co.amendedPermitStatus === 'REQUIRED'
    || co.amendedPermitStatus === 'REQUESTED'
    || co.hoaReapprovalStatus === 'REQUIRED'
    || co.hoaReapprovalStatus === 'REQUESTED'
  ) {
    throw new APIError(
      'Complete the permit and HOA impact recheck before approving this change order.',
      409,
      'CHANGE_ORDER_COMPLIANCE_RECHECK_REQUIRED',
      {
        complianceStatus: co.complianceStatus,
        amendedPermitStatus: co.amendedPermitStatus,
        hoaReapprovalStatus: co.hoaReapprovalStatus,
      },
    );
  }

  const updated = await prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() },
  });

  await recalcProjectTotals(projectId);
  const database = prisma as any;
  const project = await database.projectRecord.findUnique({
    where: { id: projectId },
    select: { bookingId: true, priceFinalizationId: true },
  });
  const workspace = await database.quoteComparisonWorkspace.findFirst({
    where: {
      propertyId,
      OR: [
        { contextLinks: { some: { entityType: 'PROJECT', entityId: projectId } } },
        ...(project?.bookingId ? [{ booking: { id: project.bookingId } }] : []),
        ...(project?.priceFinalizationId
          ? [{ priceFinalization: { id: project.priceFinalizationId } }]
          : []),
      ],
    },
    select: {
      id: true,
      outcomeMeasurementConsentJson: true,
      outcomeMeasurementConsentedAt: true,
      outcomeMeasurementConsentRevokedAt: true,
    },
  });
  if (workspace && outcomeConsentAllows(workspace, 'changeOrders')) {
    emitServiceQuoteDecisionAnalytics({
      eventName: ServiceQuoteDecisionEvent.CHANGE_ORDER_APPROVED,
      eventType: ProductAnalyticsEventType.ACTION_COMPLETED,
      userId,
      propertyId,
      workspaceId: workspace.id,
      metadata: {
        projectId,
        changeOrderId,
        category: updated.category,
        capturedWithConsent: true,
      },
      valueNumeric: updated.costDeltaCents / 100,
    });
  }
  return updated;
}

export async function rejectChangeOrder(
  changeOrderId: string, projectId: string, propertyId: string,
) {
  await assertProject(projectId, propertyId);
  const co = await assertChangeOrder(changeOrderId, projectId);
  if (co.status !== 'PROPOSED') {
    throw new APIError('Only PROPOSED change orders can be rejected', 400, 'INVALID_STATUS');
  }

  return prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: { status: 'REJECTED' },
  });
}

export async function voidChangeOrder(
  changeOrderId: string, projectId: string, propertyId: string,
) {
  await assertProject(projectId, propertyId);
  const co = await assertChangeOrder(changeOrderId, projectId);
  if (co.status === 'VOIDED') {
    throw new APIError('Change order is already voided', 400, 'ALREADY_VOIDED');
  }
  if (co.status === 'APPROVED') {
    // Voiding an approved change order needs recalc
    const updated = await prisma.projectChangeOrder.update({
      where: { id: changeOrderId },
      data: { status: 'VOIDED' },
    });
    await recalcProjectTotals(projectId);
    return updated;
  }

  return prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: { status: 'VOIDED' },
  });
}

// ── Progress Log ──────────────────────────────────────────────────────────────

export async function listLogEntries(projectId: string, propertyId: string, params: any) {
  await assertProject(projectId, propertyId);
  const { milestoneId, entryType, from, to, limit = 50, cursor } = params;

  const where: Prisma.ProjectProgressLogWhereInput = {
    projectId,
    ...(milestoneId && { milestoneId }),
    ...(entryType && { entryType }),
    ...(from || to ? {
      entryDate: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    } : {}),
  };

  const entries = await prisma.projectProgressLog.findMany({
    where,
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: {
      milestone: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
    },
  });

  const hasMore = entries.length > limit;
  return {
    entries: hasMore ? entries.slice(0, limit) : entries,
    nextCursor: hasMore ? entries[limit - 1].id : null,
  };
}

export async function createLogEntry(projectId: string, propertyId: string, userId: string, data: any) {
  await assertProject(projectId, propertyId);
  return prisma.projectProgressLog.create({
    data: {
      projectId,
      milestoneId: data.milestoneId,
      entryDate: new Date(data.entryDate),
      entryType: data.entryType,
      notes: data.notes,
      photoKeys: data.photoKeys ?? [],
      roomId: data.roomId,
      materialType: data.materialType,
      materialBrand: data.materialBrand,
      materialModel: data.materialModel,
      materialColor: data.materialColor,
      materialSupplier: data.materialSupplier,
      materialQuantity: data.materialQuantity,
      loggedByUserId: userId,
    },
    include: {
      milestone: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
    },
  });
}

export async function deleteLogEntry(logId: string, projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  const entry = await prisma.projectProgressLog.findUnique({
    where: { id: logId },
    select: { id: true, projectId: true },
  });
  if (!entry || entry.projectId !== projectId) {
    throw new APIError('Log entry not found', 404, 'NOT_FOUND');
  }
  await prisma.projectProgressLog.delete({ where: { id: logId } });
}

// ── Issues ────────────────────────────────────────────────────────────────────

export async function listIssues(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectIssue.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createIssue(projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);

  const isBlocking = data.severity === 'BLOCKING';
  const blocksPayment = data.blocksPayment ?? isBlocking;

  const issue = await prisma.projectIssue.create({
    data: {
      projectId,
      title: data.title,
      description: data.description,
      severity: data.severity as ProjectIssueSeverity,
      category: data.category,
      status: 'OPEN',
      blocksPayment,
      attachmentKeys: data.attachmentKeys ?? [],
    },
  });

  if (isBlocking) {
    await holdPaymentsForBlockingIssue(projectId);
  }

  return issue;
}

export async function updateIssue(issueId: string, projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
  const issue = await assertIssue(issueId, projectId);
  if (issue.sourceEntityType) {
    throw new APIError(
      'This issue is controlled by a compliance source and cannot be edited manually.',
      409,
      'EXECUTION_ISSUE_SOURCE_AUTHORITY_REQUIRED',
      { sourceType: issue.sourceEntityType, sourceId: issue.sourceEntityId },
    );
  }

  return prisma.projectIssue.update({
    where: { id: issueId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description && { description: data.description }),
      ...(data.severity && { severity: data.severity }),
      ...(data.category && { category: data.category }),
      ...(data.status && { status: data.status as ProjectIssueStatus }),
      ...(data.blocksPayment !== undefined && { blocksPayment: data.blocksPayment }),
      ...(data.attachmentKeys && { attachmentKeys: data.attachmentKeys }),
    },
  });
}

export async function resolveIssue(
  issueId: string, projectId: string, propertyId: string,
  userId: string, data: any,
) {
  await assertProject(projectId, propertyId);
  const issue = await assertIssue(issueId, projectId);

  if (issue.status === 'RESOLVED') {
    throw new APIError('Issue is already resolved', 400, 'ALREADY_RESOLVED');
  }
  if (issue.sourceEntityType) {
    throw new APIError(
      'Resolve the underlying permit inspection or HOA condition; reconciliation will close this issue.',
      409,
      'EXECUTION_ISSUE_SOURCE_AUTHORITY_REQUIRED',
      { sourceType: issue.sourceEntityType, sourceId: issue.sourceEntityId },
    );
  }

  const wasBlocking = issue.severity === 'BLOCKING';

  const updated = await prisma.projectIssue.update({
    where: { id: issueId },
    data: {
      status: 'RESOLVED',
      resolutionNotes: data.resolutionNotes,
      resolvedAt: new Date(),
      resolvedByUserId: userId,
    },
  });

  if (wasBlocking) {
    await restorePaymentsAfterBlockingResolved(projectId);
  }

  return updated;
}

// ── Completion ────────────────────────────────────────────────────────────────

export async function getCompletionChecklist(projectId: string, propertyId: string) {
  const project = await assertProject(projectId, propertyId);

  const [
    linkedPermits,
    linkedHoaApprovals,
    disputedMilestones,
    openBlockingOrMajorIssues,
    payments,
    photoCount,
  ] = await Promise.all([
    prisma.propertyPermitRecord.findMany({
      where: {
        propertyId,
        isActive: true,
        sourceEntityType: 'PROJECT',
        sourceEntityId: projectId,
      },
      select: {
        id: true,
        permitNumber: true,
        status: true,
        source: true,
        isVerified: true,
        finaledDate: true,
      },
    }),
    prisma.hoaApprovalRecord.findMany({
      where: {
        propertyId,
        isActive: true,
        sourceEntityType: 'PROJECT',
        sourceEntityId: projectId,
      },
      select: {
        id: true,
        decisionStatus: true,
        decisionTruthLayer: true,
        approvalConditions: true,
        expirationDate: true,
      },
    }),
    prisma.projectMilestone.count({
      where: { projectId, status: 'DISPUTED' },
    }),
    prisma.projectIssue.findMany({
      where: { projectId, severity: { in: ['BLOCKING', 'MAJOR'] }, status: { not: 'RESOLVED' } },
      select: { id: true, title: true, severity: true },
    }),
    prisma.projectPayment.findMany({
      where: { projectId },
      select: { id: true, description: true, status: true, amountCents: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.projectProgressLog.count({
      where: { projectId, photoKeys: { isEmpty: false } },
    }),
  ]);

  const lastPayment = payments[0];
  const finalPaymentPaid = lastPayment?.status === 'PAID';
  const officiallyFinaledPermit = linkedPermits.find((permit) =>
    permit.status === 'FINALED'
    && permit.finaledDate != null
    && (permit.source === 'OPEN_DATA_API' || permit.isVerified)
  );
  const authorityApprovedHoa = linkedHoaApprovals.find((approval) =>
    approval.decisionStatus === 'APPROVED'
    && (
      approval.decisionTruthLayer === 'SOURCE_OBSERVED'
      || approval.decisionTruthLayer === 'ASSOCIATION_CONFIRMED'
    )
    && (!approval.expirationDate || approval.expirationDate >= new Date())
  );
  const conditionalHoaApproval = linkedHoaApprovals.find((approval) =>
    approval.decisionStatus === 'APPROVED_WITH_CONDITIONS'
    && (
      approval.decisionTruthLayer === 'SOURCE_OBSERVED'
      || approval.decisionTruthLayer === 'ASSOCIATION_CONFIRMED'
    )
  );

  const checks = [
    evaluateRequirementCompletionCheck({
      key: 'permit_closeout',
      label: 'Required permit officially finaled',
      applicability: project.permitApplicability,
      basis: project.permitApplicabilityBasis,
      requiredSatisfied: Boolean(officiallyFinaledPermit),
      requiredBlockers: linkedPermits.length === 0
        ? ['Link the applicable permit record to this project.']
        : ['Obtain or record authority-backed permit finalization evidence.'],
    }),
    evaluateRequirementCompletionCheck({
      key: 'hoa_approval',
      label: 'Required HOA approval confirmed',
      applicability: project.hoaApplicability,
      basis: project.hoaApplicabilityBasis,
      requiredSatisfied: Boolean(authorityApprovedHoa),
      requiredBlockers: conditionalHoaApproval
        ? ['Confirm and satisfy every association approval condition before completion.']
        : linkedHoaApprovals.length === 0
          ? ['Link the applicable HOA approval record to this project.']
          : ['Record a current source-observed or association-confirmed approval.'],
    }),
    {
      key: 'no_disputed_milestones',
      label: 'No milestones in disputed status',
      status: disputedMilestones === 0 ? 'PASSED' as const : 'FAILED' as const,
      passed: disputedMilestones === 0,
      blockers: disputedMilestones > 0 ? [`${disputedMilestones} disputed milestone(s)`] : [],
    },
    {
      key: 'no_open_blocking_issues',
      label: 'No open blocking or major issues',
      status: openBlockingOrMajorIssues.length === 0 ? 'PASSED' as const : 'FAILED' as const,
      passed: openBlockingOrMajorIssues.length === 0,
      blockers: openBlockingOrMajorIssues.map(i => i.title),
    },
    {
      key: 'final_payment_paid',
      label: 'Final payment marked paid',
      status: finalPaymentPaid ? 'PASSED' as const : 'FAILED' as const,
      passed: finalPaymentPaid,
      blockers: !finalPaymentPaid && lastPayment ? [`Payment "${lastPayment.description}" is not paid`] : [],
    },
    {
      key: 'progress_photos_logged',
      label: 'At least one progress photo logged',
      status: photoCount > 0 ? 'PASSED' as const : 'FAILED' as const,
      passed: photoCount > 0,
      blockers: photoCount === 0 ? ['No progress photos have been logged'] : [],
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return { checks, allPassed };
}

export async function completeMinorWork(propertyId: string, userId: string, data: any) {
  const occurredAt = data.actualEndDate ? new Date(data.actualEndDate) : new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [journey, item] = await Promise.all([
      tx.guidanceJourney.findFirst({ where: { id: data.guidanceJourneyId, propertyId }, select: { id: true, inventoryItemId: true } }),
      tx.inventoryItem.findFirst({ where: { id: data.inventoryItemId, propertyId }, select: { id: true } }),
    ]);
    if (!journey) throw new APIError('Guidance journey not found for this property.', 404, 'GUIDANCE_JOURNEY_NOT_FOUND');
    if (!item || (journey.inventoryItemId && journey.inventoryItemId !== item.id)) {
      throw new APIError('Inventory item does not match the guidance journey.', 409, 'JOURNEY_ITEM_MISMATCH');
    }

    const event = await tx.homeEvent.upsert({
      where: { propertyId_idempotencyKey: { propertyId, idempotencyKey: `minor-work:${journey.id}` } },
      create: {
        propertyId,
        createdById: userId,
        inventoryItemId: item.id,
        guidanceJourneyId: journey.id,
        type: 'VERIFIED_RESOLUTION',
        subtype: 'MINOR_WORK_VERIFIED',
        occurredAt,
        title: data.title,
        summary: data.notes,
        amount: new Prisma.Decimal(data.actualCostCents).div(100),
        sourceBadge: 'VERIFIED',
        idempotencyKey: `minor-work:${journey.id}`,
        groupKey: `journey:${journey.id}`,
        meta: {
          executionPath: data.executionPath,
          fulfillmentMode: data.fulfillmentMode,
          providerName: data.providerName ?? null,
          providerRankingRationale: data.providerRankingRationale ?? null,
          commercialDisclosure: data.commercialDisclosure ?? null,
          recommendationComprehensionConfirmed: data.recommendationComprehensionConfirmed,
          modelNumber: data.modelNumber ?? null,
          serialNumber: data.serialNumber ?? null,
        },
      },
      update: {
        occurredAt,
        title: data.title,
        summary: data.notes,
        amount: new Prisma.Decimal(data.actualCostCents).div(100),
        sourceBadge: 'VERIFIED',
        meta: {
          executionPath: data.executionPath,
          fulfillmentMode: data.fulfillmentMode,
          providerName: data.providerName ?? null,
          providerRankingRationale: data.providerRankingRationale ?? null,
          commercialDisclosure: data.commercialDisclosure ?? null,
          recommendationComprehensionConfirmed: data.recommendationComprehensionConfirmed,
          modelNumber: data.modelNumber ?? null,
          serialNumber: data.serialNumber ?? null,
        },
      },
    });

    const documentIds: string[] = [];
    for (const proof of data.proofDocuments) {
      const uploadedDocument = proof.documentId
        ? await tx.document.findFirst({ where: { id: proof.documentId, propertyId } })
        : null;
      if (proof.documentId && !uploadedDocument) {
        throw new APIError('Uploaded proof document was not found for this property.', 409, 'INVALID_PROOF_DOCUMENT');
      }
      const document = uploadedDocument ? await tx.document.update({
        where: { id: uploadedDocument.id },
        data: {
          projectProofKey: `minor:${journey.id}:${proof.proofKey}`,
          inventoryItemId: item.id,
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: userId,
          metadata: { journeyId: journey.id, proofKind: proof.kind, minorWork: true },
        },
      }) : await tx.document.upsert({
        where: { projectProofKey: `minor:${journey.id}:${proof.proofKey}` },
        create: {
          propertyId,
          projectProofKey: `minor:${journey.id}:${proof.proofKey}`,
          inventoryItemId: item.id,
          uploadedBy: userId,
          type: proof.type,
          name: proof.name,
          fileUrl: proof.fileUrl!,
          fileSize: proof.fileSize,
          mimeType: proof.mimeType,
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: userId,
          metadata: { journeyId: journey.id, proofKind: proof.kind, minorWork: true },
        },
        update: { fileUrl: proof.fileUrl!, fileSize: proof.fileSize, mimeType: proof.mimeType, verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedByUserId: userId },
      });
      documentIds.push(document.id);
      await tx.homeEventDocument.upsert({
        where: { eventId_documentId: { eventId: event.id, documentId: document.id } },
        create: { eventId: event.id, documentId: document.id, kind: proof.kind, caption: proof.name },
        update: { kind: proof.kind, caption: proof.name },
      });
    }

    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        condition: data.executionPath === 'REPLACEMENT' ? 'NEW' : 'GOOD',
        installedOn: data.executionPath === 'REPLACEMENT' ? occurredAt : undefined,
        lastServicedOn: occurredAt,
        modelNumber: data.modelNumber,
        model: data.modelNumber,
        serialNumber: data.serialNumber,
        serialNo: data.serialNumber,
        replacementCostCents: data.actualCostCents,
        isVerified: true,
        verificationSource: 'MINOR_WORK_COMPLETION',
      },
    });

    const taskIds: string[] = [];
    for (const care of [
      data.nextMaintenanceDate ? { key: 'maintenance', title: `Maintain ${data.title}`, date: data.nextMaintenanceDate } : null,
      data.followUpDate ? { key: 'follow-up', title: `Check outcome of ${data.title}`, date: data.followUpDate } : null,
    ].filter(Boolean) as Array<{ key: string; title: string; date: string }>) {
      const actionKey = `minor-work:${journey.id}:${care.key}`;
      const task = await tx.propertyMaintenanceTask.upsert({
        where: { propertyId_actionKey: { propertyId, actionKey } },
        create: { propertyId, inventoryItemId: item.id, source: 'PROJECT_COMPLETION', actionKey, title: care.title, priority: 'MEDIUM', nextDueDate: new Date(care.date) },
        update: { title: care.title, nextDueDate: new Date(care.date), status: 'PENDING' },
      });
      taskIds.push(task.id);
    }

    await tx.homeEvent.update({
      where: { id: event.id },
      data: {
        meta: {
          executionPath: data.executionPath,
          fulfillmentMode: data.fulfillmentMode,
          providerName: data.providerName ?? null,
          providerRankingRationale: data.providerRankingRationale ?? null,
          commercialDisclosure: data.commercialDisclosure ?? null,
          recommendationComprehensionConfirmed: data.recommendationComprehensionConfirmed,
          recurringCareConverted: taskIds.length > 0,
          futureCareTaskCount: taskIds.length,
          modelNumber: data.modelNumber ?? null,
          serialNumber: data.serialNumber ?? null,
        },
      },
    });

    return { homeEventId: event.id, documentIds, futureCareTaskIds: taskIds, guidanceJourneyId: journey.id, inventoryItemId: item.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await JobQueueService.enqueueHomeDigitalTwinRefresh(
    propertyId,
    'Completed work updated a home system; decision inputs are being refreshed.',
    { sourceReferenceIds: [result.inventoryItemId] },
  ).catch((err) => logger.error({ err }, '[MINOR_WORK_COMPLETION] Twin refresh enqueue failed'));
  return result;
}

export async function confirmCompletion(projectId: string, propertyId: string, userId: string, data: any) {
  const actualEndDate = data.actualEndDate ? new Date(data.actualEndDate) : new Date();
  const warrantyExpiresAt = data.warrantyPeriodMonths
    ? new Date(actualEndDate.getTime() + data.warrantyPeriodMonths * 30 * 24 * 60 * 60 * 1000)
    : undefined;
  const verifiedSuccess = data.outcomeStatus === 'VERIFIED_SUCCESS';

  if (verifiedSuccess) {
    const { checks, allPassed } = await getCompletionChecklist(projectId, propertyId);
    if (!allPassed) {
      const failed = checks.filter(c => !c.passed).map(c => c.label);
      throw new APIError(
        `Cannot complete project — unresolved items: ${failed.join('; ')}`,
        400, 'CHECKLIST_INCOMPLETE',
      );
    }
  }

  const outcomeStatusToProjectStatus: Record<string, ProjectRecordStatus> = {
    VERIFIED_SUCCESS: 'COMPLETED',
    DISPUTED: 'DISPUTED',
    INCOMPLETE: 'PAUSED',
    FAILED: 'PAUSED',
    DELAYED: 'PAUSED',
    UNSAFE: 'PAUSED',
  };

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectRecord.findFirst({
      where: { id: projectId, propertyId },
      include: {
        property: { select: { homeownerProfileId: true } },
        contractorProfile: { select: { userId: true } },
        progressLogs: { where: { materialType: { not: null } } },
      },
    });
    if (!existing) throw new APIError('Project not found', 404, 'NOT_FOUND');

    if (verifiedSuccess && existing.fulfillmentMode === 'PROVIDER') {
      const ratings = [
        data.contractorRatingQuality,
        data.contractorRatingTimeline,
        data.contractorRatingComms,
        data.contractorRatingBudget,
      ];
      if (ratings.some((rating) => rating === undefined)) {
        throw new APIError('Provider-led verified closure requires all four provider ratings.', 400, 'PROVIDER_RATINGS_REQUIRED');
      }
    }

    if (verifiedSuccess && existing.writeBackAppliedAt && existing.outcomeStatus === 'VERIFIED_SUCCESS') {
      return {
        project: existing,
        writeBacks: await tx.projectWriteBack.findMany({ where: { projectId } }),
        idempotentReplay: true,
      };
    }

    const completionEvidence = {
      commissioningResult: data.commissioningResult,
      functionalVerificationResult: data.functionalVerificationResult,
      safetyCheckResult: data.safetyCheckResult,
      inspectionResult: data.inspectionResult,
      unresolvedExceptions: data.unresolvedExceptions,
      proofKeys: data.proofDocuments.map((proof: any) => proof.proofKey),
      modelNumber: data.modelNumber ?? null,
      serialNumber: data.serialNumber ?? null,
      workDate: actualEndDate.toISOString(),
    };
    const project = await tx.projectRecord.update({
      where: { id: projectId },
      data: {
        status: outcomeStatusToProjectStatus[data.outcomeStatus],
        actualEndDate: verifiedSuccess ? actualEndDate : undefined,
        outcomeStatus: data.outcomeStatus,
        commissioningResult: data.commissioningResult,
        functionalVerificationResult: data.functionalVerificationResult,
        safetyCheckResult: data.safetyCheckResult,
        inspectionResult: data.inspectionResult,
        unresolvedExceptions: data.unresolvedExceptions,
        completionEvidence,
        actualCostCents: data.actualCostCents,
        providerOutcome: data.providerOutcome,
        recommendationOverridden: data.recommendationOverridden,
        recommendationComprehensionConfirmed: data.recommendationComprehensionConfirmed,
        recommendationComprehensionConfirmedAt: data.recommendationComprehensionConfirmed ? new Date() : null,
        verifiedAt: verifiedSuccess ? new Date() : null,
        followUpDueAt: data.followUpDate ? new Date(data.followUpDate) : undefined,
        contractorRatingQuality: data.contractorRatingQuality,
        contractorRatingTimeline: data.contractorRatingTimeline,
        contractorRatingComms: data.contractorRatingComms,
        contractorRatingBudget: data.contractorRatingBudget,
        contractorReviewText: data.contractorReviewText,
        warrantyPeriodMonths: data.warrantyPeriodMonths,
        warrantyExpiresAt,
        warrantyDocumentKey: data.warrantyDocumentKey,
        completionRecordKey: data.completionRecordKey,
      },
    });

    const event = await tx.homeEvent.upsert({
      where: { propertyId_idempotencyKey: { propertyId, idempotencyKey: `project:${projectId}:outcome` } },
      create: {
        propertyId,
        projectId,
        createdById: userId,
        inventoryItemId: existing.inventoryItemId,
        guidanceJourneyId: existing.guidanceJourneyId,
        type: verifiedSuccess ? 'VERIFIED_RESOLUTION' : 'NOTE',
        subtype: `PROJECT_${data.outcomeStatus}`,
        importance: ['FAILED', 'UNSAFE', 'DISPUTED'].includes(data.outcomeStatus) ? 'HIGH' : 'NORMAL',
        occurredAt: actualEndDate,
        title: verifiedSuccess ? `${existing.name} verified complete` : `${existing.name}: ${String(data.outcomeStatus).toLowerCase().replace(/_/g, ' ')}`,
        summary: data.unresolvedExceptions.map((exception: any) => exception.summary).join('; ') || data.contractorReviewText,
        amount: data.actualCostCents === undefined ? undefined : new Prisma.Decimal(data.actualCostCents).div(100),
        sourceBadge: verifiedSuccess ? 'VERIFIED' : 'USER_REPORTED',
        idempotencyKey: `project:${projectId}:outcome`,
        groupKey: `project:${projectId}`,
        meta: { projectId, outcomeStatus: data.outcomeStatus, providerOutcome: data.providerOutcome, completionEvidence },
      },
      update: {
        type: verifiedSuccess ? 'VERIFIED_RESOLUTION' : 'NOTE',
        subtype: `PROJECT_${data.outcomeStatus}`,
        occurredAt: actualEndDate,
        sourceBadge: verifiedSuccess ? 'VERIFIED' : 'USER_REPORTED',
        amount: data.actualCostCents === undefined ? undefined : new Prisma.Decimal(data.actualCostCents).div(100),
        meta: { projectId, outcomeStatus: data.outcomeStatus, providerOutcome: data.providerOutcome, completionEvidence },
      },
    });

    // Home Operations Slice 6: preserve unresolved exceptions as real,
    // trackable ProjectIssue rows instead of only free text on the HomeEvent.
    if (data.unresolvedExceptions.length > 0) {
      await tx.projectIssue.createMany({
        data: data.unresolvedExceptions.map((exception: any) => mapUnresolvedExceptionToProjectIssue(projectId, exception)),
      });
    }

    const proofDocuments = [...data.proofDocuments];
    if (data.warrantyDocumentKey && !proofDocuments.some((proof: any) => proof.proofKey === 'warranty')) {
      proofDocuments.push({ proofKey: 'warranty', type: 'OTHER', name: 'Project warranty', fileUrl: data.warrantyDocumentKey, fileSize: 0, mimeType: 'application/octet-stream', kind: 'PDF' });
    }
    if (data.completionRecordKey && !proofDocuments.some((proof: any) => proof.proofKey === 'completion-record')) {
      proofDocuments.push({ proofKey: 'completion-record', type: 'OTHER', name: 'Project completion record', fileUrl: data.completionRecordKey, fileSize: 0, mimeType: 'application/octet-stream', kind: 'PDF' });
    }
    const documentIds: string[] = [];
    for (const proof of proofDocuments) {
      const uploadedDocument = proof.documentId
        ? await tx.document.findFirst({ where: { id: proof.documentId, propertyId } })
        : null;
      if (proof.documentId && !uploadedDocument) {
        throw new APIError('Uploaded proof document was not found for this property.', 409, 'INVALID_PROOF_DOCUMENT');
      }
      const document = uploadedDocument ? await tx.document.update({
        where: { id: uploadedDocument.id },
        data: {
          projectId,
          projectProofKey: `${projectId}:${proof.proofKey}`,
          inventoryItemId: existing.inventoryItemId,
          verificationStatus: verifiedSuccess ? 'VERIFIED' : 'UNVERIFIED',
          verifiedAt: verifiedSuccess ? new Date() : null,
          verifiedByUserId: verifiedSuccess ? userId : null,
          metadata: { projectId, proofKind: proof.kind, outcomeStatus: data.outcomeStatus },
        },
      }) : await tx.document.upsert({
        where: { projectProofKey: `${projectId}:${proof.proofKey}` },
        create: {
          propertyId,
          projectId,
          projectProofKey: `${projectId}:${proof.proofKey}`,
          inventoryItemId: existing.inventoryItemId,
          uploadedBy: userId,
          type: proof.type,
          name: proof.name,
          fileUrl: proof.fileUrl!,
          fileSize: proof.fileSize,
          mimeType: proof.mimeType,
          verificationStatus: verifiedSuccess ? 'VERIFIED' : 'UNVERIFIED',
          verifiedAt: verifiedSuccess ? new Date() : undefined,
          verifiedByUserId: verifiedSuccess ? userId : undefined,
          metadata: { projectId, proofKind: proof.kind, outcomeStatus: data.outcomeStatus },
        },
        update: {
          fileUrl: proof.fileUrl!,
          fileSize: proof.fileSize,
          mimeType: proof.mimeType,
          verificationStatus: verifiedSuccess ? 'VERIFIED' : 'UNVERIFIED',
          verifiedAt: verifiedSuccess ? new Date() : null,
          verifiedByUserId: verifiedSuccess ? userId : null,
          metadata: { projectId, proofKind: proof.kind, outcomeStatus: data.outcomeStatus },
        },
      });
      documentIds.push(document.id);
      await tx.homeEventDocument.upsert({
        where: { eventId_documentId: { eventId: event.id, documentId: document.id } },
        create: { eventId: event.id, documentId: document.id, kind: proof.kind, caption: proof.name },
        update: { kind: proof.kind, caption: proof.name },
      });
    }

    let expenseId: string | null = null;
    let warrantyId: string | null = null;
    const materialSpecIds: string[] = [];
    const futureCareTaskIds: string[] = [];
    let providerReviewId: string | null = null;

    if (verifiedSuccess) {
      const expense = await tx.expense.upsert({
        where: { projectId },
        create: {
          homeownerProfileId: existing.property.homeownerProfileId,
          propertyId,
          projectId,
          bookingId: existing.bookingId,
          description: existing.name,
          category: 'REPAIR_SERVICE',
          amount: new Prisma.Decimal(data.actualCostCents).div(100),
          transactionDate: actualEndDate,
        },
        update: {
          amount: new Prisma.Decimal(data.actualCostCents).div(100),
          transactionDate: actualEndDate,
          description: existing.name,
        },
      });
      expenseId = expense.id;
      await tx.homeEvent.update({ where: { id: event.id }, data: { expenseId: expense.id } });

      if (data.warrantyPeriodMonths && warrantyExpiresAt) {
        const warranty = await tx.warranty.upsert({
          where: { projectId },
          create: {
            homeownerProfileId: existing.property.homeownerProfileId,
            propertyId,
            inventoryItemId: existing.inventoryItemId,
            projectId,
            category: 'OTHER',
            providerName: existing.contractorName ?? 'Manufacturer or installer',
            coverageDetails: `Warranty captured at completion of ${existing.name}`,
            startDate: actualEndDate,
            expiryDate: warrantyExpiresAt,
          },
          update: { startDate: actualEndDate, expiryDate: warrantyExpiresAt, providerName: existing.contractorName ?? 'Manufacturer or installer' },
        });
        warrantyId = warranty.id;
        await tx.document.updateMany({ where: { id: { in: documentIds }, projectProofKey: `${projectId}:warranty` }, data: { warrantyId: warranty.id } });
      }

      if (existing.inventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: existing.inventoryItemId },
          data: {
            condition: existing.executionPath === 'REPLACEMENT' ? 'NEW' : 'GOOD',
            installedOn: existing.executionPath === 'REPLACEMENT' ? actualEndDate : undefined,
            lastServicedOn: actualEndDate,
            modelNumber: data.modelNumber,
            model: data.modelNumber,
            serialNumber: data.serialNumber,
            serialNo: data.serialNumber,
            replacementCostCents: data.actualCostCents,
            warrantyId: warrantyId ?? undefined,
            isVerified: true,
            verificationSource: 'PROJECT_COMPLETION',
          },
        });
      }

      const materialCategories = new Set(['PAINT', 'TILE', 'FLOORING', 'GROUT', 'COUNTERTOP', 'CABINET', 'HARDWARE', 'TRIM_MOLDING', 'WALLPAPER', 'ROOFING', 'SIDING', 'WINDOW', 'DOOR', 'INSULATION']);
      for (const log of existing.progressLogs) {
        const category = materialCategories.has(String(log.materialType).toUpperCase()) ? String(log.materialType).toUpperCase() : 'OTHER';
        const spec = await tx.materialSpec.upsert({
          where: { sourceProgressLogId: log.id },
          create: {
            propertyId,
            roomId: log.roomId,
            projectId,
            sourceProgressLogId: log.id,
            linkedInventoryItemId: existing.inventoryItemId,
            scopeLevel: log.roomId ? 'ROOM' : 'PROPERTY',
            category: category as any,
            label: log.materialType ?? 'Project material',
            manufacturer: log.materialBrand,
            productName: log.materialModel,
            colorCode: log.materialColor,
            supplier: log.materialSupplier,
            quantityPurchased: log.materialQuantity,
            purchaseDate: actualEndDate,
          },
          update: {
            manufacturer: log.materialBrand,
            productName: log.materialModel,
            colorCode: log.materialColor,
            supplier: log.materialSupplier,
            quantityPurchased: log.materialQuantity,
          },
        });
        materialSpecIds.push(spec.id);
      }

      const futureCare = [
        data.nextMaintenanceDate ? { key: 'maintenance', title: `Maintain ${existing.name}`, date: data.nextMaintenanceDate, priority: 'MEDIUM' } : null,
        data.nextInspectionDate ? { key: 'inspection', title: `Inspect ${existing.name}`, date: data.nextInspectionDate, priority: 'HIGH' } : null,
        warrantyExpiresAt ? { key: 'warranty', title: `Review warranty for ${existing.name}`, date: warrantyExpiresAt.toISOString(), priority: 'HIGH' } : null,
        data.replacementHorizonDate ? { key: 'replacement', title: `Plan replacement for ${existing.name}`, date: data.replacementHorizonDate, priority: 'MEDIUM' } : null,
        data.followUpDate ? { key: 'follow-up', title: `Check outcome of ${existing.name}`, date: data.followUpDate, priority: 'HIGH' } : null,
      ].filter(Boolean) as Array<{ key: string; title: string; date: string; priority: string }>;
      for (const care of futureCare) {
        const actionKey = `project:${projectId}:${care.key}`;
        const task = await tx.propertyMaintenanceTask.upsert({
          where: { propertyId_actionKey: { propertyId, actionKey } },
          create: {
            propertyId,
            title: care.title,
            description: `Created from verified completion of ${existing.name}.`,
            source: 'PROJECT_COMPLETION',
            actionKey,
            priority: care.priority as any,
            inventoryItemId: existing.inventoryItemId,
            serviceCategory: existing.serviceCategory,
            nextDueDate: new Date(care.date),
          },
          update: { title: care.title, nextDueDate: new Date(care.date), status: 'PENDING' },
        });
        futureCareTaskIds.push(task.id);
      }

      if (existing.bookingId && existing.contractorProfile?.userId) {
        const ratingValues = [
          data.contractorRatingQuality,
          data.contractorRatingTimeline,
          data.contractorRatingComms,
          data.contractorRatingBudget,
        ].filter((rating): rating is number => typeof rating === 'number');
        const rating = Math.round(ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length);
        const timelinessVarianceDays = existing.expectedEndDate
          ? Math.round((actualEndDate.getTime() - existing.expectedEndDate.getTime()) / 86_400_000)
          : null;
        const review = await tx.review.upsert({
          where: { bookingId: existing.bookingId },
          create: {
            bookingId: existing.bookingId,
            projectId,
            guidanceJourneyId: existing.guidanceJourneyId,
            authorId: userId,
            providerId: existing.contractorProfile.userId,
            rating,
            title: `${existing.name} verified outcome`,
            content: data.contractorReviewText?.trim() || `Verified completion recorded for ${existing.name}.`,
            qualityRating: data.contractorRatingQuality,
            communicationRating: data.contractorRatingComms,
            valueRating: data.contractorRatingBudget,
            professionalismRating: data.contractorRatingTimeline,
            scopeSummary: existing.description ?? existing.name,
            outcomeStatus: data.outcomeStatus,
            verifiedOutcome: true,
            timelinessVarianceDays,
            priceVarianceCents: data.actualCostCents - existing.currentContractAmountCents,
            status: 'PENDING',
          },
          update: {
            projectId,
            guidanceJourneyId: existing.guidanceJourneyId,
            scopeSummary: existing.description ?? existing.name,
            outcomeStatus: data.outcomeStatus,
            verifiedOutcome: true,
            timelinessVarianceDays,
            priceVarianceCents: data.actualCostCents - existing.currentContractAmountCents,
          },
        });
        providerReviewId = review.id;
      }

      await tx.inspectionFinding.updateMany({
        where: { resolvedByProjectId: projectId, status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNotes: `Resolved by verified project: ${project.name}` },
      });
      await tx.projectRecord.update({ where: { id: projectId }, data: { writeBackAppliedAt: new Date() } });
    }

    const writeBackRows = [
      { targetSystem: 'HOME_EVENTS', targetRecordId: event.id, action: verifiedSuccess ? 'CREATED' : 'UPDATED', payload: { outcomeStatus: data.outcomeStatus } },
      ...(documentIds.length ? [{ targetSystem: 'DOCUMENTS', targetRecordId: documentIds[0], action: 'LINKED', payload: { documentIds } }] : []),
      ...(expenseId ? [{ targetSystem: 'EXPENSES', targetRecordId: expenseId, action: 'CREATED', payload: { actualCostCents: data.actualCostCents } }] : []),
      ...(warrantyId ? [{ targetSystem: 'WARRANTIES', targetRecordId: warrantyId, action: 'CREATED', payload: { warrantyExpiresAt } }] : []),
      ...(existing.inventoryItemId && verifiedSuccess ? [{ targetSystem: 'INVENTORY', targetRecordId: existing.inventoryItemId, action: 'UPDATED', payload: { modelNumber: data.modelNumber, serialNumber: data.serialNumber } }] : []),
      ...(materialSpecIds.length ? [{ targetSystem: 'MATERIAL_SPECS', targetRecordId: materialSpecIds[0], action: 'CREATED', payload: { materialSpecIds } }] : []),
      ...(futureCareTaskIds.length ? [{ targetSystem: 'FUTURE_CARE', targetRecordId: futureCareTaskIds[0], action: 'CREATED', payload: { taskIds: futureCareTaskIds } }] : []),
      ...(providerReviewId ? [{ targetSystem: 'PROVIDER_REVIEWS', targetRecordId: providerReviewId, action: 'CREATED', payload: { verifiedOutcome: true, journeyId: existing.guidanceJourneyId } }] : []),
    ];
    for (const row of writeBackRows) {
      const prior = await tx.projectWriteBack.findFirst({
        where: { projectId, targetSystem: row.targetSystem as any, targetRecordId: row.targetRecordId },
      });
      if (!prior) {
        await tx.projectWriteBack.create({
          data: { projectId, targetSystem: row.targetSystem as any, targetRecordId: row.targetRecordId, action: row.action as any, payload: row.payload as any, appliedByUserId: userId },
        });
      }
    }

    return {
      project: await tx.projectRecord.findUniqueOrThrow({ where: { id: projectId } }),
      writeBacks: await tx.projectWriteBack.findMany({ where: { projectId } }),
      homeEventId: event.id,
      documentIds,
      expenseId,
      warrantyId,
      materialSpecIds,
      futureCareTaskIds,
      providerReviewId,
      idempotentReplay: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (verifiedSuccess) {
    const inventoryItemId = result.project.inventoryItemId;
    await JobQueueService.enqueueHomeDigitalTwinRefresh(
      propertyId,
      'Verified project completion updated canonical home facts.',
      inventoryItemId ? { sourceReferenceIds: [inventoryItemId] } : undefined,
    ).catch((err) => logger.error({ err }, '[PROJECT_COMPLETION] Twin refresh enqueue failed'));
    // Home Operations Slice 7: nudge Status Board's separate condition model
    // to recompute on the next read rather than staying stale for up to 24h.
    if (inventoryItemId) {
      await invalidateStatusForInventoryItem(propertyId, inventoryItemId);
    }
  }
  if (verifiedSuccess) {
    await syncJourneyWorkItemForProjectEvent(propertyId, result.project.guidanceJourneyId, projectId, 'VERIFIED', userId);
    await propagateFindingResolutionFromExecution('PROJECT', projectId);
  }
  if (result.futureCareTaskIds?.length) {
    const futureCareTasks = await prisma.propertyMaintenanceTask.findMany({
      where: { id: { in: result.futureCareTaskIds } },
    });
    for (const task of futureCareTasks) {
      await syncFutureCareTaskWorkItem(propertyId, task);
    }
  }
  return result;
}
