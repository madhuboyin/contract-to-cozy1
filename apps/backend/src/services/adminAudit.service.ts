// apps/backend/src/services/adminAudit.service.ts
//
// Standardized admin action audit contract (ADMIN_MODULE_FRD.md §12.1).
// Every consequential admin mutation should call recordAdminAction() instead
// of writing to prisma.auditLog directly, so actor, reason, capability,
// request correlation, and safe before/after state are captured the same
// way everywhere. Application logs (lib/logger's auditLog()) are NOT a
// substitute for this — §12.1 requires a queryable business audit trail.

import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getRequestId } from '../lib/requestContext';
import { AdminCapability } from '../config/adminCapabilities';

export interface RecordAdminActionInput {
  /** userId of the admin performing the action. */
  actorId: string;
  /** e.g. "PROVIDER_CREDENTIAL_APPROVE", "REFUND_APPROVE", "GRANT_CAPABILITY" */
  action: string;
  entityType: string;
  entityId: string;
  /** Capability under which this action was authorized, if any. */
  capability?: AdminCapability | string;
  /** Structured reason/disposition — required for most sensitive actions by policy at the call site, not enforced here. */
  reason?: string;
  disposition?: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  /** Related case/approval/release/payment/job references for correlation. */
  relatedRefs?: Record<string, string | number | boolean | null>;
  /** Express request, used to pull ip/user-agent and the request-id context. Optional so services can call this outside an HTTP request (e.g. scripts). */
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

export async function recordAdminAction(input: RecordAdminActionInput): Promise<void> {
  const userAgent = input.req?.headers?.['user-agent'];

  await prisma.auditLog.create({
    data: {
      userId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: input.oldValues ?? undefined,
      newValues: input.newValues ?? undefined,
      ipAddress: input.req?.ip ?? undefined,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      requestId: getRequestId(),
      metadata: {
        capability: input.capability ?? null,
        reason: input.reason ?? null,
        disposition: input.disposition ?? null,
        relatedRefs: input.relatedRefs ?? null,
      } as Prisma.InputJsonValue,
    },
  });
}
