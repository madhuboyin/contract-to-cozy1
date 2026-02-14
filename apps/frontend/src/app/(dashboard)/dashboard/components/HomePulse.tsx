// apps/frontend/src/app/(dashboard)/dashboard/components/HomePulse.tsx

'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  ListChecks,
} from 'lucide-react';
import { MaintenanceTaskStats } from '@/types';

interface HomePulseProps {
  stats: MaintenanceTaskStats | null;
  selectedPropertyId: string | undefined;
}

export function HomePulse({ stats, selectedPropertyId }: HomePulseProps) {
  // No stats yet (loading or no property selected)
  if (!stats) return null;

  const overdueCount = stats.overdue || 0;
  const urgentCount =
    (stats.byPriority?.urgent || 0) + (stats.byPriority?.high || 0);
  const needsAttention = overdueCount + urgentCount;
  const activeTasks =
    (stats.pending || 0) + (stats.inProgress || 0);
  const completed = stats.completed || 0;
  const total = stats.total || 0;
  const estimatedCost = stats.totalEstimatedCost || 0;
  const completionRate =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  // === EMPTY STATE: No tasks at all ===
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-5 py-6 text-center">
        <ListChecks className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">
          No maintenance tasks yet
        </p>
        <p className="text-xs text-gray-500 mt-1 mb-3">
          Set up your first maintenance schedule to start tracking your home
          health.
        </p>
        {selectedPropertyId && (
          <Link
            href={`/dashboard/maintenance-setup?propertyId=${selectedPropertyId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  // === ALL CLEAR STATE: Nothing overdue, nothing urgent ===
  if (needsAttention === 0 && overdueCount === 0) {
    return (
      <div className="space-y-3">
        {/* All-clear banner */}
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/60 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">
              You&apos;re all caught up
            </p>
            <p className="text-xs text-green-600">
              No overdue or urgent tasks right now.
            </p>
          </div>
        </div>

        {/* Compact stats row underneath */}
        <CompactStatsRow
          activeTasks={activeTasks}
          estimatedCost={estimatedCost}
          completionRate={completionRate}
          completed={completed}
          total={total}
          selectedPropertyId={selectedPropertyId}
        />
      </div>
    );
  }

  // === ATTENTION STATE: Overdue and/or urgent tasks ===
  return (
    <div className="space-y-3">
      {/* Overdue alert — only when overdue > 0 */}
      {overdueCount > 0 && (
        <Link
          href={`/dashboard/maintenance?propertyId=${selectedPropertyId}&filter=overdue`}
          className="group flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-5 py-4 transition-all hover:border-red-300 hover:shadow-sm"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 group-hover:bg-red-200 transition-colors">
            <AlertTriangle className="h-[18px] w-[18px] text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">
              {overdueCount} {overdueCount === 1 ? 'task' : 'tasks'} overdue
            </p>
            {urgentCount > 0 && (
              <p className="text-xs text-red-600">
                + {urgentCount} high priority{' '}
                {urgentCount === 1 ? 'item' : 'items'}
              </p>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-red-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>
      )}

      {/* Urgent only (no overdue) */}
      {overdueCount === 0 && urgentCount > 0 && (
        <Link
          href={`/dashboard/maintenance?propertyId=${selectedPropertyId}&priority=true`}
          className="group flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/60 px-5 py-4 transition-all hover:border-orange-300 hover:shadow-sm"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 group-hover:bg-orange-200 transition-colors">
            <AlertTriangle className="h-[18px] w-[18px] text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">
              {urgentCount} high priority{' '}
              {urgentCount === 1 ? 'task' : 'tasks'}
            </p>
            <p className="text-xs text-orange-600">
              Needs attention soon
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-orange-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </Link>
      )}

      {/* Compact stats row */}
      <CompactStatsRow
        activeTasks={activeTasks}
        estimatedCost={estimatedCost}
        completionRate={completionRate}
        completed={completed}
        total={total}
        selectedPropertyId={selectedPropertyId}
      />
    </div>
  );
}

// ─── Compact Stats Row ────────────────────────────────────────

interface CompactStatsRowProps {
  activeTasks: number;
  estimatedCost: number;
  completionRate: number;
  completed: number;
  total: number;
  selectedPropertyId: string | undefined;
}

function CompactStatsRow({
  activeTasks,
  estimatedCost,
  completionRate,
  completed,
  total,
  selectedPropertyId,
}: CompactStatsRowProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Active Tasks */}
      <Link
        href={`/dashboard/maintenance?propertyId=${selectedPropertyId}`}
        className="group rounded-xl border border-gray-200 bg-white px-4 py-3 transition-all hover:border-gray-300 hover:shadow-sm"
      >
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          Active
        </p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">
          {activeTasks}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {activeTasks === 1 ? 'task' : 'tasks'} in progress
        </p>
      </Link>

      {/* Estimated Costs */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          Est. Costs
        </p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">
          ${estimatedCost.toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          for active tasks
        </p>
      </div>

      {/* Completion */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          Completed
        </p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className="text-xl font-bold text-gray-900">{completionRate}%</p>
          <p className="text-[11px] text-gray-400">
            ({completed}/{total})
          </p>
        </div>
        {/* Mini progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{
              width: `${completionRate}%`,
              backgroundColor:
                completionRate >= 75
                  ? '#16a34a'
                  : completionRate >= 40
                    ? '#d97706'
                    : '#dc2626',
            }}
          />
        </div>
      </div>
    </div>
  );
}