'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  useAdminOwnershipCostLaunchGate,
  useAdminOwnershipCostOperations,
  useOwnershipCostReplay,
} from '@/hooks/useAdminOwnershipCosts';

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </article>
  );
}

function label(value: string) {
  return value.toLowerCase().replaceAll('_', ' ');
}

export default function OwnershipCostOperationsPage() {
  const guard = useAdminGuard({
    title: 'Ownership Cost Operations',
    subtitle: 'Source health, calculation integrity, outcomes, replay, and launch readiness.',
  });
  const [windowDays, setWindowDays] = useState(30);
  const operations = useAdminOwnershipCostOperations(guard.isAdmin, windowDays);
  const launchGate = useAdminOwnershipCostLaunchGate(guard.isAdmin);
  const replay = useOwnershipCostReplay();
  const [propertyId, setPropertyId] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [methodVersion, setMethodVersion] = useState('');

  if (guard.status !== 'ready') return guard.node;

  const dashboard = operations.data;
  const gate = launchGate.data;
  const critical = dashboard?.anomalies.filter(
    (item) => item.severity === 'CRITICAL',
  ).length ?? 0;
  const refresh = () => {
    void operations.refetch();
    void launchGate.refetch();
  };

  return (
    <AdminConsoleShell
      title="Ownership Cost Operations"
      subtitle="Explain canonical results without exposing homeowner facts, review anomalies, replay retained calculations, and verify launch containment."
      actions={(
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={operations.isFetching || launchGate.isFetching}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${
            operations.isFetching || launchGate.isFetching ? 'animate-spin' : ''
          }`} />
          Refresh
        </Button>
      )}
      chips={(
        <>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            gate?.state === 'READY'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-800'
          }`}>
            Launch {gate?.state?.toLowerCase() ?? 'checking'}
          </span>
          <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
            {critical} critical anomalies
          </span>
        </>
      )}
    >
      <div className="mb-4 flex items-center justify-end gap-2">
        <label htmlFor="ownership-cost-window" className="text-xs font-medium text-slate-600">
          Reporting window
        </label>
        <select
          id="ownership-cost-window"
          value={windowDays}
          onChange={(event) => setWindowDays(Number(event.target.value))}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs"
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {operations.isLoading || launchGate.isLoading ? (
        <AdminRouteState state="loading" title="Loading ownership-cost operations" description="Reading source, calculation, action, and launch evidence." />
      ) : null}
      {operations.isError || launchGate.isError ? (
        <AdminRouteState state="error" title="Unable to load ownership-cost operations" description="Check API authorization and database connectivity, then retry." />
      ) : null}

      {dashboard ? (
        <>
          <section aria-label="Ownership cost operational totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Properties observed" value={dashboard.sourceCoverage.propertiesObserved} detail={`${dashboard.sourceCoverage.observations} canonical observations`} />
            <Metric label="Canonical snapshots" value={dashboard.calculations.snapshotCount} detail={`${dashboard.calculations.coverage.CREDIBLE ?? 0} credible`} />
            <Metric label="Stale properties" value={dashboard.staleness.stalePropertyCount} detail={`Review after ${dashboard.staleness.staleAfterHours} hours`} />
            <Metric label="Persisted adapter failures" value={dashboard.calculations.persistedAdapterFailures} detail={`${dashboard.calculations.definitionMismatchCount} definition mismatches`} />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Source coverage</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                {Object.entries(dashboard.sourceCoverage.adapterRuns).map(([status, count]) => (
                  <div key={status} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">{label(status)}</p>
                    <p className="mt-1 text-lg font-semibold">{count}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Expected adapters: {dashboard.sourceCoverage.expectedAdapters.join(', ')}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Action funnel</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
                {([
                  ['Decisions', dashboard.actionFunnel.decisionsRecorded],
                  ['Engaged', dashboard.actionFunnel.engaged],
                  ['Handoffs', dashboard.actionFunnel.planningHandoffs],
                  ['Resolved', dashboard.actionFunnel.resolvedOutcomes],
                  ['Dismissed', dashboard.actionFunnel.dismissedOrNoAction],
                ] as const).map(([name, value]) => (
                  <div key={name} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">{name}</p>
                    <p className="mt-1 text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">{dashboard.actionFunnel.rule}</p>
            </article>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Operational anomalies
            </h2>
            {dashboard.anomalies.length ? (
              <ul className="mt-3 space-y-2">
                {dashboard.anomalies.map((item, index) => (
                  <li
                    key={`${item.type}-${item.propertyId ?? item.adapterKey ?? index}`}
                    className={`rounded-xl border p-3 text-xs ${
                      item.severity === 'CRITICAL'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span className="font-semibold">{item.severity} · {label(item.type)}</span>
                    <p className="mt-1">{item.detail}</p>
                    {item.propertyId ? <p className="mt-1 font-mono text-[10px]">Property: {item.propertyId}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> No anomalies in this window.
              </p>
            )}
          </section>
        </>
      ) : null}

      {gate ? (
        <section className={`mt-4 rounded-2xl border p-4 ${
          gate.state === 'READY'
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50'
        }`}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" /> Real-user launch gate: {gate.state}
          </h2>
          {gate.blockers.length ? (
            <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {gate.blockers.map((blocker) => (
                <li key={blocker} className="rounded-lg bg-white/70 px-3 py-2">
                  {label(blocker)}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs">Every technical, evidence, operational, and named governance gate is recorded.</p>}
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <RotateCcw className="h-4 w-4" /> Read-only retained calculation replay
        </h2>
        <form
          className="mt-3 grid gap-3 lg:grid-cols-[1fr_2fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            replay.mutate({ propertyId, inputFingerprint: fingerprint, methodVersion });
          }}
        >
          <Input aria-label="Replay property ID" placeholder="Property ID" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required />
          <Input aria-label="Replay input fingerprint" placeholder="64-character input fingerprint" minLength={64} maxLength={64} value={fingerprint} onChange={(event) => setFingerprint(event.target.value)} required />
          <Input aria-label="Replay method version" placeholder="Method version" value={methodVersion} onChange={(event) => setMethodVersion(event.target.value)} required />
          <Button type="submit" disabled={replay.isPending}>Replay</Button>
        </form>
        {replay.isError ? <p role="alert" className="mt-3 text-xs text-rose-700">Replay failed. Verify the retained identifiers and method version.</p> : null}
        {replay.data ? (
          <p className={`mt-3 text-xs ${replay.data.reproduced ? 'text-emerald-700' : 'text-amber-800'}`}>
            {replay.data.reproduced ? 'Calculation reproduced exactly.' : `Drift detected: ${replay.data.differences.join(', ')}`}
            {' '}No mutation was performed.
          </p>
        ) : null}
      </section>
    </AdminConsoleShell>
  );
}
