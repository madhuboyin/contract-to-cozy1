// apps/frontend/src/components/ops/worker-jobs/JobsToolbar.tsx

'use client';

import { LayoutGrid, List, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { JobCategory } from '@/lib/api/adminWorkerJobs';
import { CATEGORY_LABELS, HEALTH_DOT, HEALTH_LABELS, HEALTH_ORDER, HealthStatus } from './workerJobsUtils';

export function JobsToolbar({
  search,
  onSearchChange,
  healthFilter,
  onHealthFilterChange,
  healthCounts,
  totalCount,
  categoryFilter,
  onCategoryFilterChange,
  availableCategories,
  view,
  onViewChange,
  allCollapsed,
  onToggleCollapseAll,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  healthFilter: HealthStatus | 'all';
  onHealthFilterChange: (v: HealthStatus | 'all') => void;
  healthCounts: Record<HealthStatus, number>;
  totalCount: number;
  categoryFilter: JobCategory | 'all';
  onCategoryFilterChange: (v: JobCategory | 'all') => void;
  availableCategories: JobCategory[];
  view: 'cards' | 'list';
  onViewChange: (v: 'cards' | 'list') => void;
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
          placeholder="Search jobs by name or description…"
          className="h-auto w-full border-none bg-transparent p-0 text-[12.5px] shadow-none focus-visible:ring-0"
        />
      </label>

      <div className="flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5">
        <button
          type="button"
          aria-pressed={healthFilter === 'all'}
          onClick={() => onHealthFilterChange('all')}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
            healthFilter === 'all' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          All <span className="text-slate-400">{totalCount}</span>
        </button>
        {HEALTH_ORDER.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={healthFilter === h}
            onClick={() => onHealthFilterChange(h)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
              healthFilter === h ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[h]}`} />
            {HEALTH_LABELS[h]} <span className="text-slate-400">{healthCounts[h]}</span>
          </button>
        ))}
      </div>

      <Select
        value={categoryFilter}
        onValueChange={(v) => onCategoryFilterChange(v as JobCategory | 'all')}
      >
        <SelectTrigger className="h-8 w-[168px] rounded-lg text-[12px] font-semibold">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {availableCategories.map((c) => (
            <SelectItem key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
        <button
          type="button"
          aria-pressed={view === 'cards'}
          onClick={() => onViewChange('cards')}
          title="Card view"
          className={`grid h-7 w-7 place-items-center rounded-md ${
            view === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-pressed={view === 'list'}
          onClick={() => onViewChange('list')}
          title="List view"
          className={`grid h-7 w-7 place-items-center rounded-md ${
            view === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
          }`}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>

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
