import {
  Prisma,
  RenovationCaseEventType,
  RenovationCaseLifecycle,
  RenovationCaseLinkType,
} from '@prisma/client';
import { prisma } from '../config/database';
import { APIError } from '../middleware/error.middleware';
import { resolvePropertyAccess } from './propertyAccess.service';
import {
  canTransitionRenovationCase,
  diffRenovationScope,
  type ScopeSnapshot,
} from './renovationCase/lifecyclePolicy';

const detailInclude = {
  currentScopeVersion: true,
  scopeVersions: { orderBy: { version: 'desc' as const } },
  participants: { where: { isActive: true }, orderBy: { addedAt: 'asc' as const } },
  links: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.RenovationCaseInclude;

function asDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : value;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function assertCase(propertyId: string, renovationCaseId: string, includeArchived = false) {
  const renovationCase = await prisma.renovationCase.findFirst({
    where: {
      id: renovationCaseId,
      propertyId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
  });
  if (!renovationCase) {
    throw new APIError('Renovation case not found.', 404, 'RENOVATION_CASE_NOT_FOUND');
  }
  return renovationCase;
}

async function appendEvent(
  tx: Prisma.TransactionClient,
  input: {
    renovationCaseId: string;
    propertyId: string;
    actorUserId: string;
    eventType: RenovationCaseEventType;
    idempotencyKey?: string;
    fromLifecycle?: RenovationCaseLifecycle;
    toLifecycle?: RenovationCaseLifecycle;
    scopeVersionId?: string;
    payload?: unknown;
  },
) {
  return tx.renovationCaseEvent.create({
    data: {
      renovationCaseId: input.renovationCaseId,
      propertyId: input.propertyId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      fromLifecycle: input.fromLifecycle,
      toLifecycle: input.toLifecycle,
      scopeVersionId: input.scopeVersionId,
      ...(input.payload !== undefined && { payload: json(input.payload) }),
    },
  });
}

export async function listRenovationCases(propertyId: string, includeArchived = false) {
  return prisma.renovationCase.findMany({
    where: { propertyId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: { currentScopeVersion: true, _count: { select: { links: true, participants: true } } },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getRenovationCase(propertyId: string, renovationCaseId: string) {
  const renovationCase = await prisma.renovationCase.findFirst({
    where: { id: renovationCaseId, propertyId },
    include: detailInclude,
  });
  if (!renovationCase) {
    throw new APIError('Renovation case not found.', 404, 'RENOVATION_CASE_NOT_FOUND');
  }
  return renovationCase;
}

export async function createRenovationCase(propertyId: string, actorUserId: string, data: any) {
  if (data.idempotencyKey) {
    const existing = await prisma.renovationCase.findUnique({
      where: { propertyId_idempotencyKey: { propertyId, idempotencyKey: data.idempotencyKey } },
      include: detailInclude,
    });
    if (existing) return existing;
  }
  const initialScopeDocumentIds = data.initialScope
    ? [...data.initialScope.drawingDocumentIds, ...data.initialScope.specificationDocumentIds]
    : [];
  await assertDocumentsInProperty(propertyId, initialScopeDocumentIds);

  const created = await prisma.$transaction(async (tx) => {
    const renovationCase = await tx.renovationCase.create({
      data: {
        propertyId,
        createdByUserId: actorUserId,
        idempotencyKey: data.idempotencyKey,
        name: data.name,
        objective: data.objective,
        caseType: data.caseType,
        governanceTier: data.governanceTier,
        responsibilityContext: data.responsibilityContext,
        spacesAffected: data.spacesAffected,
        systemsAffected: data.systemsAffected,
        targetBudgetCents: data.targetBudgetCents,
        targetStartDate: asDate(data.targetStartDate),
        targetEndDate: asDate(data.targetEndDate),
        entryPoint: data.entryPoint,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
      },
    });
    const initialScope = data.initialScope ?? {
      workItems: [],
      spacesAffected: data.spacesAffected,
      systemsAffected: data.systemsAffected,
      structuralEffects: false,
      exteriorEffects: false,
      drawingDocumentIds: [],
      specificationDocumentIds: [],
      approvalStatus: 'DRAFT',
    };
    const scope = await tx.renovationScopeVersion.create({
      data: {
        renovationCaseId: renovationCase.id,
        createdByUserId: actorUserId,
        version: 1,
        changeReason: 'Initial accepted renovation scope',
        summary: initialScope.summary,
        workItems: json(initialScope.workItems),
        spacesAffected: initialScope.spacesAffected,
        systemsAffected: initialScope.systemsAffected,
        intendedUse: initialScope.intendedUse,
        ...(initialScope.dimensions !== undefined && { dimensions: json(initialScope.dimensions) }),
        structuralEffects: initialScope.structuralEffects,
        exteriorEffects: initialScope.exteriorEffects,
        drawingDocumentIds: initialScope.drawingDocumentIds,
        specificationDocumentIds: initialScope.specificationDocumentIds,
        estimatedCostCents: initialScope.estimatedCostCents,
        contractCostCents: initialScope.contractCostCents,
        approvalStatus: initialScope.approvalStatus,
      },
    });
    await tx.renovationCase.update({
      where: { id: renovationCase.id },
      data: { currentScopeVersionId: scope.id },
    });
    await tx.renovationCaseParticipant.create({
      data: {
        renovationCaseId: renovationCase.id,
        userId: actorUserId,
        role: 'OWNER',
      },
    });
    await appendEvent(tx, {
      renovationCaseId: renovationCase.id,
      propertyId,
      actorUserId,
      eventType: 'CASE_CREATED',
      idempotencyKey: data.idempotencyKey ? `create:${data.idempotencyKey}` : undefined,
      scopeVersionId: scope.id,
      toLifecycle: renovationCase.lifecycle,
      payload: { caseType: renovationCase.caseType, scopeVersion: 1 },
    });
    return renovationCase.id;
  });

  return getRenovationCase(propertyId, created);
}

export async function updateRenovationCase(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  data: any,
) {
  const existing = await assertCase(propertyId, renovationCaseId);
  const updatedFields = Object.keys(data);
  await prisma.$transaction(async (tx) => {
    await tx.renovationCase.update({
      where: { id: renovationCaseId },
      data: {
        ...data,
        ...(data.targetStartDate !== undefined && { targetStartDate: asDate(data.targetStartDate) }),
        ...(data.targetEndDate !== undefined && { targetEndDate: asDate(data.targetEndDate) }),
        ...(data.readinessSummary !== undefined && {
          readinessSummary: data.readinessSummary === null ? Prisma.JsonNull : json(data.readinessSummary),
        }),
      },
    });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'CASE_UPDATED',
      fromLifecycle: existing.lifecycle,
      toLifecycle: existing.lifecycle,
      payload: { updatedFields },
    });
  });
  return getRenovationCase(propertyId, renovationCaseId);
}

export async function transitionRenovationCase(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  data: {
    lifecycle: RenovationCaseLifecycle;
    reason: string;
    resumeLifecycle?: RenovationCaseLifecycle;
    idempotencyKey?: string;
  },
) {
  const existing = await assertCase(propertyId, renovationCaseId);
  if (data.idempotencyKey) {
    const prior = await prisma.renovationCaseEvent.findUnique({
      where: {
        renovationCaseId_idempotencyKey: {
          renovationCaseId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (prior) return getRenovationCase(propertyId, renovationCaseId);
  }
  if (!canTransitionRenovationCase(existing.lifecycle, data.lifecycle, data.resumeLifecycle)) {
    throw new APIError(
      `Cannot transition renovation case from ${existing.lifecycle} to ${data.lifecycle}.`,
      409,
      'RENOVATION_CASE_INVALID_TRANSITION',
      { current: existing.lifecycle, requested: data.lifecycle },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.renovationCase.update({
      where: { id: renovationCaseId },
      data: {
        lifecycle: data.lifecycle,
        ...(data.lifecycle === 'CANCELLED' && {
          outcomeStatus: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: data.reason,
        }),
        ...(data.lifecycle === 'VERIFIED_COMPLETE' && { outcomeStatus: 'VERIFIED_SUCCESS' }),
        ...(data.lifecycle === 'COMPLETED_WITH_OPEN_ITEMS' && {
          outcomeStatus: 'COMPLETED_WITH_OPEN_ITEMS',
        }),
      },
    });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'LIFECYCLE_CHANGED',
      idempotencyKey: data.idempotencyKey,
      fromLifecycle: existing.lifecycle,
      toLifecycle: data.lifecycle,
      payload: { reason: data.reason, resumeLifecycle: data.resumeLifecycle ?? null },
    });
  });
  return getRenovationCase(propertyId, renovationCaseId);
}

function scopeSnapshot(scope: any): ScopeSnapshot {
  return {
    summary: scope.summary,
    workItems: scope.workItems,
    spacesAffected: scope.spacesAffected,
    systemsAffected: scope.systemsAffected,
    intendedUse: scope.intendedUse,
    dimensions: scope.dimensions,
    structuralEffects: scope.structuralEffects,
    exteriorEffects: scope.exteriorEffects,
    drawingDocumentIds: scope.drawingDocumentIds,
    specificationDocumentIds: scope.specificationDocumentIds,
    estimatedCostCents: scope.estimatedCostCents,
    contractCostCents: scope.contractCostCents,
    approvalStatus: scope.approvalStatus,
  };
}

async function assertDocumentsInProperty(propertyId: string, documentIds: string[]) {
  const uniqueIds = [...new Set(documentIds)];
  if (uniqueIds.length === 0) return;
  const count = await prisma.document.count({ where: { id: { in: uniqueIds }, propertyId } });
  if (count !== uniqueIds.length) {
    throw new APIError(
      'Every scope document must belong to the same property.',
      409,
      'RENOVATION_SCOPE_DOCUMENT_MISMATCH',
    );
  }
}

export async function createScopeVersion(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  data: any,
) {
  const renovationCase = await assertCase(propertyId, renovationCaseId);
  if (data.idempotencyKey) {
    const existingScope = await prisma.renovationScopeVersion.findUnique({
      where: {
        renovationCaseId_idempotencyKey: {
          renovationCaseId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (existingScope) return getRenovationCase(propertyId, renovationCaseId);
  }
  const previous = renovationCase.currentScopeVersionId
    ? await prisma.renovationScopeVersion.findFirst({
      where: { id: renovationCase.currentScopeVersionId, renovationCaseId },
    })
    : null;
  if (!previous) {
    throw new APIError('Current renovation scope is missing.', 409, 'RENOVATION_SCOPE_MISSING');
  }
  await assertDocumentsInProperty(
    propertyId,
    [...data.drawingDocumentIds, ...data.specificationDocumentIds],
  );
  const comparison = diffRenovationScope(scopeSnapshot(previous), scopeSnapshot(data));

  await prisma.$transaction(async (tx) => {
    const latest = await tx.renovationScopeVersion.findFirst({
      where: { renovationCaseId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const scope = await tx.renovationScopeVersion.create({
      data: {
        renovationCaseId,
        createdByUserId: actorUserId,
        idempotencyKey: data.idempotencyKey,
        version: (latest?.version ?? 0) + 1,
        effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : new Date(),
        changeReason: data.changeReason,
        summary: data.summary,
        workItems: json(data.workItems),
        spacesAffected: data.spacesAffected,
        systemsAffected: data.systemsAffected,
        intendedUse: data.intendedUse,
        ...(data.dimensions !== undefined && { dimensions: json(data.dimensions) }),
        structuralEffects: data.structuralEffects,
        exteriorEffects: data.exteriorEffects,
        drawingDocumentIds: data.drawingDocumentIds,
        specificationDocumentIds: data.specificationDocumentIds,
        estimatedCostCents: data.estimatedCostCents,
        contractCostCents: data.contractCostCents,
        approvalStatus: data.approvalStatus,
        comparisonToPrior: json(comparison),
        downstreamInvalidation: json({
          ...comparison,
          invalidatedAt: new Date().toISOString(),
          priorScopeVersionId: previous.id,
        }),
      },
    });
    if (data.approvalStatus === 'APPROVED' && previous.approvalStatus === 'APPROVED') {
      await tx.renovationScopeVersion.update({
        where: { id: previous.id },
        data: { approvalStatus: 'SUPERSEDED' },
      });
    }
    if (comparison.invalidates.includes('REQUIREMENTS')) {
      const invalidatedRequirements = await tx.renovationRequirement.findMany({
        where: { renovationCaseId, recordStatus: 'CURRENT' },
        select: { id: true, applicability: true, determination: true, truthLayer: true },
      });
      await tx.renovationRequirement.updateMany({
        where: { renovationCaseId, recordStatus: 'CURRENT' },
        data: { recordStatus: 'STALE_SCOPE' },
      });
      await tx.renovationAuthorityProfile.updateMany({
        where: { renovationCaseId, status: 'CONFIRMED' },
        data: { status: 'STALE' },
      });
      if (invalidatedRequirements.length > 0) {
        await tx.renovationRequirementEvent.createMany({
          data: invalidatedRequirements.map((requirement) => ({
            renovationCaseId,
            propertyId,
            requirementId: requirement.id,
            actorUserId,
            eventType: 'INVALIDATED_BY_SCOPE',
            priorApplicability: requirement.applicability,
            nextApplicability: requirement.applicability,
            priorDetermination: requirement.determination,
            nextDetermination: requirement.determination,
            priorTruthLayer: requirement.truthLayer,
            nextTruthLayer: requirement.truthLayer,
            payload: {
              priorScopeVersionId: previous.id,
              nextScopeVersionId: scope.id,
              invalidatedFamilies: comparison.invalidates,
            },
          })),
        });
      }
    }
    await tx.renovationCase.update({
      where: { id: renovationCaseId },
      data: {
        currentScopeVersionId: scope.id,
        spacesAffected: data.spacesAffected,
        systemsAffected: data.systemsAffected,
        readinessSummary: comparison.requiresRecheck
          ? json({ state: 'RECHECK_REQUIRED', invalidates: comparison.invalidates })
          : undefined,
      },
    });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'SCOPE_VERSION_CREATED',
      idempotencyKey: data.idempotencyKey ? `scope:${data.idempotencyKey}` : undefined,
      scopeVersionId: scope.id,
      payload: {
        version: scope.version,
        changeReason: data.changeReason,
        comparison,
      },
    });
    if (data.approvalStatus === 'APPROVED') {
      await appendEvent(tx, {
        renovationCaseId,
        propertyId,
        actorUserId,
        eventType: 'SCOPE_APPROVED',
        scopeVersionId: scope.id,
        payload: { version: scope.version },
      });
    }
  });
  return getRenovationCase(propertyId, renovationCaseId);
}

async function targetPropertyId(linkType: RenovationCaseLinkType, targetId: string) {
  switch (linkType) {
    case 'PROJECT':
      return (await prisma.projectRecord.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'ADVISOR_SESSION':
      return (await prisma.homeRenovationAdvisorSession.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'PERMIT':
      return (await prisma.propertyPermitRecord.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'HOA_APPROVAL':
      return (await prisma.hoaApprovalRecord.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'MATERIAL_SPEC':
      return (await prisma.materialSpec.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'DOCUMENT':
      return (await prisma.document.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId ?? undefined;
    case 'INSPECTION_FINDING':
      return (await prisma.inspectionFinding.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'QUOTE_WORKSPACE':
      return (await prisma.quoteComparisonWorkspace.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
    case 'CAPITAL_SCENARIO':
      return (await prisma.homeTwinScenario.findUnique({ where: { id: targetId }, select: { propertyId: true } }))?.propertyId;
  }
}

export async function linkContributor(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  data: {
    linkType: RenovationCaseLinkType;
    targetId: string;
    scopeVersionId?: string;
    metadata?: unknown;
  },
) {
  await assertCase(propertyId, renovationCaseId);
  const resolvedPropertyId = await targetPropertyId(data.linkType, data.targetId);
  if (!resolvedPropertyId) {
    throw new APIError('Linked contributor not found.', 404, 'RENOVATION_LINK_TARGET_NOT_FOUND');
  }
  if (resolvedPropertyId !== propertyId) {
    throw new APIError(
      'Linked contributor must belong to the same property.',
      409,
      'RENOVATION_LINK_PROPERTY_MISMATCH',
    );
  }
  if (data.scopeVersionId) {
    const scope = await prisma.renovationScopeVersion.findFirst({
      where: { id: data.scopeVersionId, renovationCaseId },
      select: { id: true },
    });
    if (!scope) {
      throw new APIError(
        'Linked scope version must belong to the same renovation case.',
        409,
        'RENOVATION_LINK_SCOPE_MISMATCH',
      );
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const link = await tx.renovationCaseLink.create({
        data: {
          renovationCaseId,
          propertyId,
          scopeVersionId: data.scopeVersionId,
          linkType: data.linkType,
          targetId: data.targetId,
          ...(data.metadata !== undefined && { metadata: json(data.metadata) }),
          createdByUserId: actorUserId,
        },
      });
      await appendEvent(tx, {
        renovationCaseId,
        propertyId,
        actorUserId,
        eventType: 'CONTRIBUTOR_LINKED',
        scopeVersionId: data.scopeVersionId,
        payload: { linkId: link.id, linkType: data.linkType, targetId: data.targetId },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new APIError(
        'This contributor is already linked to a renovation case.',
        409,
        'RENOVATION_LINK_ALREADY_EXISTS',
      );
    }
    throw error;
  }
  return getRenovationCase(propertyId, renovationCaseId);
}

export async function unlinkContributor(
  propertyId: string,
  renovationCaseId: string,
  linkId: string,
  actorUserId: string,
) {
  await assertCase(propertyId, renovationCaseId);
  const link = await prisma.renovationCaseLink.findFirst({
    where: { id: linkId, renovationCaseId, propertyId },
  });
  if (!link) throw new APIError('Renovation case link not found.', 404, 'RENOVATION_LINK_NOT_FOUND');
  await prisma.$transaction(async (tx) => {
    await tx.renovationCaseLink.delete({ where: { id: linkId } });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'CONTRIBUTOR_UNLINKED',
      scopeVersionId: link.scopeVersionId ?? undefined,
      payload: { linkId, linkType: link.linkType, targetId: link.targetId },
    });
  });
}

export async function addParticipant(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  data: any,
) {
  await assertCase(propertyId, renovationCaseId);
  const propertyAccess = await resolvePropertyAccess(data.userId, propertyId);
  if (!propertyAccess) {
    throw new APIError(
      'Participant must already have access to this property.',
      409,
      'RENOVATION_PARTICIPANT_PROPERTY_ACCESS_REQUIRED',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.renovationCaseParticipant.upsert({
      where: { renovationCaseId_userId: { renovationCaseId, userId: data.userId } },
      create: { renovationCaseId, ...data },
      update: { ...data, isActive: true, removedAt: null },
    });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'PARTICIPANT_ADDED',
      payload: { userId: data.userId, role: data.role },
    });
  });
  return getRenovationCase(propertyId, renovationCaseId);
}

export async function removeParticipant(
  propertyId: string,
  renovationCaseId: string,
  participantId: string,
  actorUserId: string,
) {
  await assertCase(propertyId, renovationCaseId);
  const participant = await prisma.renovationCaseParticipant.findFirst({
    where: { id: participantId, renovationCaseId, isActive: true },
  });
  if (!participant) {
    throw new APIError('Renovation participant not found.', 404, 'RENOVATION_PARTICIPANT_NOT_FOUND');
  }
  const ownerCount = await prisma.renovationCaseParticipant.count({
    where: { renovationCaseId, role: 'OWNER', isActive: true },
  });
  if (participant.role === 'OWNER' && ownerCount === 1) {
    throw new APIError(
      'A renovation case must retain at least one owner.',
      409,
      'RENOVATION_CASE_OWNER_REQUIRED',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.renovationCaseParticipant.update({
      where: { id: participantId },
      data: { isActive: false, removedAt: new Date() },
    });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'PARTICIPANT_REMOVED',
      payload: { participantId, userId: participant.userId, role: participant.role },
    });
  });
}

export async function archiveRenovationCase(
  propertyId: string,
  renovationCaseId: string,
  actorUserId: string,
  reason: string,
) {
  const existing = await assertCase(propertyId, renovationCaseId);
  await prisma.$transaction(async (tx) => {
    await tx.renovationCase.update({
      where: { id: renovationCaseId },
      data: { archivedAt: new Date(), archiveReason: reason },
    });
    await appendEvent(tx, {
      renovationCaseId,
      propertyId,
      actorUserId,
      eventType: 'CASE_ARCHIVED',
      fromLifecycle: existing.lifecycle,
      toLifecycle: existing.lifecycle,
      payload: { reason },
    });
  });
}

export async function listRenovationCaseEvents(propertyId: string, renovationCaseId: string) {
  await assertCase(propertyId, renovationCaseId, true);
  return prisma.renovationCaseEvent.findMany({
    where: { renovationCaseId, propertyId },
    orderBy: { occurredAt: 'asc' },
  });
}
