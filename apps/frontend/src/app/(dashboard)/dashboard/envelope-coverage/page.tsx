'use client';

// apps/frontend/src/app/(dashboard)/dashboard/envelope-coverage/page.tsx
//
// Admin-only, read-only Envelope Promotion Coverage dashboard
// (C2C_INTELLIGENCE_AGENTIC_EVOLUTION_IMPLEMENTATION_PLAN.md §6.3). Shows
// active REVIEW_REQUIRED findings, declared-only support, observed
// declaration drift, matched rule IDs, digest/taxonomy version, bounded run
// diagnostics, the durable last complete run, recent partial/failed runs,
// and retired history. Run history is the durable CoverageAuditRun record,
// not the generic five-entry Redis cron history. There are deliberately no
// "promote", "create rule", or mutation controls — closing a finding is a
// separate human-authored change.

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Badge } from '@/components/ui/badge';
import { useAdminEnvelopeCoverage } from '@/hooks/useAdminEnvelopeCoverage';
import type {
  CoverageAuditRun,
  CoverageFinding,
} from '@/lib/api/adminEnvelopeCoverage';

const TITLE = 'Envelope Coverage';
const SUBTITLE = 'Structural audit of which registered Envelope producers have a hand-authored promotion path.';

function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { dateStyle: 'medium' });
}

function shortDigest(digest: string): string {
  return digest ? digest.slice(0, 10) : '—';
}

function runStatusClass(status: CoverageAuditRun['status']): string {
  if (status === 'COMPLETE') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'FAILED') return 'border-rose-200 bg-rose-50 text-rose-900';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function evidenceClass(basis: CoverageFinding['evidenceBasis']): string {
  if (basis === 'OBSERVED_ONLY') return 'bg-rose-50 text-rose-700';
  if (basis === 'DECLARED_ONLY') return 'bg-slate-100 text-slate-600';
  return 'bg-emerald-50 text-emerald-700';
}

