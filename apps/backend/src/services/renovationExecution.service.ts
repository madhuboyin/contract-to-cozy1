import {
  PermitInspectionStatus,
  Prisma,
  ProjectMilestoneStatus,
  RenovationComplianceConditionStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export function projectStatusForPermitInspection(
  status: PermitInspectionStatus,
): ProjectMilestoneStatus {
  switch (status) {
    case 'PASSED':
    case 'CANCELLED':
      return 'COMPLETE';
    case 'FAILED':
    case 'PARTIAL':
      return 'BLOCKED';
    case 'SCHEDULED':
      return 'IN_PROGRESS';
    default:
      return 'UPCOMING';
  }
}

export function projectStatusForComplianceCondition(
  status: RenovationComplianceConditionStatus,
  isBlocking: boolean,
): ProjectMilestoneStatus {
  if (status === 'SATISFIED' || status === 'WAIVED_WITH_ACKNOWLEDGMENT') return 'COMPLETE';
  if (isBlocking || status === 'EXPIRED') return 'BLOCKED';
  return 'UPCOMING';
}

async function assertExecutionProject(projectId: string, propertyId: string) {
  const project = await prisma.projectRecord.findFirst({
    where: { id: projectId, propertyId },
    select: { id: true, propertyId: true, renovationCaseId: true },
  });
  if (!project) throw new APIError('Project not found', 404, 'NOT_FOUND');
  return project;
}

function sourceWhere(projectId: string, renovationCaseId: string | null) {
  return {
    OR: [
      { sourceEntityType: 'PROJECT', sourceEntityId: projectId },
      ...(renovationCaseId
        ? [{ sourceEntityType: 'RENOVATION_CASE', sourceEntityId: renovationCaseId }]
        : []),
    ],
  };
}

async function recordOperationalAlert(input: {
  propertyId: string;
  sourceType: string;
  sourceId: string;
  sourceStatus: string;
  sourceVersion: Date;
  title: string;
  summary: string;
  meta: Record<string, unknown>;
}) {
  await prisma.homeEvent.create({
    data: {
      propertyId: input.propertyId,
      title: input.title,
      summary: input.summary,
      type: 'MAINTENANCE',
      subtype: 'RENOVATION_EXECUTION_BLOCKER',
      importance: 'HIGH',
      visibility: 'PRIVATE',
      occurredAt: new Date(),
      idempotencyKey: `renovation-execution:${input.sourceType}:${input.sourceId}:${input.sourceStatus}:${input.sourceVersion.toISOString()}`,
      meta: input.meta as Prisma.InputJsonValue,
    },
  }).catch(() => {
    // The idempotency key intentionally makes repeated reconciliation silent.
  });
}

export async function reconcileProjectExecution(projectId: string, propertyId: string) {
  const project = await assertExecutionProject(projectId, propertyId);
  const [permits, conditions, maxPosition] = await Promise.all([
    prisma.propertyPermitRecord.findMany({
      where: {
        propertyId,
        isActive: true,
        ...sourceWhere(projectId, project.renovationCaseId),
      },
      select: {
        id: true,
        permitNumber: true,
        status: true,
        updatedAt: true,
        inspectionMilestones: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            stageName: true,
            status: true,
            scheduledDate: true,
            inspectedDate: true,
            inspectorNotes: true,
            isRequired: true,
            updatedAt: true,
          },
        },
      },
    }),
    project.renovationCaseId
      ? prisma.renovationComplianceCondition.findMany({
          where: {
            renovationCaseId: project.renovationCaseId,
            propertyId,
            subjectType: 'HOA_APPROVAL',
          },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.projectMilestone.aggregate({
      where: { projectId },
      _max: { position: true },
    }),
  ]);

  let nextPosition = (maxPosition._max.position ?? -1) + 1;
  const reconciled: Array<{ sourceType: string; sourceId: string; status: string }> = [];

  for (const permit of permits) {
    const correctionIsBlocking = permit.status === 'CORRECTION_REQUESTED'
      || permit.status === 'INSPECTION_FAILED';
    const priorCorrectionProjection = await prisma.projectMilestone.findUnique({
      where: {
        projectId_executionSourceType_executionSourceId: {
          projectId,
          executionSourceType: 'PERMIT_CORRECTION',
          executionSourceId: permit.id,
        },
      },
      select: { id: true },
    });
    if (correctionIsBlocking || priorCorrectionProjection) {
      const correctionStatus: ProjectMilestoneStatus = correctionIsBlocking ? 'BLOCKED' : 'COMPLETE';
      await prisma.projectMilestone.upsert({
        where: {
          projectId_executionSourceType_executionSourceId: {
            projectId,
            executionSourceType: 'PERMIT_CORRECTION',
            executionSourceId: permit.id,
          },
        },
        create: {
          projectId,
          propertyId,
          position: nextPosition++,
          name: `Clear permit correction${permit.permitNumber ? ` · ${permit.permitNumber}` : ''}`,
          description: 'Read-only projection of the issuing authority permit status.',
          milestoneType: 'PERMIT_INSPECTION',
          status: correctionStatus,
          executionSourceType: 'PERMIT_CORRECTION',
          executionSourceId: permit.id,
          sourceStatus: permit.status,
          sourceUpdatedAt: permit.updatedAt,
          lastReconciledAt: new Date(),
          reconciliationStatus: 'HEALTHY',
          reconciliationAttempts: 1,
        },
        update: {
          status: correctionStatus,
          sourceStatus: permit.status,
          sourceUpdatedAt: permit.updatedAt,
          lastReconciledAt: new Date(),
          actualCompletedDate: correctionIsBlocking ? null : new Date(),
          reconciliationStatus: 'HEALTHY',
          reconciliationAttempts: { increment: 1 },
          reconciliationError: null,
        },
      });
      if (correctionIsBlocking) {
        await prisma.projectIssue.upsert({
          where: {
            projectId_sourceEntityType_sourceEntityId: {
              projectId,
              sourceEntityType: 'PERMIT_CORRECTION',
              sourceEntityId: permit.id,
            },
          },
          create: {
            projectId,
            title: `Permit correction blocks work${permit.permitNumber ? ` · ${permit.permitNumber}` : ''}`,
            description: 'The issuing authority reports a correction or failed inspection. Record the correction response and updated authority status in Permit Tracker.',
            severity: 'BLOCKING',
            category: 'OTHER',
            status: 'OPEN',
            blocksPayment: true,
            attachmentKeys: [],
            responsibleParty: 'CONTRACTOR',
            sourceEntityType: 'PERMIT_CORRECTION',
            sourceEntityId: permit.id,
          },
          update: {
            status: 'OPEN',
            resolutionNotes: null,
            resolvedAt: null,
            resolvedByUserId: null,
          },
        });
        await recordOperationalAlert({
          propertyId,
          sourceType: 'PERMIT_CORRECTION',
          sourceId: permit.id,
          sourceStatus: permit.status,
          sourceVersion: permit.updatedAt,
          title: 'Permit correction is blocking project work',
          summary: 'Respond to the correction in Permit Tracker before continuing affected work.',
          meta: { projectId, permitRecordId: permit.id },
        });
      } else {
        await prisma.projectIssue.updateMany({
          where: {
            projectId,
            sourceEntityType: 'PERMIT_CORRECTION',
            sourceEntityId: permit.id,
            status: { not: 'RESOLVED' },
          },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            resolutionNotes: `Resolved from authoritative Permit Tracker status: ${permit.status}.`,
          },
        });
      }
      reconciled.push({
        sourceType: 'PERMIT_CORRECTION',
        sourceId: permit.id,
        status: correctionStatus,
      });
    }

    for (const inspection of permit.inspectionMilestones) {
      const status = projectStatusForPermitInspection(inspection.status);
      const milestone = await prisma.projectMilestone.upsert({
        where: {
          projectId_executionSourceType_executionSourceId: {
            projectId,
            executionSourceType: 'PERMIT_INSPECTION',
            executionSourceId: inspection.id,
          },
        },
        create: {
          projectId,
          propertyId,
          position: nextPosition++,
          name: `${inspection.stageName} inspection`,
          description: `Read-only projection from Permit Tracker${permit.permitNumber ? ` · ${permit.permitNumber}` : ''}.`,
          milestoneType: 'PERMIT_INSPECTION',
          status,
          scheduledDate: inspection.scheduledDate,
          actualCompletedDate: status === 'COMPLETE' ? inspection.inspectedDate : null,
          linkedPermitMilestoneId: inspection.id,
          executionSourceType: 'PERMIT_INSPECTION',
          executionSourceId: inspection.id,
          sourceStatus: inspection.status,
          sourceUpdatedAt: inspection.updatedAt,
          lastReconciledAt: new Date(),
          reconciliationStatus: 'HEALTHY',
          reconciliationAttempts: 1,
        },
        update: {
          name: `${inspection.stageName} inspection`,
          status,
          scheduledDate: inspection.scheduledDate,
          actualCompletedDate: status === 'COMPLETE' ? inspection.inspectedDate : null,
          completionNotes: status === 'COMPLETE' ? inspection.inspectorNotes : null,
          linkedPermitMilestoneId: inspection.id,
          sourceStatus: inspection.status,
          sourceUpdatedAt: inspection.updatedAt,
          lastReconciledAt: new Date(),
          reconciliationStatus: 'HEALTHY',
          reconciliationAttempts: { increment: 1 },
          reconciliationError: null,
        },
      });

      if (inspection.status === 'FAILED' || inspection.status === 'PARTIAL') {
        await prisma.projectIssue.upsert({
          where: {
            projectId_sourceEntityType_sourceEntityId: {
              projectId,
              sourceEntityType: 'PERMIT_INSPECTION',
              sourceEntityId: inspection.id,
            },
          },
          create: {
            projectId,
            title: `${inspection.stageName} inspection needs correction`,
            description: inspection.inspectorNotes
              ?? 'The Permit Tracker inspection is not passed. Correct the cited work and record the authority result in Permit Tracker.',
            severity: 'BLOCKING',
            category: 'OTHER',
            status: 'OPEN',
            blocksPayment: true,
            attachmentKeys: [],
            responsibleParty: 'CONTRACTOR',
            sourceEntityType: 'PERMIT_INSPECTION',
            sourceEntityId: inspection.id,
          },
          update: {
            title: `${inspection.stageName} inspection needs correction`,
            description: inspection.inspectorNotes
              ?? 'The Permit Tracker inspection is not passed. Correct the cited work and record the authority result in Permit Tracker.',
            severity: 'BLOCKING',
            status: 'OPEN',
            blocksPayment: true,
            resolutionNotes: null,
            resolvedAt: null,
            resolvedByUserId: null,
          },
        });
        await prisma.projectPayment.updateMany({
          where: { projectId, status: { in: ['PENDING', 'DUE', 'OVERDUE'] } },
          data: { status: 'ON_HOLD' },
        });
        await recordOperationalAlert({
          propertyId,
          sourceType: 'PERMIT_INSPECTION',
          sourceId: inspection.id,
          sourceStatus: inspection.status,
          sourceVersion: inspection.updatedAt,
          title: `${inspection.stageName} inspection is blocking work`,
          summary: 'The failed or partial inspection remains open until Permit Tracker records a passed result.',
          meta: { projectId, permitRecordId: permit.id, projectMilestoneId: milestone.id },
        });
      } else if (inspection.status === 'PASSED' || inspection.status === 'CANCELLED') {
        await prisma.projectIssue.updateMany({
          where: {
            projectId,
            sourceEntityType: 'PERMIT_INSPECTION',
            sourceEntityId: inspection.id,
            status: { not: 'RESOLVED' },
          },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            resolutionNotes: `Resolved from authoritative Permit Tracker status: ${inspection.status}.`,
          },
        });
      }
      reconciled.push({ sourceType: 'PERMIT_INSPECTION', sourceId: inspection.id, status });
    }
  }

  for (const condition of conditions) {
    const status = projectStatusForComplianceCondition(condition.status, condition.isBlocking);
    await prisma.projectMilestone.upsert({
      where: {
        projectId_executionSourceType_executionSourceId: {
          projectId,
          executionSourceType: 'HOA_CONDITION',
          executionSourceId: condition.id,
        },
      },
      create: {
        projectId,
        propertyId,
        position: nextPosition++,
        name: condition.title,
        description: `${condition.description}\n\nRead-only projection from HOA compliance conditions.`,
        milestoneType: 'CUSTOM',
        status,
        scheduledDate: condition.dueAt,
        actualCompletedDate: status === 'COMPLETE' ? condition.satisfiedAt : null,
        executionSourceType: 'HOA_CONDITION',
        executionSourceId: condition.id,
        sourceStatus: condition.status,
        sourceUpdatedAt: condition.updatedAt,
        lastReconciledAt: new Date(),
        reconciliationStatus: 'HEALTHY',
        reconciliationAttempts: 1,
      },
      update: {
        name: condition.title,
        description: `${condition.description}\n\nRead-only projection from HOA compliance conditions.`,
        status,
        scheduledDate: condition.dueAt,
        actualCompletedDate: status === 'COMPLETE' ? condition.satisfiedAt : null,
        sourceStatus: condition.status,
        sourceUpdatedAt: condition.updatedAt,
        lastReconciledAt: new Date(),
        reconciliationStatus: 'HEALTHY',
        reconciliationAttempts: { increment: 1 },
        reconciliationError: null,
      },
    });

    if (status === 'BLOCKED') {
      await prisma.projectIssue.upsert({
        where: {
          projectId_sourceEntityType_sourceEntityId: {
            projectId,
            sourceEntityType: 'HOA_CONDITION',
            sourceEntityId: condition.id,
          },
        },
        create: {
          projectId,
          title: condition.title,
          description: condition.description,
          severity: 'BLOCKING',
          category: 'OTHER',
          status: 'OPEN',
          blocksPayment: true,
          attachmentKeys: [],
          evidenceDocumentIds: condition.sourceDocumentId ? [condition.sourceDocumentId] : [],
          responsibleParty: condition.ownerUserId ? 'HOUSEHOLD' : 'SHARED',
          sourceEntityType: 'HOA_CONDITION',
          sourceEntityId: condition.id,
        },
        update: {
          description: condition.description,
          status: 'OPEN',
          resolutionNotes: null,
          resolvedAt: null,
          resolvedByUserId: null,
        },
      });
      await recordOperationalAlert({
        propertyId,
        sourceType: 'HOA_CONDITION',
        sourceId: condition.id,
        sourceStatus: condition.status,
        sourceVersion: condition.updatedAt,
        title: `${condition.title} is blocking work`,
        summary: condition.description,
        meta: { projectId, renovationCaseId: project.renovationCaseId, dueAt: condition.dueAt },
      });
    } else if (status === 'COMPLETE') {
      await prisma.projectIssue.updateMany({
        where: {
          projectId,
          sourceEntityType: 'HOA_CONDITION',
          sourceEntityId: condition.id,
          status: { not: 'RESOLVED' },
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionNotes: `Resolved from renovation compliance condition status: ${condition.status}.`,
        },
      });
    }
    reconciled.push({ sourceType: 'HOA_CONDITION', sourceId: condition.id, status });
  }

  const remainingPaymentBlockers = await prisma.projectIssue.count({
    where: { projectId, severity: 'BLOCKING', status: { not: 'RESOLVED' } },
  });
  if (remainingPaymentBlockers === 0) {
    await prisma.projectPayment.updateMany({
      where: { projectId, status: 'ON_HOLD' },
      data: { status: 'PENDING' },
    });
  }

  return {
    projectId,
    renovationCaseId: project.renovationCaseId,
    reconciledAt: new Date().toISOString(),
    projections: reconciled,
    authority: {
      permitInspections: 'PERMIT_TRACKER',
      hoaConditions: 'RENOVATION_CASE',
      projectTimeline: 'READ_ONLY_PROJECTION',
    },
  };
}

