// apps/backend/src/services/personalizationAudit.service.ts
//
// Append-only audit trail for personalization admin actions, backed by the
// PersonalizationAuditEvent table — deliberately separate from the generic
// AuditLog model (see that table's schema.prisma comment): AuditLog accepts
// arbitrary oldValues/newValues JSON, which is exactly the "profile/rule
// evaluation payloads must never be logged" risk flagged in
// docs/personalization/01-codebase-assessment.md's risk table. Every write
// here runs `metadata` through redactSensitiveKeys() so a caller passing an
// object that happens to include a sensitive-shaped key can't leak it into
// an immutable audit row.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redactSensitiveKeys } from '../lib/redaction';

export interface RecordPersonalizationAuditEventParams {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function recordPersonalizationAuditEvent(
  params: RecordPersonalizationAuditEventParams
): Promise<void> {
  const { actorUserId, action, entityType, entityId, reason, metadata } = params;

  await prisma.personalizationAuditEvent.create({
    data: {
      actorUserId,
      action,
      entityType,
      entityId,
      reason: reason ?? null,
      ...(metadata
        ? { metadata: redactSensitiveKeys(metadata) as Prisma.InputJsonValue }
        : {}),
    },
  });
}