function FindingTable({ rows, emptyLabel }: { rows: CoverageFinding[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
        <CheckCircle2 className="h-4 w-4" />
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2">Producer model</th>
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2">Determination</th>
            <th className="px-3 py-2">Evidence basis</th>
            <th className="px-3 py-2">Matched rule IDs</th>
            <th className="px-3 py-2">Observation window</th>
            <th className="px-3 py-2">Digest</th>
            <th className="px-3 py-2">Last audited</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2 font-semibold text-slate-800">{row.producerModel}</td>
              <td className="px-3 py-2 text-slate-600">{row.domain}</td>
              <td className="px-3 py-2 text-slate-600">{row.determination}</td>
              <td className="px-3 py-2">
                <Badge className={`text-[10px] ${evidenceClass(row.evidenceBasis)}`}>{row.evidenceBasis}</Badge>
              </td>
              <td className="px-3 py-2 text-slate-500">
                {row.matchedRuleIds.length ? row.matchedRuleIds.join(', ') : '—'}
              </td>
              <td className="px-3 py-2 text-slate-500">
                {row.firstObservedAt ? `${fmtDate(row.firstObservedAt)} → ${fmtDate(row.lastObservedAt)}` : 'declared only'}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{shortDigest(row.auditInputsDigest)}</td>
              <td className="px-3 py-2 text-slate-500">
                {row.active ? fmtDateTime(row.lastAuditedAt) : `retired ${fmtDateTime(row.retiredAt)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunCard({ run, highlight }: { run: CoverageAuditRun; highlight?: boolean }) {
  return (
    <article className={`rounded-2xl border p-4 ${runStatusClass(run.status)} ${highlight ? 'ring-1 ring-emerald-300' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">
            {run.trigger} · {fmtDateTime(run.startedAt)}
          </p>
          <p className="mt-0.5 text-[11px] opacity-70">
            finished {fmtDateTime(run.finishedAt)} · digest {shortDigest(run.auditInputsDigest)} · taxonomy {run.taxonomyVersion} · rev {run.deploymentRevision.slice(0, 10)}
          </p>
        </div>
        <Badge variant="outline">{run.status}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        <div><dt className="opacity-60">Properties</dt><dd className="font-semibold">{run.propertiesAudited}/{run.propertiesExamined}</dd></div>
        <div><dt className="opacity-60">Envelope pages</dt><dd className="font-semibold">{run.envelopePagesRead}</dd></div>
        <div><dt className="opacity-60">Observed capabilities</dt><dd className="font-semibold">{run.observedCapabilities}</dd></div>
        <div><dt className="opacity-60">Findings / review</dt><dd className="font-semibold">{run.findings} / {run.reviewRequired}</dd></div>
        <div><dt className="opacity-60">Declaration drift</dt><dd className="font-semibold">{run.declarationDrift}</dd></div>
        <div><dt className="opacity-60">Created / updated / retired</dt><dd className="font-semibold">{run.findingsCreated} / {run.findingsUpdated} / {run.findingsRetired}</dd></div>
        <div><dt className="opacity-60">Owner unresolved</dt><dd className="font-semibold">{run.ownerUnresolved}</dd></div>
        <div><dt className="opacity-60">Property / adapter failures</dt><dd className="font-semibold">{run.propertyFailures} / {run.adapterFailures}</dd></div>
        <div><dt className="opacity-60">Evaluation</dt><dd className="font-semibold">{run.evaluationStatus}</dd></div>
      </dl>

      {run.certificationIssues.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 p-2 text-[11px] text-rose-900">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Certification issues</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {run.certificationIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      {run.diagnostics.length > 0 && (
        <p className="mt-2 text-[11px] opacity-70"><span className="font-semibold">Diagnostics:</span> {run.diagnostics.join(', ')}</p>
      )}

      {run.failureSummary && (
        <p className="mt-2 text-[11px]"><span className="font-semibold">Failure:</span> {run.failureCode} — {run.failureSummary}</p>
      )}
    </article>
  );
}

export default function AdminEnvelopeCoveragePage() {
  const guard = useAdminGuard({ title: TITLE, subtitle: SUBTITLE });
  const [includeRetired, setIncludeRetired] = useState(false);
  const report = useAdminEnvelopeCoverage({ includeRetired });

  if (guard.status !== 'ready') return guard.node;

  if (report.isLoading) {
    return (
      <AdminConsoleShell title={TITLE} subtitle="Loading coverage findings and run history.">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Envelope coverage…
        </p>
      </AdminConsoleShell>
    );
  }

  if (report.isError || !report.data) {
    return (
      <AdminConsoleShell title={TITLE} subtitle={SUBTITLE}>
        <AdminRouteState
          state="error"
          title="Could not load Envelope coverage"
          description="Confirm ADMIN role, MFA, and the WORKER_JOB_VIEW capability, then retry."
        />
      </AdminConsoleShell>
    );
  }

  const { summary, reviewRequired, declaredOnly, retired, lastComplete, recentRuns } = report.data;
  const observedDrift = [...reviewRequired, ...declaredOnly].filter((f) => f.evidenceBasis === 'OBSERVED_ONLY');
  const partialOrFailed = recentRuns.filter((r) => r.status === 'PARTIAL' || r.status === 'FAILED');

  const cards: Array<[string, number | string]> = [
    ['Review required', summary.reviewRequired],
    ['Declared-only', summary.declaredOnly],
    ['Observed drift', observedDrift.length],
    ['Recent partial / failed', summary.recentPartialOrFailed],
    ['Evaluation', summary.evaluationStatus],
  ];

  return (
    <AdminConsoleShell
      title={TITLE}
      subtitle="Every registered producer/domain pair carries exactly one determination. Declared-but-unobserved support stays visible; observed-but-undeclared capabilities fail certification. This view never promotes or creates rules."
      chips={
        <Badge variant="outline">
          {lastComplete ? `last complete ${fmtDateTime(lastComplete.finishedAt)}` : 'no complete run yet'}
        </Badge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Active — review required</h2>
        <FindingTable rows={reviewRequired} emptyLabel="No active REVIEW_REQUIRED findings — every observed producer/domain pair has a matching promotion path." />
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Observed declaration drift</h2>
        <p className="mb-2 text-[11px] text-slate-500">
          Producer/domain pairs seen in authorized observations but absent from their adapter descriptor. These fail certification even when the coarse pair is otherwise covered.
        </p>
        <FindingTable rows={observedDrift} emptyLabel="No observed capability is undeclared." />
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Declared-only support</h2>
        <p className="mb-2 text-[11px] text-slate-500">
          Declared adapter capabilities with no authorized observation yet. Visible on purpose — not a failure.
        </p>
        <FindingTable rows={declaredOnly} emptyLabel="Every declared capability has at least one authorized observation." />
      </section>

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Last complete run</h2>
        {lastComplete
          ? <RunCard run={lastComplete} highlight />
          : (
            <AdminRouteState
              state="empty"
              title="No complete run recorded"
              description="Scheduled execution stays disabled until IPD-002 operational acceptance; an admin can trigger a manual run from Worker Jobs."
            />
          )}
      </section>

      {partialOrFailed.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent partial / failed runs</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {partialOrFailed.map((run) => <RunCard key={run.id} run={run} />)}
          </div>
        </section>
      )}

      <section className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retired history</h2>
          <button
            type="button"
            onClick={() => setIncludeRetired((v) => !v)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {includeRetired ? 'Hide retired findings' : 'Show retired findings'}
          </button>
        </div>
        {includeRetired
          ? <FindingTable rows={retired} emptyLabel="No findings have been retired." />
          : <p className="text-[11px] text-slate-400">Retired findings are hidden. A finding is retired only by a complete global run whose universe no longer contains its natural key.</p>}
      </section>
    </AdminConsoleShell>
  );
}
