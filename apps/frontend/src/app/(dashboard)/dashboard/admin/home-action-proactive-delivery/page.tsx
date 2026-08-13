'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  getHomeActionProactiveDeliveryStatus,
  listHomeActionProactiveDeliveryDecisions,
  pauseHomeActionProactiveDelivery,
  resumeHomeActionProactiveDelivery,
} from '@/lib/api/homeActionProactiveDeliveryAdminApi';

// Ask Intelligence FRD §18.3, Phase 9C "rollback dashboard" deliverable,
// scoped to a monitoring view + kill switch -- no launch-gate/approval
// workflow, since this product has no real users yet to gate a rollout
// against (see homeActionProactiveDeliveryKillSwitch.service.ts).
export default function HomeActionProactiveDeliveryAdminPage() {
  const guard = useAdminGuard({
    title: 'Home Action Proactive Delivery',
    subtitle: 'Kill switch and decision monitoring for external Home Action alerts.',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pauseReason, setPauseReason] = useState('');

  const status = useQuery({
    queryKey: ['home-action-proactive-delivery-status'],
    queryFn: getHomeActionProactiveDeliveryStatus,
    enabled: guard.isAdmin,
  });
  const decisions = useQuery({
    queryKey: ['home-action-proactive-delivery-decisions'],
    queryFn: () => listHomeActionProactiveDeliveryDecisions(50),
    enabled: guard.isAdmin,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['home-action-proactive-delivery-status'] }),
      queryClient.invalidateQueries({ queryKey: ['home-action-proactive-delivery-decisions'] }),
    ]);
  };

  const pause = useMutation({
    mutationFn: (reason: string) => pauseHomeActionProactiveDelivery(reason),
    onSuccess: async () => { setPauseReason(''); await refresh(); toast({ title: 'Paused', description: 'Home Action proactive delivery is now paused.' }); },
    onError: (error: Error) => toast({ title: 'Pause failed', description: error.message, variant: 'destructive' }),
  });
  const resume = useMutation({
    mutationFn: () => resumeHomeActionProactiveDelivery(),
    onSuccess: async () => { await refresh(); toast({ title: 'Resumed', description: 'Home Action proactive delivery is no longer paused.' }); },
    onError: (error: Error) => toast({ title: 'Resume failed', description: error.message, variant: 'destructive' }),
  });

  if (guard.status !== 'ready') return guard.node;
  if (status.isLoading) {
    return (
      <AdminConsoleShell title="Home Action Proactive Delivery" subtitle="Loading status.">
        <AdminRouteState state="loading" title="Loading status" description="Reading kill switch state and recent decisions." />
      </AdminConsoleShell>
    );
  }
  if (status.isError || !status.data) {
    return (
      <AdminConsoleShell title="Home Action Proactive Delivery" subtitle="Kill switch and decision monitoring.">
        <AdminRouteState state="error" title="Unable to load status" description={status.error instanceof Error ? status.error.message : 'Status request failed.'} />
      </AdminConsoleShell>
    );
  }

  const { envEnabled, killSwitch, active } = status.data;

  return (
    <AdminConsoleShell
      title="Home Action Proactive Delivery"
      subtitle="Kill switch and decision monitoring for external (email) Home Action alerts."
      chips={
        <span className={cn(
          'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold',
          active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600',
        )}>
          {active ? 'Active' : 'Inactive'}
        </span>
      }
    >
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[15px] font-semibold text-slate-900">Delivery status</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Deploy-time flag</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{envEnabled ? 'Enabled' : 'Disabled'} <span className="text-xs text-slate-400">(HOME_ACTION_PROACTIVE_DELIVERY_ENABLED)</span></dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Kill switch</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{killSwitch.paused ? 'Paused' : 'Not paused'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Effective</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{active ? 'Sends can go out' : 'No sends will go out'}</dd>
          </div>
        </dl>
        {killSwitch.paused && (
          <p className="mt-3 text-xs text-slate-500">
            Paused by {killSwitch.pausedBy ?? 'unknown'} at {killSwitch.pausedAt ? new Date(killSwitch.pausedAt).toLocaleString() : 'unknown time'}
            {killSwitch.reason ? ` — "${killSwitch.reason}"` : ''}.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {killSwitch.paused ? (
            <button
              type="button"
              disabled={resume.isPending}
              onClick={() => resume.mutate()}
              className="min-h-10 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {resume.isPending ? 'Resuming…' : 'Resume delivery'}
            </button>
          ) : (
            <>
              <input
                type="text"
                value={pauseReason}
                onChange={(event) => setPauseReason(event.target.value)}
                placeholder="Reason for pausing"
                className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
              />
              <button
                type="button"
                disabled={pause.isPending || !pauseReason.trim()}
                onClick={() => pause.mutate(pauseReason.trim())}
                className="min-h-10 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pause.isPending ? 'Pausing…' : 'Pause delivery'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Recent decisions</h2>
            <p className="text-[12px] text-slate-500">Every evaluation pass, eligible or not.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {decisions.data?.length ?? 0} recent
          </span>
        </div>
        <div className="p-5">
          {decisions.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !decisions.data?.length ? (
            <p className="text-sm text-slate-500">No evaluation passes have run yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="border-b px-2 py-2 text-xs text-slate-500">When</th>
                    <th className="border-b px-2 py-2 text-xs text-slate-500">Category</th>
                    <th className="border-b px-2 py-2 text-xs text-slate-500">Eligible</th>
                    <th className="border-b px-2 py-2 text-xs text-slate-500">Reason codes</th>
                    <th className="border-b px-2 py-2 text-xs text-slate-500">Escalation</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.data.map((decision) => (
                    <tr key={decision.id}>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-700">{new Date(decision.createdAt).toLocaleString()}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-700">{decision.category}</td>
                      <td className="border-b border-slate-100 px-2 py-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', decision.eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                          {decision.eligible ? 'Sent' : 'Blocked'}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-600">{decision.reasonCodes.join(', ')}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-600">{decision.escalationBudgetBypassed ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminConsoleShell>
  );
}
