'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/audit/page.tsx
//
// Audit Explorer v1 (ADMIN_MODULE_FRD.md §12.2, Phase 1). Read-only,
// filtered, paginated view over the admin audit log. Only surfaces admin
// actions written via adminAudit.service.ts's standardized contract —
// pre-existing bespoke audit paths are not yet migrated into it (§4.4).

import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminAuditLog } from '@/hooks/useAdminAuditExplorer';
import type { AuditExplorerFilters } from '@/lib/api/adminAuditExplorer';

function fmtDate(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
}

export default function AdminAuditExplorerPage() {
  const guard = useAdminGuard({
    title: 'Audit Explorer',
    subtitle: 'Trace admin actions by actor, entity, action, or request.',
  });

  const [draft, setDraft] = useState({ actorId: '', entityType: '', entityId: '', action: '' });
  const [filters, setFilters] = useState<AuditExplorerFilters>({});

  const auditQ = useAdminAuditLog(filters);

  if (guard.status !== 'ready') return guard.node;

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setFilters({
      actorId: draft.actorId.trim() || undefined,
      entityType: draft.entityType.trim() || undefined,
      entityId: draft.entityId.trim() || undefined,
      action: draft.action.trim() || undefined,
      limit: 100,
    });
  }

  const items = auditQ.data?.items ?? [];

  return (
    <AdminConsoleShell
      title="Audit Explorer"
      subtitle="Read-only view of admin actions written through the standardized audit contract."
    >
      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Actor (user id)</label>
          <Input
            value={draft.actorId}
            onChange={(e) => setDraft((d) => ({ ...d, actorId: e.target.value }))}
            className="h-8 w-40 text-xs"
            placeholder="admin user id"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Entity type</label>
          <Input
            value={draft.entityType}
            onChange={(e) => setDraft((d) => ({ ...d, entityType: e.target.value }))}
            className="h-8 w-36 text-xs"
            placeholder="USER, ADMIN_CAPABILITY_GRANT…"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Entity id</label>
          <Input
            value={draft.entityId}
            onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
            className="h-8 w-40 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Action</label>
          <Input
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            className="h-8 w-48 text-xs"
            placeholder="ADMIN_REVOKE_USER_SESSIONS…"
          />
        </div>
        <Button type="submit" size="sm" className="h-8">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          Apply filters
        </Button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {auditQ.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading audit events…
          </div>
        ) : null}

        {auditQ.isError ? (
          <AdminRouteState state="error" title="Failed to load audit log" description="Try adjusting filters or retry." />
        ) : null}

        {!auditQ.isLoading && !auditQ.isError && items.length === 0 ? (
          <AdminRouteState state="empty" title="No matching audit events" description="Try broadening your filters." />
        ) : null}

        {!auditQ.isLoading && !auditQ.isError && items.length > 0 ? (
          <table className="w-full text-left text-[12px]">
            <thead className="border-b border-slate-100 text-[11px] text-slate-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Request</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(item.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{item.userId ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{item.action}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {item.entityType} / <span className="font-mono">{item.entityId}</span>
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-slate-500" title={item.metadata?.reason ?? ''}>
                    {item.metadata?.reason ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{item.requestId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </AdminConsoleShell>
  );
}
