'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/release-gates/page.tsx
//
// Admin-only Release Gates workspace (ADMIN_MODULE_FRD.md §10.9, Phase 5).
// Read-only UI over the existing /api/admin/release-gates API
// (RELEASE_GATE_VIEW): per-tool gate status, rollout cohort, and blocking
// issues. Gate rules live server-side (flag registry + incident checks).

import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, ShieldEllipsis } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import {
  useRecordCapabilityGovernanceReview,
  useReleaseGateSummary,
} from '@/hooks/useAdminPlatformOps';
import type { CapabilityGovernanceReviewRole, CapabilityLaunchReview, CapabilityLaunchReviewState } from '@/lib/api/adminPlatformOps';
import { ReadinessPanel } from '@/components/ops/release-gates/ReadinessPanel';
import { GatesToolbar } from '@/components/ops/release-gates/GatesToolbar';
import { StateSection } from '@/components/ops/release-gates/StateSection';
import { STATE_ORDER } from '@/components/ops/release-gates/releaseGatesUtils';

export default function AdminReleaseGatesPage() {
  const guard = useAdminGuard({
    title: 'Release Gates',
    subtitle: 'Per-tool release gate status across the platform.',
  });

  const summaryQ = useReleaseGateSummary();
  const governanceReviewMutation = useRecordCapabilityGovernanceReview();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<CapabilityLaunchReviewState | 'all'>('all');
  const [cohortFilter, setCohortFilter] = useState<string>('all');
  const [collapsedStates, setCollapsedStates] = useState<Set<CapabilityLaunchReviewState>>(new Set());

  const s = summaryQ.data;

  const allReviews: CapabilityLaunchReview[] = useMemo(() => s?.capabilityReviews ?? [], [s]);

  const searchedAndCohortFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReviews.filter((r) => {
      if (cohortFilter !== 'all' && (r.rollout?.cohort ?? 'DISABLED') !== cohortFilter) return false;
      if (q && !r.label.toLowerCase().includes(q) && !r.capabilityId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allReviews, search, cohortFilter]);

  const stateCounts = useMemo(() => {
    const counts: Record<CapabilityLaunchReviewState, number> = { READY: 0, HELD: 0, BLOCKED: 0 };
    searchedAndCohortFiltered.forEach((r) => counts[r.state]++);
    return counts;
  }, [searchedAndCohortFiltered]);

  const filteredReviews = useMemo(() => {
    if (stateFilter === 'all') return searchedAndCohortFiltered;
    return searchedAndCohortFiltered.filter((r) => r.state === stateFilter);
  }, [searchedAndCohortFiltered, stateFilter]);

  const byState = useMemo(() => {
    const acc: Record<CapabilityLaunchReviewState, CapabilityLaunchReview[]> = { BLOCKED: [], HELD: [], READY: [] };
    filteredReviews.forEach((r) => acc[r.state].push(r));
    return acc;
  }, [filteredReviews]);

  const visibleStates = STATE_ORDER.filter((st) => byState[st].length > 0);
  const allCollapsed = visibleStates.length > 0 && visibleStates.every((st) => collapsedStates.has(st));

  if (guard.status !== 'ready') return guard.node;

  function toggleStateCollapsed(st: CapabilityLaunchReviewState) {
    setCollapsedStates((prev) => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st);
      else next.add(st);
      return next;
    });
  }

  function toggleCollapseAll() {
    setCollapsedStates(allCollapsed ? new Set() : new Set(visibleStates));
  }

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
      <div className="mb-4 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => summaryQ.refetch()}
          disabled={summaryQ.isFetching}
        >
          {summaryQ.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Re-check all gates
        </Button>
      </div>

      {s ? <ReadinessPanel controls={s.operationalControls} /> : null}

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
        <>
          <GatesToolbar
            search={search}
            onSearchChange={setSearch}
            stateFilter={stateFilter}
            onStateFilterChange={setStateFilter}
            stateCounts={stateCounts}
            totalCount={searchedAndCohortFiltered.length}
            cohortFilter={cohortFilter}
            onCohortFilterChange={setCohortFilter}
            allCollapsed={allCollapsed}
            onToggleCollapseAll={toggleCollapseAll}
          />

          {visibleStates.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-slate-400">
              No capabilities match your filters.
            </p>
          ) : (
            visibleStates.map((st) => (
              <StateSection
                key={st}
                state={st}
                reviews={byState[st]}
                collapsed={collapsedStates.has(st)}
                onToggleCollapsed={() => toggleStateCollapsed(st)}
                onRecordReview={recordReview}
                reviewPending={governanceReviewMutation.isPending}
              />
            ))
          )}
        </>
      ) : null}
    </AdminConsoleShell>
  );
}