export async function getProjectExecutionAlignment(projectId: string, propertyId: string) {
  const project = await assertExecutionProject(projectId, propertyId);
  const projections = await prisma.projectMilestone.findMany({
    where: { projectId, executionSourceType: { not: 'MANUAL' } },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      scheduledDate: true,
      executionSourceType: true,
      executionSourceId: true,
      sourceStatus: true,
      sourceUpdatedAt: true,
      lastReconciledAt: true,
      reconciliationStatus: true,
      reconciliationAttempts: true,
      reconciliationError: true,
      linkedPermitMilestoneId: true,
    },
  });
  return {
    projectId,
    renovationCaseId: project.renovationCaseId,
    projections,
    hasErrors: projections.some((item) => item.reconciliationStatus === 'ERROR'),
    authorities: {
      PERMIT_CORRECTION: 'Permit Tracker',
      PERMIT_INSPECTION: 'Permit Tracker',
      HOA_CONDITION: 'Renovation case compliance',
    },
  };
}

export async function reconcileProjectsForPermitRecord(permitRecordId: string, propertyId: string) {
  const permit = await prisma.propertyPermitRecord.findFirst({
    where: { id: permitRecordId, propertyId },
    select: { sourceEntityType: true, sourceEntityId: true },
  });
  if (!permit?.sourceEntityId) return [];

  const projects = permit.sourceEntityType === 'PROJECT'
    ? await prisma.projectRecord.findMany({
        where: { id: permit.sourceEntityId, propertyId },
        select: { id: true },
      })
    : permit.sourceEntityType === 'RENOVATION_CASE'
      ? await prisma.projectRecord.findMany({
          where: { renovationCaseId: permit.sourceEntityId, propertyId },
          select: { id: true },
        })
      : [];

  return Promise.all(projects.map((project) => reconcileProjectExecution(project.id, propertyId)));
}

