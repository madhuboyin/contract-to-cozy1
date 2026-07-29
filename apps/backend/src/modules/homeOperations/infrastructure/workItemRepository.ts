import { prisma } from '../../../lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
  OperationalObligationType,
  OperationalWorkActorType,
  OperationalWorkEventType,
  OperationalWorkEvidenceType,
  OperationalWorkEvidenceVerificationStatus,
  OperationalWorkExecutionRole,
  OperationalWorkExecutionType,
  OperationalWorkItemAcceptanceState,
  OperationalWorkItemDisposition,
  OperationalWorkItemPriority,
  OperationalWorkItemState,
  OperationalWorkSourceRole,
  OperationalWorkSourceType,
  OperationalWorkSubjectType,
  RecommendationSafetyTier,
} from '@prisma/client';

export interface CreateWorkItemInput {
  propertyId: string;
  workKey: string;
  subjectType: OperationalWorkSubjectType;
  subjectId: string;
  obligationType: OperationalObligationType;
  priority: OperationalWorkItemPriority;
  safetyTier: RecommendationSafetyTier;
  title: string;
  homeownerReason: string;
  expectedOutcome: string;
  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
  confidence?: number | null;
  missingContext?: string[];
  sourceVersion?: string | null;
}

export interface RefreshWorkItemPresentationInput {
  priority: OperationalWorkItemPriority;
  safetyTier: RecommendationSafetyTier;
  title: string;
  homeownerReason: string;
  expectedOutcome: string;
  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
  confidence?: number | null;
  missingContext?: string[];
  sourceVersion?: string | null;
}

export interface UpsertSourceInput {
  workItemId: string;
  sourceType: OperationalWorkSourceType;
  sourceEntityId: string;
  sourceVersion: string | null;
  sourceRole: OperationalWorkSourceRole;
  active?: boolean;
}

export interface RecordEventInput {
  workItemId: string;
  eventType: OperationalWorkEventType;
  actorType: OperationalWorkActorType;
  actorUserId?: string | null;
  idempotencyKey: string;
  payload?: Prisma.InputJsonValue | null;
  occurredAt?: Date;
}

export function findWorkItemByWorkKey(propertyId: string, workKey: string) {
  return prisma.operationalWorkItem.findUnique({
    where: { propertyId_workKey: { propertyId, workKey } },
  });
}

export function findWorkItemById(workItemId: string) {
  return prisma.operationalWorkItem.findUnique({ where: { id: workItemId } });
}

export function createWorkItem(input: CreateWorkItemInput) {
  return prisma.operationalWorkItem.create({
    data: {
      propertyId: input.propertyId,
      workKey: input.workKey,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      obligationType: input.obligationType,
      priority: input.priority,
      safetyTier: input.safetyTier,
      title: input.title,
      homeownerReason: input.homeownerReason,
      expectedOutcome: input.expectedOutcome,
      dueWindowStart: input.dueWindowStart ?? null,
      dueAt: input.dueAt ?? null,
      dueWindowEnd: input.dueWindowEnd ?? null,
      confidence: input.confidence ?? null,
      missingContext: input.missingContext ?? [],
      sourceVersion: input.sourceVersion ?? null,
    },
  });
}

/** Only ever called when the item is still CANDIDATE (see canRefreshFromSource). */
export function refreshWorkItemPresentation(workItemId: string, input: RefreshWorkItemPresentationInput) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: {
      priority: input.priority,
      safetyTier: input.safetyTier,
      title: input.title,
      homeownerReason: input.homeownerReason,
      expectedOutcome: input.expectedOutcome,
      dueWindowStart: input.dueWindowStart ?? null,
      dueAt: input.dueAt ?? null,
      dueWindowEnd: input.dueWindowEnd ?? null,
      confidence: input.confidence ?? null,
      missingContext: input.missingContext ?? [],
      sourceVersion: input.sourceVersion ?? null,
    },
  });
}

export function upsertWorkSource(input: UpsertSourceInput) {
  return prisma.operationalWorkSource.upsert({
    where: {
      workItemId_sourceType_sourceEntityId_sourceRole: {
        workItemId: input.workItemId,
        sourceType: input.sourceType,
        sourceEntityId: input.sourceEntityId,
        sourceRole: input.sourceRole,
      },
    },
    create: {
      workItemId: input.workItemId,
      sourceType: input.sourceType,
      sourceEntityId: input.sourceEntityId,
      sourceVersion: input.sourceVersion,
      sourceRole: input.sourceRole,
      active: input.active ?? true,
    },
    update: {
      sourceVersion: input.sourceVersion,
      active: input.active ?? true,
    },
  });
}

