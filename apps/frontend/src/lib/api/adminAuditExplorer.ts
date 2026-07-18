// apps/frontend/src/lib/api/adminAuditExplorer.ts
//
// API client for Audit Explorer v1 (ADMIN_MODULE_FRD.md §12.2, Phase 1).
// Read-only.

import { api } from '@/lib/api/client';

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  requestId: string | null;
  metadata: { capability?: string | null; reason?: string | null; disposition?: string | null; relatedRefs?: Record<string, unknown> | null } | null;
  createdAt: string;
}

export interface AuditExplorerFilters {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  requestId?: string;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
}

export interface AuditExplorerResult {
  items: AuditLogEntry[];
  nextCursor: string | null;
}

export async function queryAdminAuditLog(filters: AuditExplorerFilters): Promise<AuditExplorerResult> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const res = await api.get<AuditExplorerResult>(`/api/admin/audit?${params.toString()}`);
  return res.data;
}
