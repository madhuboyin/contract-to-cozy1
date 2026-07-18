// apps/backend/src/services/adminPrivacyRequests.service.ts
//
// Subject-rights privacy request workspace backend (ADMIN_MODULE_FRD.md
// §11.4, Phase 3 slice). Intake and governed tracking only, entirely under
// PRIVACY_REQUEST_MANAGE. This service deliberately performs NO data
// operations on the subject's account: exports, corrections, and deletion
// stay in their authoritative flows (deletion goes through
// accountDeletionCascade.service via the existing deletion path) — §11.4:
// "An admin cannot silently delete an account outside the privacy workflow",
// and equally this workflow cannot delete an account itself. userEmail is
// snapshotted at intake so a DELETION request stays auditable after the
// account is gone.

import { Request } from 'express';
import { Prisma, PrivacyRequestStatus, PrivacyRequestType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';

export class AdminPrivacyRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminPrivacyRequestError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

/**
 * Governed lifecycle. Terminal states (COMPLETED/REJECTED/CANCELLED) cannot
 * be reopened — a new request must be filed, keeping each request's record
 * immutable once closed.
 */
const TRANSITIONS: Record<PrivacyRequestStatus, PrivacyRequestStatus[]> = {
  RECEIVED: ['VERIFYING', 'REJECTED', 'CANCELLED'],
  VERIFYING: ['VERIFIED', 'REJECTED', 'CANCELLED'],
  VERIFIED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

const WORKING_STATUSES: PrivacyRequestStatus[] = ['RECEIVED', 'VERIFYING', 'VERIFIED', 'IN_PROGRESS'];

const DEFAULT_DUE_DAYS = 30;

function newRequestNumber(): string {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRIV-${year}-${suffix}`;
}

export interface ListPrivacyRequestsInput {
  status?: PrivacyRequestStatus;
  type?: PrivacyRequestType;
  page?: number;
  limit?: number;
}

/** Defaults to the working set (not yet terminal), due-soonest first. */
export async function listPrivacyRequests(input: ListPrivacyRequestsInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);

  const where: Prisma.PrivacyRequestWhereInput = {
    ...(input.status ? { status: input.status } : { status: { in: WORKING_STATUSES } }),
    ...(input.type ? { type: input.type } : {}),
  };

  const [requests, total] = await Promise.all([
    prisma.privacyRequest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.privacyRequest.count({ where }),
  ]);

  return { requests, total, page, limit };
}

export async function getPrivacyRequestDetail(requestId: string) {
  const request = await prisma.privacyRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw new AdminPrivacyRequestError('REQUEST_NOT_FOUND', `No privacy request with id "${requestId}".`);
  }
  return request;
}

export interface CreatePrivacyRequestInput {
  actorId: string;
  userEmail: string;
  type: PrivacyRequestType;
  jurisdiction?: string;
  dueAt?: Date;
}

/**
 * Intake. The subject is looked up by email at intake time; the email is
 * snapshotted on the request so the record survives account deletion. A
 * request can be filed for an email with no matching account (e.g. the
 * account was already deleted) — userId is then recorded as UNMATCHED.
 */
export async function createPrivacyRequest(input: CreatePrivacyRequestInput, ctx: ActionContext = {}) {
  const email = input.userEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  const dueAt = input.dueAt ?? new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);

  const created = await prisma.privacyRequest.create({
    data: {
      requestNumber: newRequestNumber(),
      userId: user?.id ?? 'UNMATCHED',
      userEmail: email,
      type: input.type,
      jurisdiction: input.jurisdiction ?? null,
      dueAt,
      openedById: input.actorId,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CREATE_PRIVACY_REQUEST',
    entityType: 'PRIVACY_REQUEST',
    entityId: created.id,
    capability: 'PRIVACY_REQUEST_MANAGE',
    relatedRefs: {
      requestNumber: created.requestNumber,
      type: created.type,
      subjectMatched: !!user,
      jurisdiction: created.jurisdiction,
    },
    req: ctx.req,
  });

  return created;
}

export interface ChangePrivacyRequestStatusInput {
  requestId: string;
  actorId: string;
  status: PrivacyRequestStatus;
  reason: string;
  resolutionSummary?: string;
}

/**
 * Governed transition. Moving to VERIFIED records identity-verification
 * attribution. COMPLETED requires a resolution summary describing what was
 * done in the authoritative flow (export delivered, correction applied,
 * deletion executed via the account-deletion cascade, ...). A DELETION
 * request under legal hold cannot be completed.
 */
export async function changePrivacyRequestStatus(
  input: ChangePrivacyRequestStatusInput,
  ctx: ActionContext = {}
) {
  const request = await prisma.privacyRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, requestNumber: true, status: true, type: true, legalHold: true },
  });
  if (!request) {
    throw new AdminPrivacyRequestError('REQUEST_NOT_FOUND', `No privacy request with id "${input.requestId}".`);
  }

  if (!TRANSITIONS[request.status].includes(input.status)) {
    throw new AdminPrivacyRequestError(
      'INVALID_TRANSITION',
      `Cannot move a ${request.status} privacy request to ${input.status}.`
    );
  }

  if (input.status === 'COMPLETED') {
    if (!(input.resolutionSummary ?? '').trim()) {
      throw new AdminPrivacyRequestError(
        'RESOLUTION_REQUIRED',
        'Completing a privacy request requires a resolution summary.'
      );
    }
    if (request.type === 'DELETION' && request.legalHold) {
      throw new AdminPrivacyRequestError(
        'LEGAL_HOLD_ACTIVE',
        'A DELETION request cannot be completed while a legal hold is active.'
      );
    }
  }

  const now = new Date();
  await prisma.privacyRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      ...(input.status === 'VERIFIED' ? { identityVerifiedAt: now, identityVerifiedBy: input.actorId } : {}),
      ...(input.status === 'COMPLETED'
        ? { resolutionSummary: input.resolutionSummary!.trim(), completedAt: now }
        : {}),
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CHANGE_PRIVACY_REQUEST_STATUS',
    entityType: 'PRIVACY_REQUEST',
    entityId: input.requestId,
    capability: 'PRIVACY_REQUEST_MANAGE',
    reason: input.reason,
    oldValues: { status: request.status } as Prisma.InputJsonValue,
    newValues: { status: input.status } as Prisma.InputJsonValue,
    relatedRefs: { requestNumber: request.requestNumber, type: request.type },
    req: ctx.req,
  });

  return { previousStatus: request.status, status: input.status };
}

export interface SetLegalHoldInput {
  requestId: string;
  actorId: string;
  legalHold: boolean;
  reason: string;
}

export async function setLegalHold(input: SetLegalHoldInput, ctx: ActionContext = {}) {
  const request = await prisma.privacyRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, requestNumber: true, legalHold: true, status: true },
  });
  if (!request) {
    throw new AdminPrivacyRequestError('REQUEST_NOT_FOUND', `No privacy request with id "${input.requestId}".`);
  }

  if (TRANSITIONS[request.status].length === 0) {
    throw new AdminPrivacyRequestError('REQUEST_TERMINAL', 'Legal hold cannot change on a closed request.');
  }

  if (request.legalHold === input.legalHold) {
    return { legalHold: request.legalHold, noop: true };
  }

  await prisma.privacyRequest.update({
    where: { id: input.requestId },
    data: { legalHold: input.legalHold },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_SET_PRIVACY_LEGAL_HOLD',
    entityType: 'PRIVACY_REQUEST',
    entityId: input.requestId,
    capability: 'PRIVACY_REQUEST_MANAGE',
    reason: input.reason,
    oldValues: { legalHold: request.legalHold } as Prisma.InputJsonValue,
    newValues: { legalHold: input.legalHold } as Prisma.InputJsonValue,
    relatedRefs: { requestNumber: request.requestNumber },
    req: ctx.req,
  });

  return { legalHold: input.legalHold, noop: false };
}
