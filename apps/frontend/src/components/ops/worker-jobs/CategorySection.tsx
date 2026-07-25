// apps/frontend/src/components/ops/worker-jobs/CategorySection.tsx

'use client';

import { ChevronDown } from 'lucide-react';
import type { JobCategory, WorkerJobDetail } from '@/lib/api/adminWorkerJobs';
import { CATEGORY_LABELS, HEALTH_DOT, HEALTH_ORDER, getHealth } from './workerJobsUtils';
import { JobCard } from './JobCard';
import { JobsTable } from './JobsTable';

export function CategorySection({
  category,
  jobs,
  view,
  collapsed,
  onToggleCollapsed,
  triggeringKey,
  triggeredKey,
  onTrigger,
}: {
  category: JobCategory;
  jobs: WorkerJobDetail[];
  view: 'cards' | 'list';
  collapsed: boolean;
  onToggleCollapsed: () => void;
  triggeringKey: string | null;
  triggeredKey: string | null;
  onTrigger: (key: string, dryRun?: boolean, propertyId?: string) => void;
}) {
  const healthCounts = { healthy: 0, warning: 0, failing: 0, idle: 0 };
  jobs.forEach((job) => healthCounts[getHealth(job.recentRuns)]++);

  return (
    <div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-100/70"
      >
        <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <h2 className="text-[11px] font-semibold uppercase tracking-normal text-slate-400">
          {CATEGORY_LABELS[category]}
        </h2>
        <span className="text-[11px] text-slate-300">{jobs.length}</span>
        <span className="ml-auto flex items-center gap-1">
          {HEALTH_ORDER.filter((h) => healthCounts[h] > 0).map((h) => (
            <span key={h} className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[h]}`} title={`${healthCounts[h]} ${h}`} />
          ))}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-2">
          {view === 'cards' ? (
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.key}
                  job={job}
                  onTrigger={onTrigger}
                  triggering={triggeringKey === job.key}
                  triggerSuccess={triggeredKey === job.key}
                />
              ))}
            </div>
          ) : (
            <JobsTable jobs={jobs} onTrigger={onTrigger} triggeringKey={triggeringKey} triggeredKey={triggeredKey} />
          )}
        </div>
      )}
    </div>
  );
}
