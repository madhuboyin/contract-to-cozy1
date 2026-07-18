// apps/backend/src/services/adminCase.service.ts
//
// Admin case management backend (ADMIN_MODULE_FRD.md §10.5 safety/abuse case
// types + Phase 1 "cross-domain case management" foundation). Cases carry a
// type (SAFETY/ABUSE/REVIEW_INVESTIGATION/SUPPORT), severity, governed
// lifecycle, an optional linked entity, and a free-form note trail. Actor
// references are plain userId strings (AuditLog convention) so cases survive
// account deletion; names are resolved at read time.

import { Request } from 'express';
import { AdminCaseSeverity, AdminCaseStatus, AdminCaseType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { AdminCapability } from '../config/adminCapabilities';

export class AdminCaseError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminCaseError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

/**
 * Governed lifecycle. RESOLVED requires a resolution text; reopening
 * (→ OPEN from RESOLVED/CLOSED) clears resolvedAt/closedAt but keeps the
 * last resolution text as history.
 */
const CASE_TRANSITIONS: Record<AdminCaseStatus, AdminCaseStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

function newCaseNumber(): string {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CASE-${year}-${suffix}`;
}

/** Resolve userIds to display names in one query; unknown/deleted ids map to null. */
async function resolveActorNames(userIds: (string | null)[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  return Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
}

export interface ListCasesInput {
  type?: AdminCaseType;
  status?: AdminCaseStatus;
  severity?: AdminCaseSeverity;
  entityType?: string;
  entityId?: string;
  page?: number;
  limit?: number;
}

/** Case list. Without a status filter it shows the working set (OPEN + IN_PROGRESS), most severe/newest first. */
export async function listCases(input: ListCasesInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);

  const where: Prisma.AdminCaseWhereInput = {
    ...(input.type ? { type: input.type } : {}),
    ...(input.status ? { status: input.status } : { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
    ...(input.severity ? { severity: input.severity } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
  };

  const [cases, total] = await Promise.all([
    prisma.adminCase.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        caseNumber: true,
        type: true,
        severity: true,
        status: true,
        title: true,
        entityType: true,
        entityId: true,
        openedById: true,
        assignedToId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.adminCase.count({ where }),
  ]);

  const names = await resolveActorNames(cases.flatMap((c) => [c.openedById, c.assignedToId]));

  return {
    cases: cases.map((c) => ({
      ...c,
      openedByName: names[c.openedById] ?? null,
      assignedToName: c.assignedToId ? names[c.assignedToId] ?? null : null,
    })),
    total,
    page,
    limit,
  };
}

export async function getCaseDetail(caseId: string) {
  const adminCase = await prisma.adminCase.findUnique({
    where: { id: caseId },
    include: { notes: { orderBy: { createdAt: 'asc' } } },
  });
  if (!adminCase) {
    throw new AdminCaseError('CASE_NOT_FOUND', `No case with id "${caseId}".`);
  }

  const names = await resolveActorNames([
    adminCase.openedById,
    adminCase.assignedToId,
    ...adminCase.notes.map((n) => n.authorId),
  ]);

  return {
    ...adminCase,
    openedByName: names[adminCase.openedById] ?? null,
    assignedToName: adminCase.assignedToId ? names[adminCase.assignedToId] ?? null : null,
    notes: adminCase.notes.map((n) => ({ ...n, authorName: names[n.authorId] ?? null })),
  };
}

export interface CreateCaseInput {
  actorId: string;
  type: AdminCaseType;
  severity: AdminCaseSeverity;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  /** Audit attribution — defaults to the generic case capability/action; the review "request investigation" path overrides these. */
  capability?: AdminCapability;
  auditAction?: string;
}

export async function createCase(input: CreateCaseInput, ctx: ActionContext = {}) {
  const created = await prisma.adminCase.create({
    data: {
      caseNumber: newCaseNumber(),
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      openedById: input.actorId,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: input.auditAction ?? 'ADMIN_CREATE_CASE',
    entityType: 'ADMIN_CASE',
    entityId: created.id,
    capability: input.capability ?? 'SUPPORT_CASE_MANAGE',
    reason: input.description,
    relatedRefs: {
      caseNumber: created.caseNumber,
      caseType: created.type,
      severity: created.severity,
      linkedEntityType: created.entityType,
      linkedEntityId: created.entityId,
    },
    req: ctx.req,
  });

  return created;
}

export interface ChangeCaseStatusInput {
  caseId: string;
  actorId: string;
  status: AdminCaseStatus;
  reason: string;
  resolution?: string;
}

export async function changeCaseStatus(input: ChangeCaseStatusInput, ctx: ActionContext = {}) {
  const adminCase = await prisma.adminCase.findUnique({
    where: { id: input.caseId },
    select: { id: true, caseNumber: true, status: true, resolution: true },
  });
  if (!adminCase) {
    throw new AdminCaseError('CASE_NOT_FOUND', `No case with id "${input.caseId}".`);
  }

  if (!CASE_TRANSITIONS[adminCase.status].includes(input.status)) {
    throw new AdminCaseError(
      'INVALID_TRANSITION',
      `Cannot move a ${adminCase.status} case to ${input.status}.`
    );
  }

  if (input.status === 'RESOLVED' && !(input.resolution ?? '').trim()) {
    throw new AdminCaseError('RESOLUTION_REQUIRED', 'Resolving a case requires a resolution summary.');
  }

  const now = new Date();
  await prisma.adminCase.update({
    where: { id: input.caseId },
    data: {
      status: input.status,
      ...(input.status === 'RESOLVED'
        ? { resolution: input.resolution!.trim(), resolvedAt: now }
        : {}),
      ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
      ...(input.status === 'OPEN' ? { resolvedAt: null, closedAt: null } : {}),
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CHANGE_CASE_STATUS',
    entityType: 'ADMIN_CASE',
    entityId: input.caseId,
    capability: 'SUPPORT_CASE_MANAGE',
    reason: input.reason,
    oldValues: { status: adminCase.status } as Prisma.InputJsonValue,
    newValues: { status: input.status } as Prisma.InputJsonValue,
    relatedRefs: { caseNumber: adminCase.caseNumber },
    req: ctx.req,
  });

  return { previousStatus: adminCase.status, status: input.status };
}

export interface AssignCaseInput {
  caseId: string;
  actorId: string;
  assignedToId: string | null;
  reason: string;
}

export async function assignCase(input: AssignCaseInput, ctx: ActionContext = {}) {
  const adminCase = await prisma.adminCase.findUnique({
    where: { id: input.caseId },
    select: { id: true, caseNumber: true, assignedToId: true },
  });
  if (!adminCase) {
    throw new AdminCaseError('CASE_NOT_FOUND', `No case with id "${input.caseId}".`);
  }

  if (input.assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: input.assignedToId },
      select: { id: true, role: true },
    });
    if (!assignee || assignee.role !== 'ADMIN') {
      throw new AdminCaseError('INVALID_ASSIGNEE', 'Cases can only be assigned to an ADMIN user.');
    }
  }

  await prisma.adminCase.update({
    where: { id: input.caseId },
    data: { assignedToId: input.assignedToId },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_ASSIGN_CASE',
    entityType: 'ADMIN_CASE',
    entityId: input.caseId,
    capability: 'SUPPORT_CASE_MANAGE',
    reason: input.reason,
    oldValues: { assignedToId: adminCase.assignedToId } as Prisma.InputJsonValue,
    newValues: { assignedToId: input.assignedToId } as Prisma.InputJsonValue,
    relatedRefs: { caseNumber: adminCase.caseNumber },
    req: ctx.req,
  });

  return { assignedToId: input.assignedToId };
}

export interface AddCaseNoteInput {
  caseId: string;
  actorId: string;
  body: string;
}

/** Notes are the case's own record trail, so they are not separately audited. */
export async function addCaseNote(input: AddCaseNoteInput) {
  const adminCase = await prisma.adminCase.findUnique({
    where: { id: input.caseId },
    select: { id: true },
  });
  if (!adminCase) {
    throw new AdminCaseError('CASE_NOT_FOUND', `No case with id "${input.caseId}".`);
  }

  return prisma.adminCaseNote.create({
    data: { caseId: input.caseId, authorId: input.actorId, body: input.body },
  });
}
