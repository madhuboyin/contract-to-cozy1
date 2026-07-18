// apps/backend/src/services/adminUserSupport.service.ts
//
// User/Account Support workspace backend (ADMIN_MODULE_FRD.md §10.1, Phase 1).
// Read-only search/summary plus two governed actions: revoke sessions and
// change account status. Deliberately does NOT touch HOMEOWNER/PROVIDER
// self-service paths (getProfile/updateProfile/deactivateAccount/deleteAccount
// in user.controller.ts) — this is a separate, admin-actor-driven surface
// over the same underlying User/RefreshTokenSession schema.

import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deactivateProviderFootprint } from '../controllers/user.controller';
import { recordAdminAction } from './adminAudit.service';

export class AdminUserSupportError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminUserSupportError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

function assertNotSelfTarget(actorId: string, targetUserId: string, action: string): void {
  if (actorId === targetUserId) {
    // Defensive guard, not an explicit FRD requirement: suspending/deactivating
    // or revoking your own sessions through this tool is a pure foot-gun (no
    // legitimate use case an ordinary logout doesn't already cover) and, for
    // a status change, risks locking out the only admin with no recovery path
    // short of a direct DB edit.
    throw new AdminUserSupportError(
      'SELF_ACTION_FORBIDDEN',
      `An administrator cannot ${action} on their own account through this tool.`
    );
  }
}

export interface UserSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: Date;
}

/** Search by exact email or case-insensitive name/email substring. Never returns password/MFA secrets. */
export async function searchUsers(query: string, limit = 20): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: trimmed, mode: 'insensitive' } },
        { firstName: { contains: trimmed, mode: 'insensitive' } },
        { lastName: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      createdAt: true,
    },
    take: Math.min(limit, 50),
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Support-safe account summary (FRD §10.1: "Show only support-safe property
 * facts by default; deeper property access requires an explicit capability
 * and case reason"). Property count only, not property detail. No financial
 * fields, no documents, no bookings/reviews detail.
 */
export async function getUserSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      emailVerified: true,
      phoneVerified: true,
      mfaEnabled: true,
      tokenVersion: true,
      lastLoginAt: true,
      tosAcceptedAt: true,
      tosVersion: true,
      createdAt: true,
      homeownerProfile: {
        select: {
          segment: true,
          properties: { select: { id: true } },
        },
      },
      providerProfile: {
        select: {
          businessName: true,
          businessType: true,
          status: true,
          insuranceVerified: true,
          licenseVerified: true,
          averageRating: true,
          totalReviews: true,
          totalCompletedJobs: true,
        },
      },
    },
  });

  if (!user) {
    throw new AdminUserSupportError('USER_NOT_FOUND', `No user with id "${userId}".`);
  }

  const activeSessionCount = await prisma.refreshTokenSession.count({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  const { homeownerProfile, providerProfile, ...rest } = user;

  return {
    ...rest,
    activeSessionCount,
    homeownerProfile: homeownerProfile
      ? { segment: homeownerProfile.segment, propertyCount: homeownerProfile.properties.length }
      : null,
    providerProfile: providerProfile ?? null,
  };
}

export interface RevokeSessionsInput {
  userId: string;
  actorId: string;
  reason: string;
}

/** Revokes all active refresh sessions AND bumps tokenVersion (kills already-issued access tokens too), mirroring auth.service.ts's password-change transaction. */
export async function revokeUserSessions(input: RevokeSessionsInput, ctx: ActionContext = {}) {
  assertNotSelfTarget(input.actorId, input.userId, 'revoke sessions');

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new AdminUserSupportError('USER_NOT_FOUND', `No user with id "${input.userId}".`);

  const result = await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshTokenSession.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return revoked;
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_REVOKE_USER_SESSIONS',
    entityType: 'USER',
    entityId: input.userId,
    capability: 'USER_SESSION_REVOKE',
    reason: input.reason,
    relatedRefs: { revokedSessionCount: result.count },
    req: ctx.req,
  });

  return { revokedSessionCount: result.count };
}

const GOVERNED_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const;
export type GovernedUserStatus = (typeof GOVERNED_STATUSES)[number];

function isGovernedStatus(value: unknown): value is GovernedUserStatus {
  return typeof value === 'string' && (GOVERNED_STATUSES as readonly string[]).includes(value);
}

export interface ChangeUserStatusInput {
  userId: string;
  actorId: string;
  status: GovernedUserStatus;
  reason: string;
}

/**
 * Governed status transition (FRD §10.1: "Suspend, reactivate, or deactivate
 * accounts through governed transitions... require reason and impact preview").
 * PENDING_VERIFICATION is intentionally not reachable here — it's a signup-flow
 * state, not something an admin sets. Leaving ACTIVE revokes sessions and
 * deactivates any provider footprint in the same transaction, same as the
 * self-service deactivateAccount path. Reactivating (moving back to ACTIVE)
 * deliberately does NOT re-enable a provider's services automatically — the
 * provider must re-enable their own listings, so a reinstated account never
 * silently reappears in the marketplace.
 */
export async function changeUserStatus(input: ChangeUserStatusInput, ctx: ActionContext = {}) {
  assertNotSelfTarget(input.actorId, input.userId, 'change the status of');

  if (!isGovernedStatus(input.status)) {
    throw new AdminUserSupportError('INVALID_STATUS', `"${input.status}" is not a governed status.`);
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, status: true },
  });
  if (!user) throw new AdminUserSupportError('USER_NOT_FOUND', `No user with id "${input.userId}".`);

  if (user.status === input.status) {
    return { previousStatus: user.status, status: input.status, noop: true };
  }

  const leavingActive = input.status !== 'ACTIVE';

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: {
        status: input.status,
        ...(leavingActive ? { tokenVersion: { increment: 1 } } : {}),
      },
    });

    if (leavingActive) {
      await tx.refreshTokenSession.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await deactivateProviderFootprint(tx, input.userId);
    }
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CHANGE_USER_STATUS',
    entityType: 'USER',
    entityId: input.userId,
    capability: 'USER_STATUS_CHANGE',
    reason: input.reason,
    oldValues: { status: user.status } as Prisma.InputJsonValue,
    newValues: { status: input.status } as Prisma.InputJsonValue,
    req: ctx.req,
  });

  return { previousStatus: user.status, status: input.status, noop: false };
}