/**
 * Idempotent on [workItemId, idempotencyKey]. A retried event (same key) is
 * a no-op, not an error — callers should not have to special-case retries.
 */
export async function recordWorkEvent(input: RecordEventInput) {
  try {
    return await prisma.operationalWorkEvent.create({
      data: {
        workItemId: input.workItemId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload ?? undefined,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return prisma.operationalWorkEvent.findUnique({
        where: { workItemId_idempotencyKey: { workItemId: input.workItemId, idempotencyKey: input.idempotencyKey } },
      });
    }
    throw err;
  }
}

export interface UpdateStateInput {
  state: OperationalWorkItemState;
  acceptanceState: OperationalWorkItemAcceptanceState;
  disposition: OperationalWorkItemDisposition | null;
  timestampField: 'acceptedAt' | 'startedAt' | 'reportedCompletedAt' | 'verifiedAt' | 'deferredUntil' | 'dismissedAt' | 'closedAt' | null;
  timestampValue?: Date;
}

export function updateWorkItemState(workItemId: string, input: UpdateStateInput) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: {
      state: input.state,
      acceptanceState: input.acceptanceState,
      disposition: input.disposition,
      ...(input.timestampField ? { [input.timestampField]: input.timestampValue ?? new Date() } : {}),
    },
  });
}

export function linkWorkExecution(input: {
  workItemId: string;
  executionType: OperationalWorkExecutionType;
  executionEntityId: string;
  role?: OperationalWorkExecutionRole;
}) {
  return prisma.operationalWorkExecution.upsert({
    where: {
      workItemId_executionType_executionEntityId: {
        workItemId: input.workItemId,
        executionType: input.executionType,
        executionEntityId: input.executionEntityId,
      },
    },
    create: {
      workItemId: input.workItemId,
      executionType: input.executionType,
      executionEntityId: input.executionEntityId,
      role: input.role ?? 'PRIMARY',
    },
    update: { role: input.role ?? 'PRIMARY' },
  });
}

export function recordWorkEvidence(input: {
  workItemId: string;
  evidenceType: OperationalWorkEvidenceType;
  evidenceEntityId: string;
  verificationStatus?: OperationalWorkEvidenceVerificationStatus;
  observedAt: Date;
}) {
  return prisma.operationalWorkEvidence.create({
    data: {
      workItemId: input.workItemId,
      evidenceType: input.evidenceType,
      evidenceEntityId: input.evidenceEntityId,
      verificationStatus: input.verificationStatus ?? 'PENDING',
      observedAt: input.observedAt,
    },
  });
}

/** Durable, reversible — see recordDuplicateDecision.usecase.ts. */
export function setSupersededBy(workItemId: string, supersededByWorkItemId: string | null) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { supersededByWorkItemId },
  });
}

export function setWorkItemOwner(workItemId: string, ownerUserId: string | null) {
  return prisma.operationalWorkItem.update({
    where: { id: workItemId },
    data: { ownerUserId },
  });
}

export function addWorkItemWatcher(workItemId: string, userId: string, addedByUserId?: string | null) {
  return prisma.operationalWorkItemWatcher.upsert({
    where: { workItemId_userId: { workItemId, userId } },
    create: { workItemId, userId, addedByUserId: addedByUserId ?? null },
    update: {},
  });
}

export function removeWorkItemWatcher(workItemId: string, userId: string) {
  return prisma.operationalWorkItemWatcher.deleteMany({ where: { workItemId, userId } });
}

export interface ListWorkItemsFilter {
  propertyId: string;
  state?: OperationalWorkItemState;
  obligationType?: OperationalObligationType;
  ownerUserId?: string;
  subjectType?: OperationalWorkSubjectType;
  subjectId?: string;
}

export function listWorkItemsForProperty(filter: ListWorkItemsFilter) {
  return prisma.operationalWorkItem.findMany({
    where: {
      propertyId: filter.propertyId,
      state: filter.state,
      obligationType: filter.obligationType,
      ownerUserId: filter.ownerUserId,
      subjectType: filter.subjectType,
      subjectId: filter.subjectId,
    },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
  });
}

export function getWorkItemGraph(workItemId: string) {
  return prisma.operationalWorkItem.findUnique({
    where: { id: workItemId },
    include: {
      sources: true,
      executions: true,
      evidence: true,
      watchers: true,
    },
  });
}
