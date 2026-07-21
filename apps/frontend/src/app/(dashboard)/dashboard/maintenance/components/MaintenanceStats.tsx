'use client';

import { format } from 'date-fns';
import type { PropertyMaintenanceTask } from '@/types';
import { formatMaintenanceTaskTitle, parseMaintenanceDate } from '../taskDisplay';

function StatTile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'alert' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_6px_14px_rgba(15,23,42,0.05)]">
      <p className="mb-0 text-xs font-medium text-slate-500">{label}</p>
      <p
        className={
          tone === 'alert'
            ? 'mb-0 mt-1 truncate text-lg font-semibold text-red-600'
            : 'mb-0 mt-1 truncate text-lg font-semibold text-slate-900'
        }
      >
        {value}
      </p>
      {detail ? <p className="mb-0 mt-1 truncate text-xs text-slate-500" title={detail}>{detail}</p> : null}
    </div>
  );
}

export function computeMaintenanceStats(tasks: PropertyMaintenanceTask[], now: Date = new Date()) {
  const open = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const overdue = open.filter((t) => {
    const dueDate = parseMaintenanceDate(t.nextDueDate);
    return dueDate ? dueDate < now : false;
  });
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const completed30d = tasks.filter((t) => {
    if (t.status !== 'COMPLETED') return false;
    const completedDate = parseMaintenanceDate(t.lastCompletedDate);
    return completedDate ? completedDate >= thirtyDaysAgo : false;
  });
  const dueTasks = open
    .map((task) => ({ task, dueDate: parseMaintenanceDate(task.nextDueDate) }))
    .filter((entry): entry is { task: PropertyMaintenanceTask; dueDate: Date } => entry.dueDate !== null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const nextDueEntry = dueTasks[0] ?? null;
  const nextDueDay = nextDueEntry?.dueDate.toISOString().slice(0, 10) ?? null;
  const nextDueCount = nextDueDay
    ? dueTasks.filter((entry) => entry.dueDate.toISOString().slice(0, 10) === nextDueDay).length
    : 0;

  return {
    openCount: open.length,
    overdueCount: overdue.length,
    completed30dCount: completed30d.length,
    nextDue: nextDueEntry?.dueDate ?? null,
    nextDueTask: nextDueEntry?.task ?? null,
    nextDueCount,
  };
}

export function MaintenanceStats({ tasks }: { tasks: PropertyMaintenanceTask[] }) {
  const stats = computeMaintenanceStats(tasks);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Open tasks" value={String(stats.openCount)} />
      <StatTile
        label="Overdue"
        value={String(stats.overdueCount)}
        tone={stats.overdueCount > 0 ? 'alert' : undefined}
      />
      <StatTile label="Completed (30d)" value={String(stats.completed30dCount)} />
      <StatTile
        label="Next due"
        value={stats.nextDue ? format(stats.nextDue, 'MMM d') : '—'}
        detail={stats.nextDueTask
          ? `${formatMaintenanceTaskTitle(stats.nextDueTask.title)}${stats.nextDueCount > 1 ? ` +${stats.nextDueCount - 1} more` : ''}`
          : undefined}
      />
    </div>
  );
}
