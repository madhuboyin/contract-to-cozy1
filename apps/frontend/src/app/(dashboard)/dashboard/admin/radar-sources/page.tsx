'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Pause, Play, Radar, RefreshCw, RotateCcw, TestTube2 } from 'lucide-react';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  useAdminRadarAnomalies,
  useAdminRadarCommand,
  useAdminRadarSources,
} from '@/hooks/useAdminRadarSources';
import type { RadarSourceAdmin } from '@/lib/api/adminRadarSources';
import { api } from '@/lib/api/client';

type LocalChangeQuality = {
  pilotFamilies: string[];
  syntheticCoverageAllowed: false;
  activationRule: string;
  sources: Array<{
    id: string;
    key: string;
    family: string;
    provider: string;
    reviewedStatus: string;
    activation: { enabled: boolean; reasonCodes: string[] };
    _count: { observations: number };
    coverages: Array<{
      id: string;
      geographyType: string;
      geographyKey: string | null;
      status: string;
      health: { state: string; checkedThrough: string | null; reasonCodes: string[] };
    }>;
    runs: Array<{
      id: string;
      status: string;
      startedAt: string;
      recordsAccepted: number;
      recordsRejected: number;
    }>;
  }>;
};

const HEALTH_CLASS: Record<string, string> = {
  healthy: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-slate-100 text-slate-700',
  disabled: 'bg-slate-100 text-slate-500',
  failed: 'bg-rose-50 text-rose-700',
  degraded: 'bg-amber-50 text-amber-700',
  stale: 'bg-amber-50 text-amber-700',
  unknown: 'bg-sky-50 text-sky-700',
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function SourceCard({
  source,
  onError,
}: {
  source: RadarSourceAdmin;
  onError: (error: unknown) => void;
}) {
  const commands = useAdminRadarCommand();
  const [expanded, setExpanded] = useState(false);
  const busy =
    commands.testFetch.isPending ||
    commands.run.isPending ||
    commands.pause.isPending ||
    commands.replay.isPending;

  const testFetch = () => {
    commands.testFetch.mutate({ sourceKey: source.key }, { onError });
  };
  const scopedRun = () => {
    const propertyId = window.prompt('Property UUID for this scoped run');
    if (propertyId?.trim()) {
      commands.run.mutate({ sourceKey: source.key, propertyId: propertyId.trim() }, { onError });
    }
  };
  const togglePause = () => {
    const paused = !source.operationsPausedAt;
    const reason = window.prompt(
      paused ? 'Why is this source being paused?' : 'Why is this source being resumed?',
    );
    if (reason?.trim()) {
      commands.pause.mutate({ sourceKey: source.key, paused, reason: reason.trim() }, { onError });
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{source.name}</h2>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${HEALTH_CLASS[source.effectiveHealth.status] ?? HEALTH_CLASS.unknown}`}>
              {source.effectiveHealth.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {source.key} · {source.provider} · adapter {source.adapterVersion}
          </p>
          <p className="mt-2 text-xs text-slate-600">{source.coverageDescription}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" disabled={busy || !source.operationsSupported || Boolean(source.operationsPausedAt)} onClick={testFetch}>
            <TestTube2 className="mr-1 h-3.5 w-3.5" /> Test fetch
          </Button>
          <Button variant="outline" size="sm" disabled={busy || !source.operationsSupported || Boolean(source.operationsPausedAt)} onClick={scopedRun}>
            <Play className="mr-1 h-3.5 w-3.5" /> Scoped run
          </Button>
          <Button variant={source.operationsPausedAt ? 'default' : 'destructive'} size="sm" disabled={busy || !source.isEnabled} onClick={togglePause}>
            {source.operationsPausedAt ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
            {source.operationsPausedAt ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <div><span className="text-slate-400">Events</span><p className="font-semibold">{source._count.events}</p></div>
        <div><span className="text-slate-400">Runs</span><p className="font-semibold">{source._count.runs}</p></div>
        <div><span className="text-slate-400">Coverage rules</span><p className="font-semibold">{source.coverage.length}</p></div>
        <div><span className="text-slate-400">Covered homes</span><p className="font-semibold">{source._count.propertyCoverage}</p></div>
        <div><span className="text-slate-400">Last success</span><p className="font-semibold">{formatDate(source.health?.lastSuccessAt)}</p></div>
      </div>

      {source.operationsPausedAt ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          Paused {formatDate(source.operationsPausedAt)}: {source.operationsPauseReason}
        </p>
      ) : null}
      {source.health?.message ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{source.health.message}</p>
      ) : null}

      <button className="mt-3 text-xs font-semibold text-sky-700" onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Hide' : 'Show'} coverage and run history
      </button>
      {expanded ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-700">Coverage</h3>
            <ul className="mt-1 space-y-1 text-xs text-slate-500">
              {source.coverage.map((item) => (
                <li key={item.id} className="rounded bg-slate-50 px-2 py-1">
                  {item.coverageType}: {[item.countryCode, item.stateCode, item.cityName, item.countyFips, item.postalCode].filter(Boolean).join(' / ') || 'all'}
                </li>
              ))}
              {!source.coverage.length ? <li>No coverage rules configured.</li> : null}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-700">Recent runs</h3>
            <ul className="mt-1 space-y-1">
              {source.runs.slice(0, 10).map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs">
                  <span><b>{run.status}</b> · {formatDate(run.startedAt)} · {run.observationsReceived} observations</span>
                  {run.status !== 'started' ? (
                    <Button variant="ghost" size="sm" disabled={busy || Boolean(source.operationsPausedAt)} onClick={() => commands.replay.mutate(run.id, { onError })}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
              {!source.runs.length ? <li className="text-xs text-slate-500">No source runs recorded.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function RadarSourcesPage() {
  const guard = useAdminGuard({
    title: 'Radar Source Operations',
    subtitle: 'Source health, coverage, safe execution, and incident controls.',
  });
  const sources = useAdminRadarSources(guard.isAdmin);
  const anomalies = useAdminRadarAnomalies(guard.isAdmin);
  const localChangeQuality = useQuery({
    queryKey: ['admin-around-your-home-quality'],
    queryFn: async () => {
      const response = await api.get('/api/admin/around-your-home/quality');
      return response.data as LocalChangeQuality;
    },
    enabled: guard.isAdmin,
  });
  const { toast } = useToast();
  const lineage = useAdminRadarCommand().lineage;
  const [eventId, setEventId] = useState('');
  const refresh = () => {
    sources.refetch();
    anomalies.refetch();
    localChangeQuality.refetch();
  };
  const onError = (error: any) => toast({
    title: 'Radar operation failed',
    description: error?.message ?? 'The operation could not be completed.',
    variant: 'destructive',
  });

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Radar Source Operations"
      subtitle="Monitor ingestion health and coverage, safely test sources, replay runs, and stop a provider."
      actions={<Button variant="outline" size="sm" onClick={refresh} disabled={sources.isFetching}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sources.isFetching ? 'animate-spin' : ''}`} />Refresh</Button>}
      chips={<><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">{sources.data?.length ?? 0} sources</span><span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{anomalies.data?.anomalies.length ?? 0} anomalies</span></>}
    >
      <section className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Around Your Home source quality</h2>
            <p className="mt-1 max-w-3xl text-xs text-slate-600">
              Planning, infrastructure, land-use, flood-map, and school sources on the reviewed
              Property Intelligence foundation.
            </p>
          </div>
          <span className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
            Synthetic coverage prohibited
          </span>
        </div>
        {localChangeQuality.isLoading ? (
          <p className="mt-3 text-xs text-slate-500">Loading reviewed local-change sources…</p>
        ) : localChangeQuality.isError ? (
          <p className="mt-3 text-xs text-rose-700">
            Quality data is unavailable. Confirm MFA and the INTEGRATION_MANAGE capability.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-slate-600">
              {localChangeQuality.data?.activationRule}
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {(localChangeQuality.data?.sources ?? []).map((source) => {
                const rejected = source.runs.reduce(
                  (total, run) => total + run.recordsRejected,
                  0,
                );
                return (
                  <article key={source.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">{source.provider}</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {source.key} · {source.family} · {source.reviewedStatus}
                        </p>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        source.activation.enabled
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {source.activation.enabled ? 'Activated' : 'Blocked'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                      <div><span className="text-slate-400">Observations</span><p className="font-semibold">{source._count.observations}</p></div>
                      <div><span className="text-slate-400">Coverage</span><p className="font-semibold">{source.coverages.length}</p></div>
                      <div><span className="text-slate-400">Rejected</span><p className="font-semibold">{rejected}</p></div>
                    </div>
                    <ul className="mt-3 space-y-1 text-[11px] text-slate-600">
                      {source.coverages.map((coverage) => (
                        <li key={coverage.id} className="rounded bg-slate-50 px-2 py-1">
                          {coverage.geographyType} {coverage.geographyKey ?? 'missing key'}
                          {' · '}{coverage.health.state}
                          {coverage.health.checkedThrough
                            ? ` · checked ${formatDate(coverage.health.checkedThrough)}`
                            : ' · never checked'}
                        </li>
                      ))}
                      {!source.coverages.length ? <li>No QA-reviewed geography is configured.</li> : null}
                    </ul>
                    {!source.activation.enabled ? (
                      <p className="mt-2 text-[11px] text-amber-800">
                        {source.activation.reasonCodes.join(', ')}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {!localChangeQuality.data?.sources.length ? (
              <p className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
                No local-change pilot source is registered. Register an authoritative provider;
                do not substitute fixture or synthetic coverage.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-xs font-semibold text-slate-800">Event lineage inspector</h2>
        <form
          className="mt-2 flex max-w-2xl gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (eventId.trim()) lineage.mutate(eventId.trim(), { onError });
          }}
        >
          <Input
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            placeholder="Canonical Radar event UUID"
            className="h-9 text-xs"
          />
          <Button type="submit" size="sm" disabled={!eventId.trim() || lineage.isPending}>
            Trace
          </Button>
        </form>
        {lineage.data ? (
          <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
            <div className="sm:col-span-2">
              <span className="text-slate-400">Event</span>
              <p className="font-semibold text-slate-800">{lineage.data.title}</p>
              <p className="text-slate-500">{lineage.data.id} · {lineage.data.status}</p>
            </div>
            <div>
              <span className="text-slate-400">Source / run</span>
              <p className="font-semibold">{lineage.data.sourceDefinition?.name ?? 'Legacy source'}</p>
              <p className="text-slate-500">{lineage.data.sourceRun?.status ?? 'No linked run'}</p>
            </div>
            <div>
              <span className="text-slate-400">Downstream lineage</span>
              <p className="font-semibold">{lineage.data.revisions.length} revisions · {lineage.data.propertyMatches.length} matches</p>
              <p className="text-slate-500">{lineage.data.propertyMatches.filter((match) => match.incident).length} incidents · {lineage.data.propertyMatches.reduce((sum, match) => sum + match._count.notificationDecisions, 0)} decisions</p>
            </div>
          </div>
        ) : null}
      </section>
      {(anomalies.data?.anomalies.length ?? 0) > 0 ? (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />Operational anomalies</h2>
          <ul className="mt-2 space-y-1 text-xs text-amber-800">
            {anomalies.data!.anomalies.map((item, index) => <li key={`${item.type}-${item.sourceKey}-${index}`}><b>{item.sourceKey}</b>: {item.detail}</li>)}
          </ul>
        </section>
      ) : null}
      {sources.isLoading ? <AdminRouteState state="loading" title="Loading Radar sources" description="Reading source health and recent runs." /> : null}
      {sources.isError ? <AdminRouteState state="error" title="Unable to load Radar sources" description="Check API and database connectivity, then retry." /> : null}
      {!sources.isLoading && !sources.isError && !sources.data?.length ? <AdminRouteState state="empty" title="No Radar sources registered" description="Run a reviewed source adapter to register its definition." /> : null}
      <div className="space-y-3">
        {(sources.data ?? []).map((source) => <SourceCard key={source.id} source={source} onError={onError} />)}
      </div>
    </AdminConsoleShell>
  );
}
