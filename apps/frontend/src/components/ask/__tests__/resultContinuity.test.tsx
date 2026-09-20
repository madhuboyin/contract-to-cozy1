import { fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import { ResultRevalidationBoundary } from '../ResultRevalidationBoundary';
import { MaintenanceResultList } from '../MaintenanceResultList';
import { BlockView } from '../AskWorkspace';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { clearResultViews, createResultRequestTracker, mergeResultExecutions, readResultView, resultRequestKey, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance', filters: [], actions: [],
  sections: [{ id: 'open', title: 'Open', count: 8, items: Array.from({ length: 8 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, meta: ['Due tomorrow'], description: `Details ${i}`, status: 'PENDING' })) }],
};
function execution(revision = 1, executionId = 'execution'): AskExecutionResponse {
  return { executionId, sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-14T00:00:0${revision}.000Z`,
    viewState: { resultId: 'result', revision, domainScopePhrase: 'hvac', dateScopePhrase: 'this month', statusFilter: 'ALL_OPEN', selectedTaskId: null },
  } as AskExecutionResponse;
}
function List({ response, onPage = () => {}, onAccessLost = () => {} }: { response: AskExecutionResponse; onPage?: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><MaintenanceResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} disabled={false} onFilter={() => {}} onPage={onPage} onAction={() => {}} onAccessLost={onAccessLost} link={(_, label) => label} /></ResultViewContext.Provider>;
}
beforeEach(() => { window.sessionStorage.clear(); jest.restoreAllMocks(); });

test('a return refresh failure arriving after mount is displayed; success clears it', async () => {
  const content = <button>Complete task</button>;
  const { rerender } = render(<ResultRevalidationBoundary executionId="x" issue={null}>{content}</ResultRevalidationBoundary>);
  await act(async () => { await Promise.resolve(); rerender(<ResultRevalidationBoundary executionId="x" issue={{ message: 'Could not refresh', accessLost: false }}>{content}</ResultRevalidationBoundary>); });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh');
  rerender(<ResultRevalidationBoundary executionId="x" issue={null}>{content}</ResultRevalidationBoundary>);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('access loss removes original content and every command, rather than only disabling refresh', () => {
  const { rerender } = render(<ResultRevalidationBoundary executionId="x"><div>Private roof record<button>Complete task</button></div></ResultRevalidationBoundary>);
  rerender(<ResultRevalidationBoundary executionId="x" issue={{ message: 'Access lost', accessLost: true }}><div>Private roof record<button>Complete task</button></div></ResultRevalidationBoundary>);
  expect(screen.queryByText('Private roof record')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Access lost');
});

test('selection, expanded details and shown page survive unmount, reload and a new execution for the same result', () => {
  const first = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Select task Task 6' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show details Task 6' }));
  first.unmount();
  render(<List response={execution(2, 'refinement')} />);
  expect(screen.getByRole('button', { name: 'Selected Task 6' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Details 6')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Select task Task 7' })).toBeInTheDocument();
});

test('a task leaving the result clears selection rather than selecting a substitute', () => {
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Select task Task 1' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], items: block.sections[0].items.filter((item) => item.id !== 'task-1') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).selectedTaskId).toBeNull();
});

test('clicking a maintenance task title opens canonical detail inline without navigating', async () => {
  const href = '/dashboard/maintenance?propertyId=home&taskId=task-0';
  const response = execution();
  response.blocks = [{ ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], href }] }] }];
  jest.spyOn(api, 'getMaintenanceTask').mockResolvedValueOnce({ success: true, data: {
    id: 'task-0', propertyId: 'home', title: 'Task 0', description: 'Canonical task detail', status: 'PENDING', priority: 'HIGH', source: 'USER_CREATED',
    assetType: 'HVAC', riskLevel: null, nextDueDate: '2026-10-01T00:00:00.000Z', isRecurring: true, frequency: 'ANNUALLY', lastCompletedDate: null,
    estimatedCost: 250, actualCost: null, serviceCategory: 'HVAC', serviceProviderId: null, bookingId: null, inventoryItemId: null, warrantyId: null,
    seasonalChecklistItemId: null, actionKey: null, createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-17T00:00:00.000Z'), completedAt: null,
  } } as Awaited<ReturnType<typeof api.getMaintenanceTask>>);
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');

  render(<List response={response} />);
  expect(screen.queryByRole('link', { name: 'Task 0' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Task 0' }));

  await waitFor(() => expect(screen.getByText('Canonical task detail')).toBeInTheDocument());
  expect(screen.getByText('High')).toBeInTheDocument();
  expect(screen.getByText('$250')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard/ask');
  expect(window.location.search).toContain('sessionId=session');
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBe('task-0');
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTarget).toEqual({ blockId: 'maintenance-groups', entityId: 'task-0' });
  expect(window.history.state.askDetail).toEqual({ key: resultViewKey('session', 'home', 'result'), blockId: 'maintenance-groups', entityId: 'task-0' });
});

test('browser back closes the current in-Ask detail without changing the conversation', async () => {
  jest.spyOn(api, 'getMaintenanceTask').mockResolvedValue({ success: true, data: {
    id: 'task-0', propertyId: 'home', title: 'Task 0', status: 'PENDING', priority: 'HIGH', source: 'USER_CREATED',
  } } as Awaited<ReturnType<typeof api.getMaintenanceTask>>);
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Task 0' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close task detail for Task 0' })).toBeInTheDocument());
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: {} })));
  expect(screen.queryByRole('button', { name: 'Close task detail for Task 0' })).not.toBeInTheDocument();
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTarget).toBeNull();
  expect(window.location.pathname).toBe('/dashboard/ask');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Task 0' })).toHaveFocus());
});

test('canonical completed state removes stale mutation actions from the row and detail', async () => {
  const response = execution();
  response.blocks = [{ ...block, sections: [{ ...block.sections[0], items: [{
    ...block.sections[0].items[0], entityType: 'MAINTENANCE_TASK', actions: [
      { id: 'complete', label: 'Complete', message: 'Complete this maintenance task.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'MAINTENANCE_TASK_COMPLETE' },
      { id: 'why', label: 'Why?', message: 'Why?', style: 'QUIET', interactionType: 'CONVERSATION_CONTINUE', operationId: 'GROUNDED_GUIDANCE' },
    ],
  }] }] }];
  jest.spyOn(api, 'getMaintenanceTask').mockResolvedValueOnce({ success: true, data: {
    id: 'task-0', propertyId: 'home', title: 'Task 0', description: null, status: 'COMPLETED', priority: 'HIGH', source: 'USER_CREATED', assetType: null, riskLevel: null,
    nextDueDate: null, isRecurring: false, frequency: null, lastCompletedDate: '2026-09-16T00:00:00.000Z', estimatedCost: null, actualCost: null, serviceCategory: null,
    serviceProviderId: null, bookingId: null, inventoryItemId: null, warrantyId: null, seasonalChecklistItemId: null, actionKey: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-17T00:00:00.000Z'), completedAt: new Date('2026-09-16T00:00:00.000Z'),
  } } as Awaited<ReturnType<typeof api.getMaintenanceTask>>);
  render(<List response={response} />);
  expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Task 0' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument());
  expect(screen.getAllByRole('button', { name: 'Why?' }).length).toBeGreaterThan(0);
});

test('deleted task detail is distinct and removes stale actions until refresh', async () => {
  const response = execution();
  response.blocks = [{ ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], entityType: 'MAINTENANCE_TASK', actions: [
    { id: 'complete', label: 'Complete', message: 'Complete this maintenance task.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'MAINTENANCE_TASK_COMPLETE' },
  ] }] }] }];
  jest.spyOn(api, 'getMaintenanceTask').mockRejectedValueOnce({ status: 404 });
  render(<List response={response} />);
  fireEvent.click(screen.getByRole('button', { name: 'Task 0' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Task no longer exists'));
  expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
});

test('detail access revocation invokes whole-result redaction instead of leaving stale controls', async () => {
  const onAccessLost = jest.fn();
  jest.spyOn(api, 'getMaintenanceTask').mockRejectedValueOnce({ status: 403 });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Task 0' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
});

test('server-paged maintenance sections navigate inline and retain the traditional page as a separate option', () => {
  const onPage = jest.fn();
  const response = execution();
  response.blocks = [{
    ...block,
    sections: [{ ...block.sections[0], count: 120, offset: 50 }],
    actions: [{ id: 'view-all-maintenance', label: 'View all in Maintenance', href: '/dashboard/maintenance?propertyId=home', style: 'SECONDARY' }],
  }];
  render(<List response={response} onPage={onPage} />);
  fireEvent.click(screen.getByRole('button', { name: /Previous page of Open/ }));
  fireEvent.click(screen.getByRole('button', { name: /Next page of Open/ }));
  expect(onPage).toHaveBeenNthCalledWith(1, 'open', 'PREVIOUS');
  expect(onPage).toHaveBeenNthCalledWith(2, 'open', 'NEXT');
  expect(screen.getByText('Server results 51–58 of 120')).toBeInTheDocument();
  expect(screen.getByText('View all in Maintenance')).toBeInTheDocument();
});

test('session deletion removes view state without affecting another session', () => {
  const key = resultViewKey('session', 'home', 'result');
  sessionStorage.setItem(key, '{}');
  const other = resultViewKey('other', 'home', 'result');
  sessionStorage.setItem(other, '{}');
  clearResultViews(sessionStorage, 'session');
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(sessionStorage.getItem(other)).toBe('{}');
});

test('an older revision cannot overwrite the newer filter result, including a refreshed child execution', () => {
  const latest = execution(3, 'filter');
  const old = execution(2);
  expect(mergeResultExecutions([latest], [old])).toEqual([latest]);
  expect(mergeResultExecutions([old], [latest])).toEqual([old, latest]);
});

test('a filter request invalidates an earlier refresh of the same result but not another result', () => {
  const tracker = createResultRequestTracker();
  const key = resultRequestKey(execution());
  const refresh = tracker.begin(key);
  const other = tracker.begin('another');
  const filter = tracker.begin(key);
  expect(tracker.current(key, refresh)).toBe(false);
  expect(tracker.current(key, filter)).toBe(true);
  expect(tracker.current('another', other)).toBe(true);
  tracker.clear();
  expect(tracker.current(key, filter)).toBe(false);
  tracker.begin(key);
  expect(tracker.current(key, refresh)).toBe(false);
});

// B07 fix: Buyer (and any other operation using the generic GROUPED_LIST
// renderer, i.e. BlockView, not the bespoke MaintenanceResultList) has no
// viewState of its own -- useResultView's key falls back to the raw
// executionId, which stays stable across a genuine refresh of the SAME
// row (unlike a brand-new ask, which mints a new executionId).
const buyerBlock: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'buyer-deadlines-tasks', title: 'Buyer deadlines', filters: [], actions: [],
  sections: [{ id: 'deadlines', title: 'Deadlines', count: 2, items: [
    { id: 'buyer-task-1', title: 'Order inspection', meta: ['Due tomorrow'], href: '/dashboard/properties/home/buyer-plan?taskId=buyer-task-1' },
    { id: 'buyer-task-2', title: 'Sign disclosure', meta: ['Due next week'], href: '/dashboard/properties/home/buyer-plan?taskId=buyer-task-2' },
  ] }],
};
function buyerExecution(updatedAt: string, block: typeof buyerBlock = buyerBlock): AskExecutionResponse {
  return { executionId: 'buyer-execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt, viewState: null } as AskExecutionResponse;
}
function BuyerList({ response }: { response: AskExecutionResponse }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={response.blocks[0]} executionId={response.executionId} onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}
function storeBuyerSelection(taskId: string) {
  sessionStorage.setItem(resultViewKey('session', 'home', 'buyer-execution'), JSON.stringify({ selectedTaskId: taskId, expandedRows: [], visibleCounts: {}, scrollOffset: null }));
}

test('a selected generic row receives the marker and visible highlight', () => {
  storeBuyerSelection('buyer-task-1');
  render(<BuyerList response={buyerExecution('2026-09-14T00:00:01.000Z')} />);
  const row = screen.getByText('Order inspection').closest('li')!;
  expect(row).toHaveAttribute('data-ask-task-id', 'buyer-task-1');
  expect(row).toHaveClass('border-teal-600', 'bg-teal-50');
  expect(screen.getByText('Sign disclosure').closest('li')).not.toHaveClass('border-teal-600');
});

test('Buyer selection survives a refresh of the same execution (non-Maintenance lists do not lose selection on refresh)', () => {
  storeBuyerSelection('buyer-task-1');
  const { rerender } = render(<BuyerList response={buyerExecution('2026-09-14T00:00:01.000Z')} />);
  rerender(<BuyerList response={buyerExecution('2026-09-14T00:00:02.000Z')} />);
  expect(screen.getByText('Order inspection').closest('li')).toHaveClass('border-teal-600', 'bg-teal-50');
});

test('a Buyer task leaving the result clears selection rather than substituting another', () => {
  storeBuyerSelection('buyer-task-1');
  const { rerender } = render(<BuyerList response={buyerExecution('2026-09-14T00:00:01.000Z')} />);
  const nextBlock = { ...buyerBlock, sections: [{ ...buyerBlock.sections[0], items: buyerBlock.sections[0].items.filter((item) => item.id !== 'buyer-task-1') }] };
  rerender(<BuyerList response={buyerExecution('2026-09-14T00:00:02.000Z', nextBlock)} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'buyer-execution')).selectedTaskId).toBeNull();
});
