// apps/frontend/src/components/ops/worker-jobs/JobsTable.tsx
//
// Dense table/list view — an alternative to the card grid for scanning many
// jobs or triaging failures at once.

'use client';

import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { WorkerJobDetail } from '@/lib/api/adminWorkerJobs';
import {
  getHealth,
  getTriggerType,
  timeAgo,
  HEALTH_DOT,
  RUN_BAR_COLOR,
} from './workerJobsUtils';

export function JobsTable({
  jobs,
  onTrigger,
  triggeringKey,
  triggeredKey,
}: {
  jobs: WorkerJobDetail[];
  onTrigger: (key: string, dryRun?: boolean, propertyId?: string) => void;
  triggeringKey: string | null;
  triggeredKey: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-6 px-3" />
            <TableHead className="h-8 px-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Job</TableHead>
            <TableHead className="h-8 px-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Type</TableHead>
            <TableHead className="h-8 px-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Last run</TableHead>
            <TableHead className="h-8 px-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Recent</TableHead>
            <TableHead className="h-8 px-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Fail / OK</TableHead>
            <TableHead className="h-8 px-2 text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const health = getHealth(job.recentRuns);
            const lastRun = job.recentRuns[0] ?? null;
            const triggerType = getTriggerType(job);
            const triggering = triggeringKey === job.key;
            const triggerSuccess = triggeredKey === job.key;
            const failureCount = job.queueStats?.failed ?? null;
            const successCount = job.queueStats?.completed ?? null;

            return (
              <TableRow key={job.key} className="border-slate-100">
                <TableCell className="px-3 py-2">
                  <span className={`block h-2 w-2 rounded-full ${HEALTH_DOT[health]}`} />
                </TableCell>
                <TableCell className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[220px] truncate text-[12.5px] font-semibold text-slate-900" title={job.name}>
                      {job.name}
                    </span>
                    {!job.effectiveEnabled && (
                      <span
                        className="shrink-0 rounded bg-slate-800 px-1 py-0.5 text-[9.5px] font-semibold text-white"
                        title={job.disabledReason}
                      >
                        Disabled
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-2 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                      triggerType === 'Queue'
                        ? 'bg-blue-50 text-blue-700'
                        : triggerType === 'Event-driven'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {triggerType}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap px-2 py-2 text-[11px]">
                  {lastRun ? (
                    <span className="flex items-center gap-1">
                      {lastRun.status === 'completed' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-rose-500" />
                      )}
                      <span className={lastRun.status === 'failed' ? 'font-semibold text-rose-600' : 'text-slate-600'}>
                        {lastRun.status === 'completed' ? 'Success' : 'Failed'}
                      </span>
                      <span className="text-slate-400">· {timeAgo(lastRun.finishedAt)}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Never run</span>
                  )}
                </TableCell>
                <TableCell className="px-2 py-2">
                  {job.recentRuns.length > 0 ? (
                    <div className="flex gap-0.5" title={`Last ${job.recentRuns.length} run(s)`}>
                      {job.recentRuns.slice(0, 8).map((run) => (
                        <span
                          key={run.id}
                          className={`h-1.5 w-2.5 rounded-full ${RUN_BAR_COLOR[run.status]}`}
                          title={`${run.status} · ${timeAgo(run.finishedAt)}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-300">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-slate-400">
                  {failureCount !== null ? (
                    <>
                      <span className={failureCount > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>{failureCount}</span>
                      {' / '}
                      {successCount ?? 0}
                    </>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="px-2 py-2 text-right">
                  {job.triggerSupported ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 rounded px-2 text-[10.5px] font-semibold"
                      disabled={triggering}
                      onClick={() => onTrigger(job.key, job.supportsDryRun ? true : undefined)}
                    >
                      {triggering ? (
                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                      ) : triggerSuccess ? (
                        <CheckCircle2 className="mr-1 h-2.5 w-2.5 text-emerald-500" />
                      ) : (
                        <Play className="mr-1 h-2.5 w-2.5" />
                      )}
                      {triggerSuccess ? 'Queued' : job.supportsDryRun ? 'Dry Run' : 'Run'}
                    </Button>
                  ) : (
                    <span className="text-[11px] text-slate-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