export async function reconcileProjectsForRenovationCase(
  renovationCaseId: string,
  propertyId: string,
) {
  const projects = await prisma.projectRecord.findMany({
    where: { renovationCaseId, propertyId },
    select: { id: true },
  });
  return Promise.all(projects.map((project) => reconcileProjectExecution(project.id, propertyId)));
}

export async function markProjectsForRenovationCaseReconciliationError(
  renovationCaseId: string,
  propertyId: string,
  error: unknown,
) {
  const projects = await prisma.projectRecord.findMany({
    where: { renovationCaseId, propertyId },
    select: { id: true },
  });
  await Promise.all(projects.map(project =>
    markProjectExecutionReconciliationError(project.id, propertyId, error)));
}

export async function markProjectExecutionReconciliationError(
  projectId: string,
  propertyId: string,
  error: unknown,
) {
  await assertExecutionProject(projectId, propertyId);
  const message = error instanceof Error ? error.message : 'Unknown reconciliation failure';
  await prisma.projectMilestone.updateMany({
    where: { projectId, executionSourceType: { not: 'MANUAL' } },
    data: {
      reconciliationStatus: 'ERROR',
      reconciliationAttempts: { increment: 1 },
      reconciliationError: message.slice(0, 4000),
    },
  });
}

export async function markProjectsForPermitRecordReconciliationError(
  permitRecordId: string,
  propertyId: string,
  error: unknown,
) {
  const permit = await prisma.propertyPermitRecord.findFirst({
    where: { id: permitRecordId, propertyId },
    select: { sourceEntityType: true, sourceEntityId: true },
  });
  if (!permit?.sourceEntityId) return;
  const projects = permit.sourceEntityType === 'PROJECT'
    ? await prisma.projectRecord.findMany({
        where: { id: permit.sourceEntityId, propertyId },
        select: { id: true },
      })
    : permit.sourceEntityType === 'RENOVATION_CASE'
      ? await prisma.projectRecord.findMany({
          where: { renovationCaseId: permit.sourceEntityId, propertyId },
          select: { id: true },
        })
      : [];
  await Promise.all(projects.map(project =>
    markProjectExecutionReconciliationError(project.id, propertyId, error)));
}
