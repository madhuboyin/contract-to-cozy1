'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Badge } from '@/components/ui/badge';

const formatRate = (value: number | null) => value == null ? '—' : `${Math.round(value * 100)}%`;

function statusClass(status: string): string {
  if (status === 'HEALTHY') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'UNKNOWN') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

export default function AdminIntelligenceQualityPage() {
  const guard = useAdminGuard({
    title: 'Intelligence Quality',
    subtitle: 'Capability quality, generated-content evaluations, and source degradation.',
  });
  const quality = useQuery({ queryKey: ['admin-intelligence-quality'], queryFn: () => api.adminGetFeedbackQuality() });
  const health = useQuery({ queryKey: ['admin-source-health'], queryFn: () => api.adminGetSourceHealth() });

  if (guard.status !== 'ready') return guard.node;
  if (quality.isLoading || health.isLoading) {
    return <AdminConsoleShell title="Intelligence Quality" subtitle="Loading quality evidence."><p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading quality and source health…</p></AdminConsoleShell>;
  }
  if (quality.isError || health.isError || !quality.data || !health.data) {
    return <AdminConsoleShell title="Intelligence Quality" subtitle="Capability quality and source health."><AdminRouteState state="error" title="Could not load intelligence quality" description="Confirm analytics and worker-job view permissions, then retry." /></AdminConsoleShell>;
  }

  const failingEvaluations = quality.data.generatedContentEvaluations.filter((evaluation) => !evaluation.passed);
  const degradedSources = health.data.sources.filter((source) => source.status !== 'HEALTHY');
  const summaryCards = [
    ['Capability versions', quality.data.summary.capabilityVersionCount],
    ['Failing evaluations', quality.data.summary.failingEvaluationCount],
    ['Stale / unavailable', quality.data.summary.staleOrUnavailableIncidentCount],
    ['Cross-surface conflicts', quality.data.summary.crossSurfaceInconsistencyCount],
    ['Degraded / unknown sources', degradedSources.length],
  ];

  return (
    <AdminConsoleShell
      title="Intelligence Quality"
      subtitle="Drill down by capability and version, inspect deterministic evaluations, and trace degraded sources to affected experiences."
      chips={<Badge variant="outline">{health.data.summary.healthyCount}/{health.data.summary.total} sources healthy</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-2xl font-semibold text-slate-900">{value}</p><p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p></div>)}
      </div>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Capability and version quality</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Capability</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Useful</th><th className="px-3 py-2">Corrections</th><th className="px-3 py-2">Completion</th><th className="px-3 py-2">Verified outcomes</th><th className="px-3 py-2">Eval pass</th><th className="px-3 py-2">Incidents</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {quality.data.byCapabilityVersion.map((row) => (
                <tr key={`${row.capabilityId}:${row.version}`}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.capabilityId}</td><td className="px-3 py-2 text-slate-500">{row.version}</td><td className="px-3 py-2">{formatRate(row.usefulRate)} <span className="text-slate-400">({row.feedbackCount})</span></td><td className="px-3 py-2">{formatRate(row.correctionRate)}</td><td className="px-3 py-2">{formatRate(row.completionConversionRate)}</td><td className="px-3 py-2">{formatRate(row.verifiedOutcomeRate)}</td><td className="px-3 py-2">{formatRate(row.generatedEvaluationPassRate)} <span className="text-slate-400">({row.generatedEvaluationCount})</span></td><td className="px-3 py-2">{row.staleOutputIncidentCount + row.unavailableOutputIncidentCount + row.crossSurfaceInconsistencyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Generated-content evaluation failures</h2>
        {failingEvaluations.length === 0 ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" />All deterministic evaluation cases pass.</div> : (
          <div className="space-y-2">{failingEvaluations.map((evaluation) => <div key={evaluation.scenarioId} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"><p className="font-semibold">{evaluation.capabilityId} · {evaluation.capabilityVersion} · {evaluation.category}</p><p className="mt-1">{evaluation.details}</p></div>)}</div>
        )}
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Source degradation and blast radius</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {health.data.sources.map((source) => (
            <article key={`${source.domain}:${source.sourceKey}`} className={`rounded-2xl border p-4 ${statusClass(source.status)}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{source.name}</p><p className="mt-0.5 text-[11px] opacity-70">{source.domain} · owner {source.owner}</p></div><Badge variant="outline">{source.status}</Badge></div>
              {source.status !== 'HEALTHY' && <p className="mt-3 flex gap-2 text-xs"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{source.message ?? source.userVisibleDegradationMessage}</p>}
              <p className="mt-3 text-[11px]"><span className="font-semibold">Affected:</span> {source.affectedCapabilityIds.join(', ')}</p>
              <p className="mt-1 text-[11px]"><span className="font-semibold">Fallback:</span> {source.fallbackBehavior}</p>
              <p className="mt-2 text-[11px]"><span className="font-semibold">Runbook:</span> {source.operationalRunbook}</p>
            </article>
          ))}
        </div>
      </section>
    </AdminConsoleShell>
  );
}
