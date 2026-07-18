'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/shared-data/page.tsx
//
// Admin-only Shared Data Health workspace (ADMIN_MODULE_FRD.md §10.9,
// Phase 5). UI over the existing /api/admin/shared-data API
// (SHARED_DATA_OPERATE): operational diagnostics, consistency issues, and
// a governed backfill trigger that defaults to a dry run.

import React, { useState } from 'react';
import { Database, Loader2, PlayCircle } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useRunSharedDataBackfill,
  useSharedDataConsistency,
  useSharedDataDiagnostics,
} from '@/hooks/useAdminPlatformOps';

const SEVERITY_BADGE: Record<string, string> = {
  INFO: 'bg-slate-100 text-slate-600',
  WARNING: 'bg-amber-50 text-amber-700',
  CRITICAL: 'bg-rose-50 text-rose-700',
};

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: 'bad' | 'ok' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className={`text-xl font-semibold ${tone === 'bad' ? 'text-rose-700' : 'text-slate-900'}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function BackfillDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const backfill = useRunSharedDataBackfill();
  const [dryRun, setDryRun] = useState(true);
  const [propertyId, setPropertyId] = useState('');
  const [limit, setLimit] = useState('50');
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  const limitNum = Number(limit);
  const limitValid = Number.isInteger(limitNum) && limitNum >= 1 && limitNum <= 500;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setLastResult(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run shared-data backfill</DialogTitle>
          <DialogDescription>
            Dry runs report what would change without writing. A real run backfills preference profiles,
            assumption links, and signals for the selected scope.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (no writes)
        </label>
        <Input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="Property ID (optional — blank means batch scope)"
          className="h-9 text-sm"
        />
        <Input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Batch limit (1–500)"
          inputMode="numeric"
          className="h-9 text-sm"
        />
        {lastResult ? (
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        ) : null}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={backfill.isPending}>
            Close
          </Button>
          <Button
            size="sm"
            variant={dryRun ? 'default' : 'destructive'}
            disabled={backfill.isPending || !limitValid}
            onClick={() =>
              backfill.mutate(
                { dryRun, propertyId: propertyId.trim() || undefined, limit: limitNum },
                {
                  onSuccess: (result) => {
                    setLastResult(result);
                    toast({ title: dryRun ? 'Dry run complete' : 'Backfill complete' });
                  },
                  onError: (err: any) => {
                    toast({ title: 'Backfill failed', description: err?.message, variant: 'destructive' });
                  },
                },
              )
            }
          >
            {backfill.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" />}
            {dryRun ? 'Run dry run' : 'Run backfill (writes)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSharedDataPage() {
  const guard = useAdminGuard({
    title: 'Shared Data Health',
    subtitle: 'Readiness, consistency, and signal health for shared property data.',
  });

  const diagnosticsQ = useSharedDataDiagnostics();
  const consistencyQ = useSharedDataConsistency();
  const [backfillOpen, setBackfillOpen] = useState(false);

  if (guard.status !== 'ready') return guard.node;

  const d = diagnosticsQ.data;

  return (
    <AdminConsoleShell
      title="Shared Data Health"
      subtitle="Operational diagnostics over shared property data — readiness, fallback risk, consistency issues, and signal health."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <Database className="h-3 w-3" />
          {d ? `${d.propertiesEvaluated} properties evaluated` : 'Loading…'}
        </span>
      }
    >
      <div className="mb-4">
        <Button size="sm" variant="outline" onClick={() => setBackfillOpen(true)}>
          <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
          Run backfill…
        </Button>
      </div>

      {diagnosticsQ.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading diagnostics…
        </div>
      ) : null}

      {diagnosticsQ.isError ? (
        <AdminRouteState
          state="error"
          title="Failed to load diagnostics"
          description="The request failed. Refresh to try again."
        />
      ) : null}

      {d ? (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Readiness</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Ready" value={d.readinessSummary.ready} />
              <StatTile label="Partial" value={d.readinessSummary.partial} />
              <StatTile label="Legacy-heavy" value={d.readinessSummary.legacyHeavy} tone={d.readinessSummary.legacyHeavy > 0 ? 'bad' : 'ok'} />
              <StatTile label="Avg preference completeness" value={pct(d.readinessSummary.avgPreferenceCompletenessRatio)} />
              <StatTile label="Avg assumption links" value={pct(d.readinessSummary.avgAssumptionLinkRatio)} />
              <StatTile label="Avg signal coverage" value={pct(d.readinessSummary.avgSignalCoverageRatio)} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fallback risk</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="Coverage analyses w/o assumptions" value={d.fallbackRisk.coverageAnalysesWithoutAssumptionSet} tone={d.fallbackRisk.coverageAnalysesWithoutAssumptionSet > 0 ? 'bad' : 'ok'} />
              <StatTile label="Risk analyses w/o assumptions" value={d.fallbackRisk.riskAnalysesWithoutAssumptionSet} tone={d.fallbackRisk.riskAnalysesWithoutAssumptionSet > 0 ? 'bad' : 'ok'} />
              <StatTile label="Do-nothing runs w/o assumptions" value={d.fallbackRisk.doNothingRunsWithoutAssumptionSet} tone={d.fallbackRisk.doNothingRunsWithoutAssumptionSet > 0 ? 'bad' : 'ok'} />
              <StatTile label="Score reports w/o preference profile" value={d.fallbackRisk.homeScoreReportsWithoutPreferenceProfile} tone={d.fallbackRisk.homeScoreReportsWithoutPreferenceProfile > 0 ? 'bad' : 'ok'} />
              <StatTile label="Missing shared-link ratio" value={pct(d.fallbackRisk.missingSharedLinkRatio)} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Signals</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Total signals" value={d.signalSummary.totalSignals} />
              <StatTile label="Stale" value={d.signalSummary.staleSignals} tone={d.signalSummary.staleSignals > 0 ? 'bad' : 'ok'} />
              <StatTile label="Low confidence" value={d.signalSummary.lowConfidenceSignals} />
              <StatTile label="Interaction-derived" value={d.signalSummary.interactionSignals} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Consistency issues ({consistencyQ.data?.issueCount ?? d.consistencySummary.issueCount})
            </h3>
            {consistencyQ.isLoading ? (
              <p className="mt-2 text-xs text-slate-400">Loading issues…</p>
            ) : null}
            {consistencyQ.data && consistencyQ.data.issues.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No consistency issues found.</p>
            ) : null}
            <ul className="mt-2 space-y-1.5">
              {(consistencyQ.data?.issues ?? []).slice(0, 50).map((issue, i) => (
                <li key={`${issue.propertyId}-${issue.code}-${i}`} className="flex flex-wrap items-baseline gap-2 text-xs">
                  <Badge className={`text-[10px] ${SEVERITY_BADGE[issue.severity] ?? 'bg-slate-100 text-slate-600'}`}>
                    {issue.severity}
                  </Badge>
                  <span className="font-medium text-slate-700">{issue.code}</span>
                  <span className="text-slate-500">{issue.message}</span>
                  <code className="text-[10px] text-slate-400">{issue.propertyId}</code>
                </li>
              ))}
            </ul>
            {consistencyQ.data && consistencyQ.data.issues.length > 50 ? (
              <p className="mt-2 text-[11px] text-slate-400">
                Showing first 50 of {consistencyQ.data.issues.length} issues.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <BackfillDialog open={backfillOpen} onOpenChange={setBackfillOpen} />
    </AdminConsoleShell>
  );
}
