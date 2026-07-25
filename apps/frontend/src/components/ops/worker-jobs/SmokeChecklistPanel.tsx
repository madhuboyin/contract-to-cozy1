// apps/frontend/src/components/ops/worker-jobs/SmokeChecklistPanel.tsx
//
// W6 smoke checklist — prerequisites / planned effects / actual result for
// the 4 representative jobs. Reuses the existing dry-run trigger +
// recentRuns plumbing rather than inventing a parallel surface. "Planned
// effects" is the dry-run trigger's returned WorkerRunResult (surfaced via
// recentRuns once the BullMQ job completes); "actual result" is the same
// recentRuns list for a non-dry-run scoped trigger.

'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { usePreviewSmokeCleanup, useDeleteSmokeCleanup } from '@/hooks/useAdminWorkerJobs';
import type { WorkerJobDetail } from '@/lib/api/adminWorkerJobs';

export function SmokeChecklistPanel({
  job,
  onRunScopedLive,
  triggering,
}: {
  job: WorkerJobDetail;
  onRunScopedLive: (propertyId?: string) => void;
  triggering: boolean;
}) {
  const [propertyId, setPropertyId] = useState('');
  const preview = usePreviewSmokeCleanup();
  const del = useDeleteSmokeCleanup();
  const { toast } = useToast();

  const lastRun = job.recentRuns[0] ?? null;
  const lastResult = (lastRun?.result ?? null) as { smokeCorrelationId?: string } | null;
  const correlationId = lastResult?.smokeCorrelationId;

  const prereqs: Array<{ label: string; ok: boolean }> = [
    { label: 'Dry-run supported', ok: job.supportsDryRun },
    { label: 'Job enabled', ok: job.effectiveEnabled },
    { label: 'Smoke allowlists configured', ok: job.smokeAllowlistConfigured },
  ];

  function handleCleanup() {
    if (!correlationId) return;
    preview.mutate(correlationId, {
      onSuccess: (data) => {
        const total = data.notificationIds.length + data.mortgageRateSnapshotIds.length;
        if (total === 0) {
          toast({ title: 'Nothing to clean up', description: 'No records found for this correlation ID.' });
          return;
        }
        del.mutate(correlationId, {
          onSuccess: () => toast({ title: 'Cleaned up', description: `Deleted ${total} record(s).` }),
          onError: (err: any) => toast({ title: 'Cleanup failed', description: err?.message, variant: 'destructive' }),
        });
      },
      onError: (err: any) => toast({ title: 'Preview failed', description: err?.message, variant: 'destructive' }),
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-2.5">
      <p className="mb-1.5 text-[11px] font-semibold tracking-normal text-slate-500">Smoke checklist</p>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {prereqs.map((p) => (
          <span key={p.label} className="flex items-center gap-1">
            {p.ok ? (
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
            ) : (
              <XCircle className="h-2.5 w-2.5 text-rose-400" />
            )}
            <span className={p.ok ? 'text-slate-500' : 'text-rose-600'}>{p.label}</span>
          </span>
        ))}
      </div>

      {job.supportsPropertyScope && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Allowlisted property ID"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="h-6 flex-1 rounded border border-slate-300 px-1.5 text-[11px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-6 shrink-0 rounded px-2 text-[10px] font-semibold"
            disabled={triggering || !propertyId.trim()}
            onClick={() => onRunScopedLive(propertyId.trim())}
          >
            Run scoped live
          </Button>
        </div>
      )}

      {lastRun && (
        <div className="mt-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">Last result{lastRun.dryRun ? ' (dry run)' : ''}:</span>{' '}
          <span className="font-mono text-slate-500">
            {lastResult ? JSON.stringify(lastResult) : '—'}
          </span>
        </div>
      )}

      {correlationId && (
        <Button
          size="sm"
          variant="outline"
          className="mt-1.5 h-6 rounded px-2 text-[10px] font-semibold"
          disabled={preview.isPending || del.isPending}
          onClick={handleCleanup}
        >
          {preview.isPending || del.isPending ? 'Cleaning up...' : 'Clean up this run'}
        </Button>
      )}
    </div>
  );
}
