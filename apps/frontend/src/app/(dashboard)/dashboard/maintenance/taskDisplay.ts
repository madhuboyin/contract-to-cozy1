import { format, differenceInDays } from 'date-fns';
import humanizeActionType from '@/lib/utils/humanize';
import type {
  MaintenanceTaskServiceCategory,
  PropertyMaintenanceTask,
} from '@/types';

export type ViewMode = 'open' | 'completed' | 'all';
export type CompletedRange = '30d' | '90d' | '1y' | 'all';

export function parseMaintenanceDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeView(val: string | null): ViewMode {
  if (val === 'completed' || val === 'all') return val;
  return 'open';
}

export function normalizeRange(val: string | null): CompletedRange {
  if (val === '30d' || val === '90d' || val === '1y' || val === 'all') return val;
  return '30d';
}

export function cutoffForCompletedRange(range: CompletedRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null;
  const msPerDay = 24 * 60 * 60 * 1000;

  if (range === '30d') return new Date(now.getTime() - 30 * msPerDay);
  if (range === '90d') return new Date(now.getTime() - 90 * msPerDay);
  return new Date(now.getTime() - 365 * msPerDay);
}

export function formatCategory(category: MaintenanceTaskServiceCategory | null): string {
  if (!category) return 'General';
  return humanizeActionType(category);
}

export function formatFrequency(task: Pick<PropertyMaintenanceTask, 'isRecurring' | 'frequency'>): string {
  return task.isRecurring && task.frequency ? humanizeActionType(task.frequency) : 'One-time';
}

export function formatDueDate(
  nextDueDate: string | null,
  now: Date = new Date()
): { text: string; color: string } {
  if (!nextDueDate) {
    return { text: 'Not scheduled', color: 'text-gray-400' };
  }

  const dueDate = parseMaintenanceDate(nextDueDate);
  if (!dueDate) return { text: 'Not scheduled', color: 'text-gray-400' };
  const daysUntil = differenceInDays(dueDate, now);

  if (daysUntil < 0) return { text: `${Math.abs(daysUntil)} days overdue`, color: 'text-red-600' };
  if (daysUntil === 0) return { text: 'Due today', color: 'text-orange-600' };
  if (daysUntil <= 7) return { text: `Due in ${daysUntil} days`, color: 'text-orange-500' };
  if (daysUntil <= 30) return { text: `Due in ${daysUntil} days`, color: 'text-yellow-600' };
  return { text: format(dueDate, 'MMM dd, yyyy'), color: 'text-green-600' };
}

export function getTaskSourceBadge(
  task: Pick<PropertyMaintenanceTask, 'seasonalChecklistItemId' | 'source'>
): { label: string; variant: 'secondary' | 'outline' } | null {
  if (task.seasonalChecklistItemId || task.source === 'SEASONAL') {
    return { label: 'Seasonal', variant: 'secondary' };
  }

  if (task.source) {
    return {
      label: humanizeActionType(task.source),
      variant: 'outline',
    };
  }

  return null;
}

export function normalizeTaskPriority(priority?: string | null): string {
  const normalized = String(priority || '').toUpperCase();
  if (normalized === 'URGENT' || normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return 'MEDIUM';
}

const PRIORITY_ORDER: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export type TaskSplitOptions = {
  completedRange: CompletedRange;
  priorityOnly?: boolean;
  overdueOnly?: boolean;
  now?: Date;
};

export function splitAndSortTasks(
  tasks: PropertyMaintenanceTask[],
  { completedRange, priorityOnly = false, overdueOnly = false, now = new Date() }: TaskSplitOptions
): { openTasks: PropertyMaintenanceTask[]; completedTasks: PropertyMaintenanceTask[] } {
  const cutoff = cutoffForCompletedRange(completedRange, now);

  let open = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');

  if (overdueOnly) {
    open = open.filter((t) => {
      const dueDate = parseMaintenanceDate(t.nextDueDate);
      return dueDate ? dueDate < now : false;
    });
  }

  if (priorityOnly) {
    // A filter must filter: an empty result stays empty rather than
    // silently falling back to the full list.
    open = open
      .filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH')
      .sort((a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0));
  } else {
    open = [...open].sort((a, b) => {
      const aDueDate = parseMaintenanceDate(a.nextDueDate);
      const bDueDate = parseMaintenanceDate(b.nextDueDate);
      if (!aDueDate && !bDueDate) return 0;
      if (!aDueDate) return 1;
      if (!bDueDate) return -1;
      return aDueDate.getTime() - bDueDate.getTime();
    });
  }

  let completed = tasks.filter((t) => t.status === 'COMPLETED');
  if (cutoff) {
    completed = completed.filter((t) => {
      const d = parseMaintenanceDate(t.lastCompletedDate);
      return d ? d >= cutoff : false;
    });
  }
  completed = [...completed].sort((a, b) => {
    const ad = parseMaintenanceDate(a.lastCompletedDate)?.getTime() ?? 0;
    const bd = parseMaintenanceDate(b.lastCompletedDate)?.getTime() ?? 0;
    return bd - ad;
  });

  return { openTasks: open, completedTasks: completed };
}
