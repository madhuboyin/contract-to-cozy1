import {
  cutoffForCompletedRange,
  formatDueDate,
  getTaskSourceBadge,
  normalizeRange,
  normalizeView,
  parseMaintenanceDate,
  splitAndSortTasks,
} from '../taskDisplay';
import type { PropertyMaintenanceTask } from '@/types';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function makeTask(overrides: Partial<PropertyMaintenanceTask>): PropertyMaintenanceTask {
  return {
    id: Math.random().toString(36).slice(2),
    propertyId: 'p1',
    title: 'Clean the gutters',
    description: null,
    status: 'PENDING',
    priority: 'MEDIUM',
    source: null,
    isRecurring: false,
    frequency: null,
    isSeasonal: false,
    season: null,
    seasonalChecklistItemId: null,
    nextDueDate: null,
    lastCompletedDate: null,
    estimatedCost: null,
    actualCost: null,
    serviceCategory: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  } as PropertyMaintenanceTask;
}

describe('formatDueDate', () => {
  it('buckets overdue, today, near, and far dates', () => {
    expect(formatDueDate(new Date(NOW.getTime() - 3 * DAY).toISOString(), NOW)).toEqual({
      text: '3 days overdue',
      color: 'text-red-600',
    });
    expect(formatDueDate(NOW.toISOString(), NOW).text).toBe('Due today');
    expect(formatDueDate(new Date(NOW.getTime() + 5 * DAY).toISOString(), NOW).color).toBe(
      'text-orange-500'
    );
    expect(formatDueDate(new Date(NOW.getTime() + 20 * DAY).toISOString(), NOW).color).toBe(
      'text-yellow-600'
    );
    expect(formatDueDate(new Date(NOW.getTime() + 60 * DAY).toISOString(), NOW).color).toBe(
      'text-green-600'
    );
    expect(formatDueDate(null, NOW).text).toBe('Not scheduled');
    expect(formatDueDate('not-a-date', NOW)).toEqual({
      text: 'Not scheduled',
      color: 'text-gray-400',
    });
  });
});

describe('parseMaintenanceDate', () => {
  it('returns null for malformed legacy values instead of throwing', () => {
    expect(parseMaintenanceDate('not-a-date')).toBeNull();
    expect(parseMaintenanceDate(null)).toBeNull();
    expect(parseMaintenanceDate('2026-08-01T00:00:00.000Z')?.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z'
    );
  });
});

describe('getTaskSourceBadge', () => {
  it('labels seasonal tasks via link or source', () => {
    expect(getTaskSourceBadge(makeTask({ seasonalChecklistItemId: 'x' }))?.label).toBe('Seasonal');
    expect(getTaskSourceBadge(makeTask({ source: 'SEASONAL' }))?.label).toBe('Seasonal');
  });

  it('humanizes other sources and returns null when absent', () => {
    expect(getTaskSourceBadge(makeTask({ source: 'ACTION_CENTER' }))?.label).toBe('Action Center');
    expect(getTaskSourceBadge(makeTask({}))).toBeNull();
  });
});

describe('splitAndSortTasks', () => {
  const overdue = makeTask({ nextDueDate: new Date(NOW.getTime() - DAY).toISOString() });
  const soon = makeTask({ nextDueDate: new Date(NOW.getTime() + 2 * DAY).toISOString() });
  const unscheduled = makeTask({});
  const done = makeTask({
    status: 'COMPLETED',
    lastCompletedDate: new Date(NOW.getTime() - 10 * DAY).toISOString(),
  });
  const doneOld = makeTask({
    status: 'COMPLETED',
    lastCompletedDate: new Date(NOW.getTime() - 200 * DAY).toISOString(),
  });

  it('splits open and completed, sorting open by due date with unscheduled last', () => {
    const { openTasks, completedTasks } = splitAndSortTasks(
      [unscheduled, soon, overdue, done],
      { completedRange: 'all', now: NOW }
    );
    expect(openTasks.map((t) => t.id)).toEqual([overdue.id, soon.id, unscheduled.id]);
    expect(completedTasks.map((t) => t.id)).toEqual([done.id]);
  });

  it('treats malformed dates as unscheduled and keeps rendering the task', () => {
    const malformed = makeTask({ nextDueDate: 'not-a-date' });
    const { openTasks } = splitAndSortTasks([malformed, soon], {
      completedRange: 'all',
      now: NOW,
    });
    expect(openTasks.map((task) => task.id)).toEqual([soon.id, malformed.id]);
  });

  it('priority filter returns empty when nothing matches — never falls back to all', () => {
    const { openTasks } = splitAndSortTasks([overdue, soon], {
      completedRange: 'all',
      priorityOnly: true,
      now: NOW,
    });
    expect(openTasks).toEqual([]);
  });

  it('priority filter keeps only URGENT/HIGH sorted by severity', () => {
    const high = makeTask({ priority: 'HIGH' });
    const urgent = makeTask({ priority: 'URGENT' });
    const { openTasks } = splitAndSortTasks([soon, high, urgent], {
      completedRange: 'all',
      priorityOnly: true,
      now: NOW,
    });
    expect(openTasks.map((t) => t.id)).toEqual([urgent.id, high.id]);
  });

  it('overdue filter keeps only past-due open tasks', () => {
    const { openTasks } = splitAndSortTasks([overdue, soon, unscheduled], {
      completedRange: 'all',
      overdueOnly: true,
      now: NOW,
    });
    expect(openTasks.map((t) => t.id)).toEqual([overdue.id]);
  });

  it('completed range cutoffs filter old completions', () => {
    const { completedTasks } = splitAndSortTasks([done, doneOld], {
      completedRange: '30d',
      now: NOW,
    });
    expect(completedTasks.map((t) => t.id)).toEqual([done.id]);

    const all = splitAndSortTasks([done, doneOld], { completedRange: 'all', now: NOW });
    expect(all.completedTasks).toHaveLength(2);
  });
});

describe('normalizers', () => {
  it('coerce unknown values to defaults', () => {
    expect(normalizeView('bogus')).toBe('open');
    expect(normalizeView('completed')).toBe('completed');
    expect(normalizeRange(null)).toBe('30d');
    expect(cutoffForCompletedRange('all')).toBeNull();
  });
});
