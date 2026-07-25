'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/release-gates/page.tsx
//
// Admin-only Release Gates workspace (ADMIN_MODULE_FRD.md §10.9, Phase 5).
// Read-only UI over the existing /api/admin/release-gates API
// (RELEASE_GATE_VIEW): per-tool gate status, rollout cohort, and blocking
// issues. Gate rules live server-side (flag registry + incident checks).

import React from 'react';
import { Loader2, RefreshCw, ShieldEllipsis } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReleaseGateSummary } from '@/hooks/useAdminPlatformOps';

const COHORT_BADGE: Record<string, string> = {
  DISABLED: 'bg-slate-100 text-slate-600',
  INTERNAL: 'bg-indigo-50 text-indigo-700',
  BETA: 'bg-amber-50 text-amber-700',
  FULL: 'bg-emerald-50 text-emerald-700',
};

function fmtDate(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminReleaseGatesPage() {
  const guard = useAdminGuard({
    title: 'Release Gates',
    subtitle: 'Per-tool release gate status across the platform.',
  });

  const summaryQ = useReleaseGateSummary();

  if (guard.status !== 'ready') return guard.node;

  const s = summaryQ.data;

  return (
    <AdminConsoleShell
      title="Release Gates"
      subtitle="Per-tool rollout status. A gate fails when its flag is missing or the tool has active/critical incidents in the last 24 hours."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <ShieldEllipsis className="h-3 w-3" />
          {s ? `${s.passing}/${s.totalTools} passing` : 'Loading…'}
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {s
          ? Object.entries(s.byRolloutCohort).map(([cohort, count]) => (
              <span key={cohort} className={`rounded px-2 py-0.5 text-[11px] font-semibold ${COHORT_BADGE[cohort] ?? 'bg-slate-100 text-slate-600'}`}>
                {cohort}: {count}
              </span>
            ))
          : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8"
          onClick={() => summaryQ.refetch()}
          disabled={summaryQ.isFetching}
        >
          {summaryQ.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Re-check all gates
        </Button>
      </div>

      {s ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={s.operationalControls.releaseReady
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'}
            >
              Real-user launch {s.operationalControls.releaseReady ? 'ready' : 'blocked'}
            </Badge>
            <Badge className={s.operationalControls.releaseMode === 'REAL_USER_LAUNCH'
              ? 'bg-sky-50 text-sky-700'
              : 'bg-amber-50 text-amber-700'}
            >
              Mode {s.operationalControls.releaseMode === 'REAL_USER_LAUNCH'
                ? 'real-user'
                : 'internal beta'}
            </Badge>
            <Badge className={s.operationalControls.globalEnabled
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'}
            >
              Discovery {s.operationalControls.globalEnabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge className={s.operationalControls.releaseGateEnforced
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'}
            >
              Release gates {s.operationalControls.releaseGateEnforced ? 'enforced' : 'advisory'}
            </Badge>
            <Badge className={s.operationalControls.rolloutKeyParity.valid
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'}
            >
              Rollout parity {s.operationalControls.rolloutKeyParity.valid ? 'valid' : 'invalid'}
            </Badge>
            <Badge className={s.operationalControls.registryVersionMatches
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'}
            >
              Registry {s.operationalControls.registryVersionMatches ? 'matched' : 'mismatch'}
            </Badge>
            <Badge className={s.operationalControls.configurationValid
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'}
            >
              Configuration {s.operationalControls.configurationValid ? 'valid' : 'invalid'}
            </Badge>
          </div>
          <p className="mt-3 font-mono text-[11px] text-slate-500">
            Registry {s.operationalControls.registryVersion}
            {s.operationalControls.expectedRegistryVersion
              ? ` · expected ${s.operationalControls.expectedRegistryVersion}`
              : ' · no deployment pin'}
          </p>
          {!s.operationalControls.releaseReady ? (
            <p className="mt-2 text-xs font-medium text-rose-700">
              Launch blockers: {s.operationalControls.releaseBlockers.join(', ') || 'unknown policy failure'}
            </p>
          ) : null}
          {[
            ['Disabled capabilities', s.operationalControls.disabledCapabilityIds],
            ['Broken-route suppression', s.operationalControls.brokenRouteCapabilityIds],
            ['Release-gate blocks', s.operationalControls.releaseGateBlockedCapabilityIds],
          ].map(([label, values]) => (
            (values as string[]).length > 0 ? (
              <p key={label as string} className="mt-2 text-xs text-slate-600">
                <span className="font-semibold">{label as string}:</span>{' '}
                {(values as string[]).join(', ')}
              </p>
            ) : null
          ))}
          {s.operationalControls.manifestVersionMismatches.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-rose-700">
              Manifest pin mismatch:{' '}
              {s.operationalControls.manifestVersionMismatches.map((entry) =>
                `${entry.capabilityId} (current ${entry.currentVersion}, expected ${entry.expectedVersion})`,
              ).join(', ')}
            </p>
          ) : null}
          {s.operationalControls.invalidManifestVersionEntries.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-rose-700">
              Invalid manifest pins: {s.operationalControls.invalidManifestVersionEntries.join(', ')}
            </p>
          ) : null}
          {s.operationalControls.invalidConfigurationEntries.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-rose-700">
              Invalid configuration: {s.operationalControls.invalidConfigurationEntries.join(', ')}
            </p>
          ) : null}
          {!s.operationalControls.rolloutKeyParity.valid ? (
            <p className="mt-2 text-xs font-medium text-rose-700">
              Missing rollout keys: {s.operationalControls.rolloutKeyParity.missingKeys.join(', ') || 'none'}.
              {' '}Unknown rollout keys: {s.operationalControls.rolloutKeyParity.unknownKeys.join(', ') || 'none'}.
            </p>
          ) : null}
        </div>
      ) : null}

      {summaryQ.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking gates…
        </div>
      ) : null}

      {summaryQ.isError ? (
        <AdminRouteState
          state="error"
          title="Failed to load release gates"
          description="The request failed. Refresh to try again."
        />
      ) : null}

      {s ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5">Tool</th>
                <th className="px-3 py-2.5">Gate</th>
                <th className="px-3 py-2.5">Cohort</th>
                <th className="px-3 py-2.5">Rollout</th>
                <th className="px-3 py-2.5">Active incidents</th>
                <th className="px-3 py-2.5">Issues</th>
                <th className="px-3 py-2.5">Checked</th>
              </tr>
            </thead>
            <tbody>
              {s.gates.map((gate) => (
                <tr key={gate.toolKey} className="border-b border-slate-50">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-800">{gate.label}</p>
                    <p className="text-[10px] text-slate-400">{gate.toolKey}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={`text-[10px] ${gate.pass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {gate.pass ? 'PASS' : 'FAIL'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={`text-[10px] ${COHORT_BADGE[gate.cohort] ?? ''}`}>{gate.cohort}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{gate.rolloutPct}%</td>
                  <td className={`px-3 py-2.5 ${gate.activeIncidentCount > 0 ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>
                    {gate.activeIncidentCount}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {gate.issues.length === 0 ? '—' : gate.issues.join('; ')}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{fmtDate(gate.checkedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminConsoleShell>
  );
}
