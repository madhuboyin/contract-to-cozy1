import { fireEvent, render, screen, act } from '@testing-library/react';
import { ResultRevalidationBoundary } from '../ResultRevalidationBoundary';
import { MaintenanceResultList } from '../MaintenanceResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { clearResultViews, createResultRequestTracker, mergeResultExecutions, readResultView, resultRequestKey, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance', filters: [], actions: [],
  sections: [{ id: 'open', title: 'Open', count: 8, items: Array.from({ length: 8 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, meta: ['Due tomorrow'], description: `Details ${i}`, status: 'PENDING' })) }],
};
function execution(revision = 1, executionId = 'execution'): AskExecutionResponse {
  return { executionId, sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-14T00:00:0${revision}.000Z`,
    viewState: { resultId: 'result', revision, domainScopePhrase: 'hvac', dateScopePhrase: 'this month', statusFilter: 'ALL_OPEN', selectedTaskId: null },
  } as AskExecutionResponse;
}
function List({ response }: { response: AskExecutionResponse }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><MaintenanceResultList block={response.blocks[0] as typeof block} disabled={false} onFilter={() => {}} onAction={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
}
beforeEach(() => window.sessionStorage.clear());

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
