import {
  Prisma,
  ProjectRecordStatus,
  ProjectMilestoneStatus,
  ProjectPaymentStatus,
  ProjectChangeOrderStatus,
  ProjectIssueStatus,
  ProjectIssueSeverity,
  ProjectPaymentTriggerType,
  InventoryItemCategory,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { withSerializableDedupe } from './projectCompliance/serializableDedupe';

// ── Guards ────────────────────────────────────────────────────────────────────

async function assertProject(projectId: string, propertyId: string) {
  const project = await prisma.projectRecord.findUnique({
    where: { id: projectId },
    select: { id: true, propertyId: true, status: true, contractAmountCents: true, approvedChangeOrderDeltaCents: true },
  });
  if (!project || project.propertyId !== propertyId) {
    throw new APIError('Project not found', 404, 'NOT_FOUND');
  }
  return project;
}

async function assertMilestone(milestoneId: string, projectId: string) {
  const milestone = await prisma.projectMilestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, projectId: true, status: true, requiresPhotoEvidence: true, milestoneType: true },
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
    select: { id: true, projectId: true, status: true, costDeltaCents: true },
  });
  if (!co || co.projectId !== projectId) {
    throw new APIError('Change order not found', 404, 'NOT_FOUND');
  }
  return co;
}

async function assertIssue(issueId: string, projectId: string) {
  const issue = await prisma.projectIssue.findUnique({
    where: { id: issueId },
    select: { id: true, projectId: true, status: true, severity: true, blocksPayment: true },
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
  const sourceConflict = projectData.priceFinalizationId
    ? { priceFinalizationId: projectData.priceFinalizationId }
    : projectData.bookingId
      ? { bookingId: projectData.bookingId }
      : null;
  const project = await withSerializableDedupe(async (tx) => {
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
        priceFinalizationId: projectData.priceFinalizationId,
        bookingId: projectData.bookingId,
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

export async function updateProject(projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);
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
    },
  });
}

export async function cancelProject(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectRecord.update({
    where: { id: projectId },
    data: { status: 'CANCELLED' },
  });
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
  await assertMilestone(milestoneId, projectId);

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
  await assertMilestone(milestoneId, projectId);
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

export async function listChangeOrders(projectId: string, propertyId: string) {
  await assertProject(projectId, propertyId);
  return prisma.projectChangeOrder.findMany({
    where: { projectId },
    orderBy: { changeNumber: 'asc' },
  });
}

export async function createChangeOrder(projectId: string, propertyId: string, data: any) {
  await assertProject(projectId, propertyId);

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

  const updated = await prisma.projectChangeOrder.update({
    where: { id: changeOrderId },
    data: { status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() },
  });

  await recalcProjectTotals(projectId);
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
  await assertIssue(issueId, projectId);

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
  await assertProject(projectId, propertyId);

  const [
    permitMilestones,
    disputedMilestones,
    openBlockingOrMajorIssues,
    payments,
    photoCount,
  ] = await Promise.all([
    prisma.projectMilestone.findMany({
      where: { projectId, milestoneType: 'PERMIT_INSPECTION' },
      select: { id: true, name: true, status: true },
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

  const unpassed = permitMilestones.filter(m => m.status !== 'COMPLETE');
  const lastPayment = payments[0];
  const finalPaymentPaid = lastPayment?.status === 'PAID';

  const checks = [
    {
      key: 'permit_inspections_passed',
      label: 'All permit inspections passed',
      passed: unpassed.length === 0,
      blockers: unpassed.map(m => m.name),
    },
    {
      key: 'no_disputed_milestones',
      label: 'No milestones in disputed status',
      passed: disputedMilestones === 0,
      blockers: disputedMilestones > 0 ? [`${disputedMilestones} disputed milestone(s)`] : [],
    },
    {
      key: 'no_open_blocking_issues',
      label: 'No open blocking or major issues',
      passed: openBlockingOrMajorIssues.length === 0,
      blockers: openBlockingOrMajorIssues.map(i => i.title),
    },
    {
      key: 'final_payment_paid',
      label: 'Final payment marked paid',
      passed: finalPaymentPaid,
      blockers: !finalPaymentPaid && lastPayment ? [`Payment "${lastPayment.description}" is not paid`] : [],
    },
    {
      key: 'progress_photos_logged',
      label: 'At least one progress photo logged',
      passed: photoCount > 0,
      blockers: photoCount === 0 ? ['No progress photos have been logged'] : [],
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return { checks, allPassed };
}

export async function confirmCompletion(projectId: string, propertyId: string, userId: string, data: any) {
  const { checks, allPassed } = await getCompletionChecklist(projectId, propertyId);
  if (!allPassed) {
    const failed = checks.filter(c => !c.passed).map(c => c.label);
    throw new APIError(
      `Cannot complete project — unresolved items: ${failed.join('; ')}`,
      400, 'CHECKLIST_INCOMPLETE',
    );
  }

  const actualEndDate = data.actualEndDate ? new Date(data.actualEndDate) : new Date();
  const warrantyExpiresAt = data.warrantyPeriodMonths
    ? new Date(actualEndDate.getTime() + data.warrantyPeriodMonths * 30 * 24 * 60 * 60 * 1000)
    : undefined;

  const project = await prisma.projectRecord.update({
    where: { id: projectId },
    data: {
      status: 'COMPLETED',
      actualEndDate,
      contractorRatingQuality: data.contractorRatingQuality,
      contractorRatingTimeline: data.contractorRatingTimeline,
      contractorRatingComms: data.contractorRatingComms,
      contractorRatingBudget: data.contractorRatingBudget,
      contractorReviewText: data.contractorReviewText,
      warrantyPeriodMonths: data.warrantyPeriodMonths,
      warrantyExpiresAt,
      warrantyDocumentKey: data.warrantyDocumentKey,
      completionRecordKey: data.completionRecordKey,
      writeBackAppliedAt: new Date(),
    },
  });

  // Stub write-back audit entries — real integration happens per-system
  await prisma.projectWriteBack.createMany({
    data: [
      { projectId, targetSystem: 'HOME_TIMELINE', action: 'CREATED', payload: { projectName: project.name }, appliedByUserId: userId },
      { projectId, targetSystem: 'HOME_EVENTS', action: 'CREATED', payload: { projectName: project.name }, appliedByUserId: userId },
      { projectId, targetSystem: 'MATERIAL_SPECS', action: 'LINKED', payload: { note: 'material delivery entries transferred' }, appliedByUserId: userId },
      { projectId, targetSystem: 'VAULT', action: 'LINKED', payload: { note: 'completion record added to disclosure vault' }, appliedByUserId: userId },
    ],
  });

  // Mark any linked inspection findings as resolved
  await prisma.inspectionFinding.updateMany({
    where: { resolvedByProjectId: projectId, status: { not: 'RESOLVED' } },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNotes: `Resolved by project: ${project.name}` },
  });

  return { project, writeBacks: await prisma.projectWriteBack.findMany({ where: { projectId } }) };
}
