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
import {
  useRecordCapabilityGovernanceReview,
  useReleaseGateSummary,
} from '@/hooks/useAdminPlatformOps';
import type { CapabilityGovernanceReviewRole } from '@/lib/api/adminPlatformOps';

const COHORT_BADGE: Record<string, string> = {
  DISABLED: 'bg-slate-100 text-slate-600',
  INTERNAL: 'bg-indigo-50 text-indigo-700',
  BETA: 'bg-amber-50 text-amber-700',
  FULL: 'bg-emerald-50 text-emerald-700',
};

const REVIEW_BADGE: Record<string, string> = {
  READY: 'bg-emerald-50 text-emerald-700',
  HELD: 'bg-slate-100 text-slate-700',
  BLOCKED: 'bg-rose-50 text-rose-700',
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
  const governanceReviewMutation = useRecordCapabilityGovernanceReview();

  if (guard.status !== 'ready') return guard.node;

  const s = summaryQ.data;
  const recordReview = (
    capabilityId: string,
    role: CapabilityGovernanceReviewRole,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    const notes = decision === 'REJECTED'
      ? window.prompt('Reason for rejecting this capability policy review:')
      : null;
    if (decision === 'REJECTED' && !notes?.trim()) return;
    governanceReviewMutation.mutate({
      capabilityId,
      role,
      decision,
      notes: notes?.trim() || null,
    });
  };

  return (
    <AdminConsoleShell
      title="Release Gates"
      subtitle="Capability-by-capability launch readiness across policy, rollout, containment, and incident controls."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <ShieldEllipsis className="h-3 w-3" />
          {s ? `${s.capabilityReviewCounts.READY}/${s.totalTools} ready` : 'Loading…'}
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
        {s
          ? Object.entries(s.capabilityReviewCounts).map(([state, count]) => (
              <span key={state} className={`rounded px-2 py-0.5 text-[11px] font-semibold ${REVIEW_BADGE[state] ?? 'bg-slate-100 text-slate-600'}`}>
                {state}: {count}
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
            <Badge className={s.operationalControls.humanPolicyApprovalEnforced
              && s.operationalControls.governanceReviewSourceAvailable
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'}
            >
              Human policy {s.operationalControls.humanPolicyApprovalEnforced
                ? s.operationalControls.governanceReviewSourceAvailable
                  ? 'enforced'
                  : 'unavailable'
                : 'advisory'}
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
          {[
            ['Unknown disabled IDs', s.operationalControls.unknownDisabledCapabilityIds],
            ['Unknown broken-route IDs', s.operationalControls.unknownBrokenRouteCapabilityIds],
            ['Unknown release-gate IDs', s.operationalControls.unknownReleaseGateBlockedCapabilityIds],
          ].map(([label, values]) => (
            (values as string[]).length > 0 ? (
              <p key={label as string} className="mt-2 text-xs font-medium text-rose-700">
                {label as string}: {(values as string[]).join(', ')}
              </p>
            ) : null
          ))}
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
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5">Capability</th>
                <th className="px-3 py-2.5">Readiness</th>
                <th className="px-3 py-2.5">Policy</th>
                <th className="px-3 py-2.5">Approvals</th>
                <th className="px-3 py-2.5">Cohort</th>
                <th className="px-3 py-2.5">Rollout</th>
                <th className="px-3 py-2.5">Active incidents</th>
                <th className="px-3 py-2.5">Blockers</th>
                <th className="px-3 py-2.5">Checked</th>
              </tr>
            </thead>
            <tbody>
              {s.capabilityReviews.map((review) => (
                <tr key={review.capabilityId} className="border-b border-slate-50">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-800">{review.label}</p>
                    <p className="text-[10px] text-slate-400">{review.capabilityId} · {review.owner}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={`text-[10px] ${REVIEW_BADGE[review.state] ?? ''}`}>
                      {review.state}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-slate-600">{review.releaseStage} · {review.recommendationMode}</p>
                    <p className="text-[10px] text-slate-400">{review.safetyTier}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1">
                      {review.governanceReview.requiredRoles.map((role) => {
                        const approved = review.governanceReview.approvedRoles.includes(role);
                        const rejected = review.governanceReview.rejectedRoles.includes(role);
                        return (
                          <div key={role} className="flex items-center gap-1">
                            <Badge className={`text-[9px] ${
                              approved
                                ? 'bg-emerald-50 text-emerald-700'
                                : rejected
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-amber-50 text-amber-700'
                            }`}>
                              {role}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[9px]"
                              disabled={governanceReviewMutation.isPending || approved}
                              onClick={() => recordReview(review.capabilityId, role, 'APPROVED')}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[9px] text-rose-700"
                              disabled={governanceReviewMutation.isPending || rejected}
                              onClick={() => recordReview(review.capabilityId, role, 'REJECTED')}
                            >
                              Reject
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={`text-[10px] ${COHORT_BADGE[review.rollout?.cohort ?? 'DISABLED'] ?? ''}`}>
                      {review.rollout?.cohort ?? 'MISSING'}
                    </Badge>
                    <p className="mt-1 text-[10px] text-slate-400">{review.rolloutKey}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{review.rollout?.rolloutPct ?? 0}%</td>
                  <td className={`px-3 py-2.5 ${(review.incidentGate?.activeIncidentCount ?? 0) > 0 ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>
                    {review.incidentGate?.activeIncidentCount ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {review.blockers.length === 0 ? '—' : review.blockers.join(', ')}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {review.incidentGate ? fmtDate(review.incidentGate.checkedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminConsoleShell>
  );
}
