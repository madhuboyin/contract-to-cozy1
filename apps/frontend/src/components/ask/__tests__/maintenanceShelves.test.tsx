import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskGroupedListItem, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014, FRD v1.74): Maintenance, the first shelves adopter. The shelves
// keep the list's live-record detail, selection, paging and Back-button behaviour.

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const complete = { id: 'complete', label: 'Complete', message: 'Complete this maintenance task.', style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'MAINTENANCE_TASK_COMPLETE' };
const why = { id: 'why-important', label: 'Why is this important?', message: 'Why?', style: 'QUIET' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'GROUNDED_GUIDANCE' };
const task = (id: string, extra: Partial<AskGroupedListItem> = {}): AskGroupedListItem => ({
  id, title: `Task ${id}`, meta: ['HVAC'], status: 'PENDING', entityType: 'MAINTENANCE_TASK', actions: [why, complete], ...extra,
});
const maintenanceBlock = (overrides: Partial<GroupedList> = {}): GroupedList => ({
  type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance record', filters: [{ id: 'overdue', label: 'Overdue', message: 'Only show overdue tasks', active: false }],
  actions: [{ id: 'view-all-maintenance', label: 'View all in Maintenance', href: '/dashboard/maintenance?propertyId=home', style: 'SECONDARY' }],
  presentation: { pattern: 'SHELVES' },
  sections: [
    { id: 'overdue', title: 'Overdue', count: 1, offset: 0, items: [task('filter', { title: 'Replace HVAC filter', tone: 'CRITICAL', timingLabel: 'Was due Sep 12', amountLabel: 'Est. $25' })] },
    { id: 'due-soon', title: 'Due in the next 30 days', count: 60, offset: 0, items: Array.from({ length: 14 }, (_, index) => task(`soon-${index}`, { tone: 'CAUTION', timingLabel: `Due Oct ${index + 1}` })) },
  ],
  ...overrides,
});

