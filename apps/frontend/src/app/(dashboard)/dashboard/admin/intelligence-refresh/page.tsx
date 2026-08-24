'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCcw, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminIntelligenceRefreshPage() {
  const guard = useAdminGuard({
    title: 'Intelligence Refresh',
    subtitle: 'Inspect and recover property intelligence projections.',
  });
  const [propertyInput, setPropertyInput] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const details = useQuery({
    queryKey: ['admin-intelligence-refresh', propertyId],
    queryFn: () => api.adminGetIntelligenceRefreshDetails(propertyId),
    enabled: Boolean(propertyId),
    refetchInterval: (query) => query.state.data?.state === 'REFRESHING' ? 5_000 : false,
  });
  const refresh = useMutation({
    mutationFn: () => api.adminTriggerIntelligenceRefresh(propertyId),
    onSuccess: () => void details.refetch(),
  });
  const retry = useMutation({
    mutationFn: ({ runId, targetId }: { runId: string; targetId: string }) => api.adminRetryIntelligenceTarget(runId, targetId),
    onSuccess: () => void details.refetch(),
  });

  if (guard.status !== 'ready') return guard.node;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPropertyId(propertyInput.trim());
  };

  return (
    <AdminConsoleShell
      title="Intelligence Refresh"
      subtitle="View capability-level currentness, request a full refresh, and retry isolated failures."
      chips={details.data ? <Badge variant="outline">{details.data.state.replaceAll('_', ' ')}</Badge> : undefined}
    >
      <form onSubmit={submit} className="flex max-w-2xl gap-2">
        <Input value={propertyInput} onChange={(event) => setPropertyInput(event.target.value)} placeholder="Property ID" aria-label="Property ID" />
        <Button type="submit" disabled={!propertyInput.trim()}>Inspect</Button>
      </form>

      {details.isLoading && <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading currentness…</p>}
      {details.isError && <div className="mt-6"><AdminRouteState state="error" title="Could not load intelligence currentness" description="Check the property ID and your worker-job permissions." /></div>}

      {details.data && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm font-semibold text-slate-900">Property {details.data.propertyId}</p><p className="text-xs text-slate-500">{details.data.capabilities.length} materialized capability targets</p></div>
            <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Full refresh
            </Button>
          </div>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Capability currentness</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {details.data.capabilities.map((capability) => (
                <div key={`${capability.consumerKey}:${capability.targetKey}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">{capability.consumerKey}</p><Badge variant="outline">{capability.status}</Badge></div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{capability.targetKey}</p>
                  {capability.lastError && <p className="mt-2 text-xs text-rose-700">{capability.lastError}</p>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent runs</h2>
            <div className="space-y-3">
              {details.data.recentRuns.map((run) => (
                <div key={run.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">{run.triggerType} · {new Date(run.requestedAt).toLocaleString()}</p><Badge variant="outline">{run.status}</Badge></div>
                  <div className="mt-2 space-y-1">
                    {run.targets.filter((target) => target.status === 'FAILED').map((target) => (
                      <div key={target.id} className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">
                        <span>{target.consumerKey} · {target.lastError ?? 'Failed without an error message'}</span>
                        <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate({ runId: run.id, targetId: target.id })}><RotateCcw className="mr-1 h-3 w-3" />Retry</Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AdminConsoleShell>
  );
}
