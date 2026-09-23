import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { BuyerTaskResultList, buyerTaskActionsForLiveState } from '../BuyerTaskResultList';
import type { AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { HomeBuyerTask } from '@/types';

jest.mock('@/lib/api/client', () => ({ api: { getHomeBuyerTask: jest.fn() } }));
const mockedGet = api.getHomeBuyerTask as jest.MockedFunction<typeof api.getHomeBuyerTask>;

// FRD v1.46 buyer-closing capability-card slice.
const ACTIONS = [{ id: 'buyer-task-complete', label: 'Mark complete', message: 'Mark this Buyer Plan task complete.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'BUYER_TASK_COMPLETE' }];
const block = (actions = ACTIONS): Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> => ({
  type: 'GROUPED_LIST', id: 'buyer-deadlines-list', title: 'Deadlines and blockers', description: 'From the canonical Buyer Plan.',
  filters: [{ id: 'all', label: 'All', message: 'Now show all blocking deadlines', active: true }, { id: 'financing', label: 'Financing', message: 'Only show Financing deadlines', active: false }],
  actions: [],
  sections: [
    { id: 'milestones', title: 'Upcoming milestones', count: 1, items: [{ id: 'milestone-closing', title: 'Closing', description: null, meta: ['Due Oct 30, 2026'], status: 'NOT_STARTED', href: '/dashboard/properties/home/buyer-plan' }] },
    { id: 'blockers', title: 'Blocking before closing', count: 1, items: [{ id: 'task-appraisal', title: 'Order the appraisal', description: null, meta: ['Now'], status: 'PENDING', href: '/dashboard/properties/home/buyer-plan?taskId=task-appraisal', entityType: 'BUYER_TASK', actions }] },
  ],
});
const task = (overrides: Partial<HomeBuyerTask> = {}): HomeBuyerTask => ({
  id: 'task-appraisal', title: 'Order the appraisal', description: 'Your lender orders the appraisal once the loan is in process.', status: 'PENDING', applicability: 'APPLICABLE',
  priority: 'NOW', phase: 'DUE_DILIGENCE', blocking: true, required: true, statusReason: null, notes: null, dueAt: '2026-10-10T00:00:00.000Z', estimatedCostCents: 60000, ...overrides,
} as HomeBuyerTask);
const link = (href: string, content: React.ReactNode) => <a href={href}>{content}</a>;
const shown = () => Array.from(document.querySelectorAll('[data-buyer-task-action]')).map((node) => node.getAttribute('data-buyer-task-action'));
async function open(live: HomeBuyerTask | Error, onAction = jest.fn(), actions = ACTIONS, onAccessLost = jest.fn()) {
  if (live instanceof Error) mockedGet.mockRejectedValueOnce(live); else mockedGet.mockResolvedValueOnce({ success: true, data: live } as Awaited<ReturnType<typeof api.getHomeBuyerTask>>);
  render(<BuyerTaskResultList block={block(actions)} propertyId="home" onAction={onAction} onFilter={jest.fn()} onAccessLost={onAccessLost} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'Order the appraisal' }));
  return { onAction, onAccessLost };
}
const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });

beforeEach(() => jest.clearAllMocks());

test('Mark complete needs an open task that applies to this purchase', () => {
  const ids = (state: Partial<HomeBuyerTask>) => buyerTaskActionsForLiveState(ACTIONS, { status: 'PENDING', applicability: 'APPLICABLE', ...state }).map((action) => action.id);
  expect(ids({})).toEqual(['buyer-task-complete']);
  expect(ids({ status: 'IN_PROGRESS' })).toEqual(['buyer-task-complete']);
  expect(ids({ status: 'BLOCKED' })).toEqual(['buyer-task-complete']);
  expect(ids({ status: 'COMPLETED' })).toEqual([]);
  expect(ids({ status: 'NOT_NEEDED' })).toEqual([]);
  expect(ids({ applicability: 'NOT_APPLICABLE' })).toEqual([]);
});

test('a blocking task opens inline from the Buyer Plan task read; milestones stay links', async () => {
  await open(task());
  await waitFor(() => expect(screen.getByText('Your lender orders the appraisal once the loan is in process.')).toBeInTheDocument());
  expect(mockedGet).toHaveBeenCalledWith('home', 'task-appraisal');
  expect(screen.getByText('Blocks closing')).toBeInTheDocument();
  expect(screen.getByText('$600')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open in the Buyer Plan/ })).toHaveAttribute('href', '/dashboard/properties/home/buyer-plan?taskId=task-appraisal');
  expect(screen.queryByRole('button', { name: 'Closing' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Closing' })).toHaveAttribute('href', '/dashboard/properties/home/buyer-plan');
});

test('Mark complete follows the LIVE task and dispatches the exact task and canned message', async () => {
  const { onAction } = await open(task({ status: 'IN_PROGRESS' }));
  await waitFor(() => expect(shown()).toEqual(['buyer-task-complete']));
  fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
  expect(onAction).toHaveBeenCalledWith('BUYER_TASK', 'task-appraisal', 'Mark this Buyer Plan task complete.', 'BUYER_TASK_COMPLETE', 'MUTATE_RECORD');
});

test('a task completed since the list was read offers no action', async () => {
  await open(task({ status: 'COMPLETED' }));
  await waitFor(() => expect(screen.getByText('Completed')).toBeInTheDocument());
  expect(shown()).toEqual([]);
});

test('a viewer (no declared actions) gets read-only detail', async () => {
  await open(task(), jest.fn(), []);
  await waitFor(() => expect(screen.getByText('Blocks closing')).toBeInTheDocument());
  expect(shown()).toEqual([]);
});

test('a removed task is "no longer exists"; a property access denial redacts', async () => {
  const first = await open(apiError('Task not found or user does not have access.', 404));
  await waitFor(() => expect(screen.getByText('Task no longer exists')).toBeInTheDocument());
  expect(first.onAccessLost).not.toHaveBeenCalled();
});

test('a property access denial (same uncoded 404, different message) redacts instead', async () => {
  const { onAccessLost } = await open(apiError('Property not found or user does not have access.', 404));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
});

test('the lane chips still re-ask', () => {
  const onFilter = jest.fn();
  render(<BuyerTaskResultList block={block()} propertyId="home" onFilter={onFilter} onAccessLost={jest.fn()} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'Financing' }));
  expect(onFilter).toHaveBeenCalledWith('Only show Financing deadlines');
  expect(screen.getByRole('button', { name: 'All' })).toBeDisabled();
});

test('the registry routes buyer-deadlines-list here and wires item actions through', async () => {
  const onItemAction = jest.fn();
  mockedGet.mockResolvedValueOnce({ success: true, data: task() } as Awaited<ReturnType<typeof api.getHomeBuyerTask>>);
  render(<BlockView block={block()} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={onItemAction} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Order the appraisal' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mark complete' }));
  expect(onItemAction).toHaveBeenCalledWith('BUYER_TASK', 'task-appraisal', 'Mark this Buyer Plan task complete.', 'BUYER_TASK_COMPLETE', 'MUTATE_RECORD');
});
