'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/work-queues/page.tsx
//
// Admin-only operational work-queues overview (ADMIN_MODULE_FRD.md Phase 2).
// One glance at every actionable admin queue, each linking to its workspace.
// Counts refresh automatically; each linked workspace enforces its own
// capability when opened.

import React from 'react';
import Link from 'next/link';
import { Inbox, Loader2 } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { useAdminWorkQueues } from '@/hooks/useAdminWorkQueues';

function fmtTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', { timeStyle: 'medium' });
}

export default function AdminWorkQueuesPage() {
  const guard = useAdminGuard({
    title: 'Work Queues',
    subtitle: 'Every actionable admin queue at a glance.',
  });

  const queuesQ = useAdminWorkQueues();

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Work Queues"
      subtitle="Where admin work is waiting. Counts refresh every minute; each queue links to its workspace."
      chips={
        queuesQ.data ? (
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            <Inbox className="h-3 w-3" />
            As of {fmtTime(queuesQ.data.generatedAt)}
          </span>
        ) : undefined
      }
    >
      {queuesQ.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading queues…
        </div>
      ) : null}

      {queuesQ.isError ? (
        <AdminRouteState
          state="error"
          title="Failed to load work queues"
          description="The request failed. Refresh to try again."
        />
      ) : null}

      {queuesQ.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {queuesQ.data.queues.map((q) => (
            <Link
              key={q.key}
              href={q.href}
              className={`rounded-2xl border p-4 shadow-sm transition-colors hover:border-slate-300 ${
                q.count > 0 ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60'
              }`}
            >
              <p className={`text-2xl font-semibold ${q.count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                {q.count}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">{q.label}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">{q.capability}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </AdminConsoleShell>
  );
}