function Harness({ block, onItemAction = jest.fn(), onFilterClick = jest.fn() }: { block: GroupedList; onItemAction?: jest.Mock; onFilterClick?: jest.Mock }) {
  const response = useMemo(() => ({
    sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'result', revision: 1 }, blocks: [block],
  } as AskExecutionResponse), [block]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={onFilterClick} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

const liveTask = (status: string) => ({ success: true, data: {
  id: 'filter', propertyId: 'home', title: 'Replace HVAC filter', description: 'Use a 16x25x1 filter.', status, priority: 'HIGH', source: 'USER_CREATED',
  nextDueDate: '2026-09-12T00:00:00.000Z', isRecurring: true, frequency: 'QUARTERLY', lastCompletedDate: null, estimatedCost: 25, actualCost: null,
  updatedAt: new Date('2026-09-20T00:00:00.000Z'), completedAt: null,
} } as unknown as Awaited<ReturnType<typeof api.getMaintenanceTask>>);

const view = () => readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result'));

beforeEach(() => {
  window.sessionStorage.clear();
  jest.restoreAllMocks();
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
});

test('each timing group is a shelf with an honest count; cards show timing and cost; filters and actions stay', async () => {
  const onFilterClick = jest.fn();
  const { container } = render(<Harness block={maintenanceBlock()} onFilterClick={onFilterClick} />);
  await waitFor(() => expect(container.querySelector('[data-display-pattern="shelves"]')).toBeInTheDocument());
  expect(screen.getByRole('list', { name: 'Overdue, 1 task' })).toBeInTheDocument();
  const soon = screen.getByRole('list', { name: 'Due in the next 30 days, Showing 12 of 60' });
  expect(within(soon).getAllByRole('button', { name: /^Task soon-/ })).toHaveLength(12);
  const card = screen.getByRole('button', { name: /Replace HVAC filter/ });
  expect(card).toHaveTextContent('Was due Sep 12');
  expect(card).toHaveTextContent('Est. $25');
  expect(card).toHaveAttribute('data-ask-task-id', 'filter');
  expect(card).toHaveAttribute('data-ask-detail-block', 'maintenance-groups');
  fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
  expect(onFilterClick).toHaveBeenCalledWith('Only show overdue tasks');
  expect(screen.getByRole('link', { name: /View all in Maintenance/ })).toBeInTheDocument();
});

test('opening a card selects the task and shows the live record in the sheet; a completed task loses Complete', async () => {
  jest.spyOn(api, 'getMaintenanceTask').mockResolvedValueOnce(liveTask('COMPLETED'));
  render(<Harness block={maintenanceBlock()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Replace HVAC filter/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Task detail: Replace HVAC filter' });
  await waitFor(() => expect(within(sheet).getByText('Use a 16x25x1 filter.')).toBeInTheDocument());
  expect(within(sheet).queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
  expect(within(sheet).getByRole('button', { name: 'Why is this important?' })).toBeInTheDocument();
  expect(view().selectedTaskId).toBe('filter');
  expect(view().detailTarget).toEqual({ blockId: 'maintenance-groups', entityId: 'filter' });
  expect(window.location.pathname).toBe('/dashboard/ask');
  expect(document.querySelector('[data-ask-shelf-item="filter"]')).toHaveAttribute('aria-current', 'true');
});

test('an open task keeps Complete in the sheet, and it is sent with the task identity', async () => {
  jest.spyOn(api, 'getMaintenanceTask').mockResolvedValueOnce(liveTask('PENDING'));
  const onItemAction = jest.fn();
  render(<Harness block={maintenanceBlock()} onItemAction={onItemAction} />);
  fireEvent.click(await screen.findByRole('button', { name: /Replace HVAC filter/ }));
  const sheet = await screen.findByRole('dialog');
  fireEvent.click(await within(sheet).findByRole('button', { name: 'Complete' }));
  expect(onItemAction).toHaveBeenCalledWith('MAINTENANCE_TASK', 'filter', 'Complete this maintenance task.', 'MAINTENANCE_TASK_COMPLETE', 'MUTATE_RECORD');
});

test('Escape and the browser Back button both close the sheet and clear the open detail', async () => {
  jest.spyOn(api, 'getMaintenanceTask').mockResolvedValue(liveTask('PENDING'));
  render(<Harness block={maintenanceBlock()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Replace HVAC filter/ }));
  fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(view().detailTarget).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Replace HVAC filter/ }));
  await screen.findByRole('dialog');
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: {} })));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(view().detailTarget).toBeNull();
});

test('a deleted task says so inside the sheet', async () => {
  jest.spyOn(api, 'getMaintenanceTask').mockRejectedValueOnce({ status: 404 });
  render(<Harness block={maintenanceBlock()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Replace HVAC filter/ }));
  const sheet = await screen.findByRole('dialog');
  expect(await within(sheet).findByText('Task no longer exists')).toBeInTheDocument();
});

test('See all switches to the list with its paging; the choice is kept and Shelves switches back', async () => {
  const { container, unmount } = render(<Harness block={maintenanceBlock()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'See all 60 in the list' }));
  expect(container.querySelector('[data-display-pattern="shelves"]')).not.toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Due in the next 30 days pages' })).toBeInTheDocument();
  expect(view().groupedListModes['maintenance-groups']).toBe('LIST');
  unmount();
  const restored = render(<Harness block={maintenanceBlock()} />);
  const shelves = await screen.findByRole('button', { name: 'Shelves' });
  expect(shelves).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(shelves);
  expect(restored.container.querySelector('[data-display-pattern="shelves"]')).toBeInTheDocument();
});

test('without the declared pattern Maintenance renders its list exactly as before, with no layout switch', () => {
  const { container } = render(<Harness block={maintenanceBlock({ presentation: undefined })} />);
  expect(container.querySelector('[data-display-pattern]')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Shelves' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replace HVAC filter' })).toHaveAttribute('data-maintenance-detail-trigger', 'filter');
});
