import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskList } from '../components/TaskList';
import { computeMaintenanceStats } from '../components/MaintenanceStats';
import type { PropertyMaintenanceTask } from '@/types';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function makeTask(overrides: Partial<PropertyMaintenanceTask>): PropertyMaintenanceTask {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    propertyId: 'p1',
    title: 'Clean the gutters',
    description: 'Front and back',
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
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  } as PropertyMaintenanceTask;
}

describe('TaskList', () => {
  it('renders raw titles (no Title Casing) with row anchors and seasonal badge', () => {
    const task = makeTask({ id: 't1', seasonalChecklistItemId: 'sci1' });
    const { container } = render(
      <TaskList tasks={[task]} variant="open" onOpenTask={jest.fn()} onCompleteTask={jest.fn()} />
    );

    expect(screen.getAllByText('Clean the gutters').length).toBeGreaterThan(0);
    expect(screen.queryByText('Clean The Gutters')).toBeNull();
    expect(container.querySelectorAll('#task-row-t1')).toHaveLength(2); // table row + mobile card
    expect(screen.getAllByText('Seasonal').length).toBeGreaterThan(0);
  });

  it('uses canonical asset names for legacy Action Center risk titles', () => {
    const task = makeTask({
      id: 'risk-task',
      title: 'HIGH Risk: HVAC_FURNACE',
      description: 'Add Home Warranty',
      source: 'ACTION_CENTER',
    });
    render(<TaskList tasks={[task]} variant="open" onOpenTask={jest.fn()} />);

    expect(screen.getAllByText('HVAC Furnace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Review coverage options for HVAC Furnace.').length).toBeGreaterThan(0);
    expect(screen.queryByText('HIGH Risk: HVAC_FURNACE')).toBeNull();
    expect(screen.queryByText('Add Home Warranty')).toBeNull();
  });

  it('highlights the deep-linked row', () => {
    const task = makeTask({ id: 't2' });
    const { container } = render(
      <TaskList tasks={[task]} variant="open" highlightTaskId="t2" onOpenTask={jest.fn()} />
    );
    const rows = container.querySelectorAll('#task-row-t2');
    expect(rows[0].className).toContain('bg-teal-50');
    expect(rows[1].className).toContain('ring-teal-300');
  });

  it('hides the complete action for the completed variant and shows completion date', () => {
    const task = makeTask({
      id: 't3',
      status: 'COMPLETED',
      lastCompletedDate: new Date(NOW - DAY).toISOString(),
    });
    render(<TaskList tasks={[task]} variant="completed" onOpenTask={jest.fn()} onCompleteTask={jest.fn()} />);
    expect(screen.queryByLabelText('Mark complete')).toBeNull();
  });

  it('shows a row-level spinner for the pending task and disables its button', () => {
    const task = makeTask({ id: 't4' });
    render(
      <TaskList
        tasks={[task]}
        variant="open"
        pendingTaskId="t4"
        onOpenTask={jest.fn()}
        onCompleteTask={jest.fn()}
      />
    );
    const buttons = screen.getAllByLabelText('Mark complete');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('invokes onOpenTask from the details action and onCompleteTask from complete', () => {
    const onOpen = jest.fn();
    const onComplete = jest.fn();
    const task = makeTask({ id: 't5' });
    render(<TaskList tasks={[task]} variant="open" onOpenTask={onOpen} onCompleteTask={onComplete} />);

    fireEvent.click(screen.getAllByLabelText('Task details')[0]);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 't5' }));

    fireEvent.click(screen.getAllByLabelText('Mark complete')[0]);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 't5' }));
  });
});

describe('computeMaintenanceStats', () => {
  it('computes open, overdue, completed-30d, and next due', () => {
    const now = new Date(NOW);
    const tasks = [
      makeTask({ nextDueDate: new Date(NOW - 2 * DAY).toISOString() }), // open + overdue
      makeTask({ nextDueDate: new Date(NOW + 5 * DAY).toISOString() }), // open
      makeTask({ status: 'COMPLETED', lastCompletedDate: new Date(NOW - 3 * DAY).toISOString() }),
      makeTask({ status: 'COMPLETED', lastCompletedDate: new Date(NOW - 100 * DAY).toISOString() }),
      makeTask({ status: 'CANCELLED' }),
    ];
    const stats = computeMaintenanceStats(tasks, now);
    expect(stats.openCount).toBe(2);
    expect(stats.overdueCount).toBe(1);
    expect(stats.completed30dCount).toBe(1);
    expect(stats.nextDue?.getTime()).toBe(new Date(NOW - 2 * DAY).getTime());
    expect(stats.nextDueTask?.id).toBe(tasks[0].id);
    expect(stats.nextDueCount).toBe(1);
  });

  it('reports how many tasks share the earliest due date', () => {
    const dueDate = new Date(NOW + 5 * DAY).toISOString();
    const stats = computeMaintenanceStats([
      makeTask({ title: 'Inspect dryer vent', nextDueDate: dueDate }),
      makeTask({ title: 'Inspect exterior drainage', nextDueDate: dueDate }),
      makeTask({ title: 'Later task', nextDueDate: new Date(NOW + 10 * DAY).toISOString() }),
    ], new Date(NOW));

    expect(stats.nextDueTask?.title).toBe('Inspect dryer vent');
    expect(stats.nextDueCount).toBe(2);
  });

  it('ignores malformed dates instead of crashing a deep-linked maintenance page', () => {
    const malformed = makeTask({
      id: 'seasonal-task',
      source: 'SEASONAL',
      seasonalChecklistItemId: 'seasonal-item',
      nextDueDate: 'not-a-date',
      lastCompletedDate: 'also-not-a-date',
    });

    expect(() =>
      render(
        <TaskList
          tasks={[malformed]}
          variant="open"
          highlightTaskId="seasonal-task"
          onOpenTask={jest.fn()}
        />
      )
    ).not.toThrow();
    expect(computeMaintenanceStats([malformed], new Date(NOW)).nextDue).toBeNull();
    expect(screen.getAllByText('Not scheduled').length).toBeGreaterThan(0);
  });
});
