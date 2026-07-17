// apps/backend/src/services/adminCapability.service.ts
//
// Grant/revoke/check logic for the ADMIN capability model
// (ADMIN_MODULE_FRD.md §8.2/§8.3). The capability *catalog* is code-owned in
// config/adminCapabilities.ts; this service only manages who currently
// holds which capability, via the AdminCapabilityGrant table.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  ADMIN_PERSONA_BUNDLES,
  AdminCapability,
  AdminPersonaBundleName,
  BASELINE_ADMIN_CAPABILITY,
  isAdminCapability,
} from '../config/adminCapabilities';
import { recordAdminAction, RecordAdminActionInput } from './adminAudit.service';

export class AdminCapabilityError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminCapabilityError';
  }
}

interface GrantContext {
  req?: RecordAdminActionInput['req'];
}

/**
 * Active (non-revoked) capabilities held by a user, plus the always-on
 * baseline. Does not check the user's role — callers (the requireCapability
 * middleware, in particular) are expected to gate on role === ADMIN first,
 * since capability grants are only meaningful for ADMIN accounts.
 */
export async function getActiveCapabilities(userId: string): Promise<Set<AdminCapability>> {
  const grants = await prisma.adminCapabilityGrant.findMany({
    where: { userId, revokedAt: null },
    select: { capability: true },
  });

  const capabilities = new Set<AdminCapability>([BASELINE_ADMIN_CAPABILITY]);
  for (const grant of grants) {
    if (isAdminCapability(grant.capability)) {
      capabilities.add(grant.capability);
    }
  }
  return capabilities;
}

export async function hasCapability(userId: string, capability: AdminCapability): Promise<boolean> {
  if (capability === BASELINE_ADMIN_CAPABILITY) return true;
  const active = await prisma.adminCapabilityGrant.findFirst({
    where: { userId, capability, revokedAt: null },
    select: { id: true },
  });
  return active !== null;
}

/** Full grant history (active + revoked) for a user, newest first — for review/audit UI. */
export async function listGrants(userId: string) {
  return prisma.adminCapabilityGrant.findMany({
    where: { userId },
    orderBy: { grantedAt: 'desc' },
  });
}

function assertNotSelfGrant(actorId: string, targetUserId: string): void {
  if (actorId === targetUserId) {
    // FRD §8.2: "An administrator cannot grant themselves capabilities
    // unless explicitly authorized through the highest-trust access
    // workflow." No such workflow exists yet, so this is an unconditional
    // block for now rather than a partial implementation of it.
    throw new AdminCapabilityError('SELF_GRANT_FORBIDDEN', 'An administrator cannot grant capabilities to themselves.');
  }
}

export interface GrantCapabilityInput {
  userId: string;
  capability: AdminCapability;
  grantedBy: string;
  reason: string;
  bundleName?: AdminPersonaBundleName;
  resourceScope?: Record<string, unknown>;
}

export async function grantCapability(input: GrantCapabilityInput, ctx: GrantContext = {}) {
  assertNotSelfGrant(input.grantedBy, input.userId);
  if (!isAdminCapability(input.capability)) {
    throw new AdminCapabilityError('UNKNOWN_CAPABILITY', `"${input.capability}" is not a registered capability.`);
  }

  const existing = await prisma.adminCapabilityGrant.findFirst({
    where: { userId: input.userId, capability: input.capability, revokedAt: null },
  });
  if (existing) return existing;

  const grant = await prisma.adminCapabilityGrant.create({
    data: {
      userId: input.userId,
      capability: input.capability,
      bundleName: input.bundleName ?? null,
      resourceScope: (input.resourceScope as Prisma.InputJsonValue) ?? undefined,
      reason: input.reason,
      grantedBy: input.grantedBy,
    },
  });

  await recordAdminAction({
    actorId: input.grantedBy,
    action: 'GRANT_CAPABILITY',
    entityType: 'ADMIN_CAPABILITY_GRANT',
    entityId: grant.id,
    capability: input.capability,
    reason: input.reason,
    relatedRefs: { targetUserId: input.userId, bundleName: input.bundleName ?? null },
    req: ctx.req,
  });

  return grant;
}

export interface GrantBundleInput {
  userId: string;
  bundleName: AdminPersonaBundleName;
  grantedBy: string;
  reason: string;
}

/** Expands a persona bundle into one grant per capability (§8.2: "capabilities can be bundled into internal roles"). */
export async function grantBundle(input: GrantBundleInput, ctx: GrantContext = {}) {
  const capabilities = ADMIN_PERSONA_BUNDLES[input.bundleName];
  if (!capabilities) {
    throw new AdminCapabilityError('UNKNOWN_BUNDLE', `"${input.bundleName}" is not a registered persona bundle.`);
  }

  const grants = [];
  for (const capability of capabilities) {
    grants.push(
      await grantCapability(
        {
          userId: input.userId,
          capability,
          grantedBy: input.grantedBy,
          reason: input.reason,
          bundleName: input.bundleName,
        },
        ctx
      )
    );
  }
  return grants;
}

export interface RevokeCapabilityInput {
  userId: string;
  capability: AdminCapability;
  revokedBy: string;
  reason: string;
}

export async function revokeCapability(input: RevokeCapabilityInput, ctx: GrantContext = {}) {
  const active = await prisma.adminCapabilityGrant.findFirst({
    where: { userId: input.userId, capability: input.capability, revokedAt: null },
  });
  if (!active) {
    throw new AdminCapabilityError('GRANT_NOT_FOUND', `${input.userId} does not have an active grant for "${input.capability}".`);
  }

  const revoked = await prisma.adminCapabilityGrant.update({
    where: { id: active.id },
    data: {
      revokedAt: new Date(),
      revokedBy: input.revokedBy,
      revokeReason: input.reason,
    },
  });

  await recordAdminAction({
    actorId: input.revokedBy,
    action: 'REVOKE_CAPABILITY',
    entityType: 'ADMIN_CAPABILITY_GRANT',
    entityId: revoked.id,
    capability: input.capability,
    reason: input.reason,
    relatedRefs: { targetUserId: input.userId },
    req: ctx.req,
  });

  return revoked;
}
