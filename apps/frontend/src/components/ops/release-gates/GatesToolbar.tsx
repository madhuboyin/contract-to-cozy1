// apps/frontend/src/components/ops/release-gates/GatesToolbar.tsx

'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CapabilityLaunchReviewState } from '@/lib/api/adminPlatformOps';
import { STATE_DOT, STATE_LABELS, STATE_ORDER } from './releaseGatesUtils';

const COHORTS = ['DISABLED', 'INTERNAL', 'BETA', 'FULL'] as const;

export function GatesToolbar({
  search,
  onSearchChange,
  stateFilter,
  onStateFilterChange,
  stateCounts,
  totalCount,
  cohortFilter,
  onCohortFilterChange,
  allCollapsed,
  onToggleCollapseAll,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  stateFilter: CapabilityLaunchReviewState | 'all';
  onStateFilterChange: (v: CapabilityLaunchReviewState | 'all') => void;
  stateCounts: Record<CapabilityLaunchReviewState, number>;
  totalCount: number;
  cohortFilter: string | 'all';
  onCohortFilterChange: (v: string | 'all') => void;
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
}) {
  return (
    <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white/95 p-2 shadow-md backdrop-blur">
      <label className="flex h-8 min-w-[180px] flex-1 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 focus-within:bg-white focus-within:ring-1 focus-within:ring-slate-300">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by capability name or key…"
          className="h-auto w-full border-none bg-transparent p-0 text-[12.5px] shadow-none focus-visible:ring-0"
        />
      </label>

      <div className="flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5">
        <button
          type="button"
          aria-pressed={stateFilter === 'all'}
          onClick={() => onStateFilterChange('all')}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
            stateFilter === 'all' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          All <span className="text-slate-400">{totalCount}</span>
        </button>
        {STATE_ORDER.map((st) => (
          <button
            key={st}
            type="button"
            aria-pressed={stateFilter === st}
            onClick={() => onStateFilterChange(st)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
              stateFilter === st ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[st]}`} />
            {STATE_LABELS[st]} <span className="text-slate-400">{stateCounts[st]}</span>
          </button>
        ))}
      </div>

      <Select value={cohortFilter} onValueChange={(v) => onCohortFilterChange(v)}>
        <SelectTrigger className="h-8 w-[152px] rounded-lg text-[12px] font-semibold">
          <SelectValue placeholder="All cohorts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All cohorts</SelectItem>
          {COHORTS.map((c) => (
            <SelectItem key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={onToggleCollapseAll}
        className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100"
      >
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>
    </div>
  );
}
