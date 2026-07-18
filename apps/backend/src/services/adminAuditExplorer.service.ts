// apps/backend/src/services/adminAuditExplorer.service.ts
//
// Audit Explorer v1 (ADMIN_MODULE_FRD.md §12.2, Phase 1) — read-only,
// filtered, paginated query over the AuditLog table. Consumes the safe
// normalized projection AuditLog already is; does not aggregate the
// personalization-specific or other bespoke audit stores mentioned in the
// FRD (§4.4 gap 9) — that unification is still open.

import { prisma } from '../lib/prisma';

export interface AuditExplorerQuery {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  requestId?: string;
  from?: Date;
  to?: Date;
  /** Keyset pagination cursor — createdAt ISO string of the last row seen. Returns rows strictly older than this. */
  before?: Date;
  limit?: number;
}

export async function queryAuditLog(query: AuditExplorerQuery) {
  const limit = Math.min(query.limit ?? 50, 200);

  const where: Record<string, unknown> = {};
  if (query.actorId) where.userId = query.actorId;
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.action) where.action = query.action;
  if (query.requestId) where.requestId = query.requestId;

  const createdAt: Record<string, Date> = {};
  if (query.from) createdAt.gte = query.from;
  if (query.to) createdAt.lte = query.to;
  if (query.before) createdAt.lt = query.before;
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt : null;

  return { items: rows, nextCursor };
}
