/** @jest-environment jsdom */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ResultRevalidationBoundary } from '../ResultRevalidationBoundary';
import { useResultRefresh } from '../workspace/useResultRefresh';
import { createResultRequestTracker, mergeResultExecutions } from '@/features/ask/resultViewState';

jest.mock('@/lib/api/client', () => ({ api: { refreshAskExecution: jest.fn() } }));

const exec = (id: string, extra: Record<string, unknown> = {}) => ({ executionId: id, sessionId: 's1', status: 'ANSWERED', question: 'q', property: { id: 'p1' }, updatedAt: '2026-10-20T12:00:00Z', childExecutions: [], ...extra });

describe('stale answer banner', () => {
  it('says the answer may be out of date, offers a refresh, and shows nothing for a current answer', () => {
    const onRefresh = jest.fn();
    const { rerender } = render(<ResultRevalidationBoundary executionId="e1" stale={{ since: '2026-10-20T12:05:00Z' }} onRefresh={onRefresh}><p>Answer</p></ResultRevalidationBoundary>);
    expect(screen.getByRole('status')).toHaveTextContent('Something changed after this was shown, so it may be out of date.');
    expect(screen.getByText('Answer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender(<ResultRevalidationBoundary executionId="e1" stale={{ since: '2026-10-20T12:05:00Z' }} onRefresh={onRefresh} refreshing><p>Answer</p></ResultRevalidationBoundary>);
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    rerender(<ResultRevalidationBoundary executionId="e1" stale={null} onRefresh={onRefresh}><p>Answer</p></ResultRevalidationBoundary>);
    expect(document.querySelector('[data-ask-stale]')).toBeNull();
  });

  it('defers to a refresh error or lost access instead of stacking messages', () => {
    const { rerender } = render(<ResultRevalidationBoundary executionId="e1" stale={{ since: 'x' }} issue={{ message: 'Could not refresh this result.', accessLost: false }}><p>Answer</p></ResultRevalidationBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh this result.');
    expect(document.querySelector('[data-ask-stale]')).toBeNull();
    rerender(<ResultRevalidationBoundary executionId="e1" stale={{ since: 'x' }} issue={{ message: 'No access', accessLost: true }}><p>Answer</p></ResultRevalidationBoundary>);
    expect(screen.queryByText('Answer')).not.toBeInTheDocument();
    expect(document.querySelector('[data-ask-stale]')).toBeNull();
  });
});

describe('marking answers stale after a confirmed write', () => {
  function setup() {
    const fns = { setExecutions: jest.fn(), setPendingWork: jest.fn(), setJustUpdatedExecutionId: jest.fn() };
    const refs = { activeSessionRef: { current: 's1' }, requests: { current: createResultRequestTracker() }, deniedProperties: { current: new Set<string>() } };
    const hook = renderHook(() => useResultRefresh({ executions: [exec('e1')], ...refs, ...fns } as never));
    return { hook, fns };
  }
  const apply = (setter: jest.Mock, callIndex: number, list: unknown[]) => setter.mock.calls[callIndex][0](list);

  it('marks the answers the write changed but could not refresh, and leaves the others and the write\'s own receipt alone', () => {
    const { hook, fns } = setup();
    const receipt = exec('w1', { status: 'COMPLETED', reconciliation: { staleExecutionIds: ['e2'], markedElsewhere: 3 } });
    act(() => hook.result.current.updateExecution(receipt as never));
    const merged = apply(fns.setExecutions, 0, [exec('e1'), exec('e2')]) as Array<{ executionId: string }>;
    expect(merged.map((item) => item.executionId)).toEqual(['e1', 'e2', 'w1']);
    const marked = apply(fns.setExecutions, 1, merged) as Array<{ executionId: string; staleSince?: string | null }>;
    expect(marked.find((item) => item.executionId === 'e2')?.staleSince).toEqual(expect.any(String));
    expect(marked.find((item) => item.executionId === 'e1')?.staleSince).toBeUndefined();
    expect(marked.find((item) => item.executionId === 'w1')?.staleSince).toBeUndefined();
  });

  it('does nothing extra when every affected answer was refreshed', () => {
    const { hook, fns } = setup();
    act(() => hook.result.current.updateExecution(exec('w1', { status: 'COMPLETED', reconciliation: { staleExecutionIds: [], markedElsewhere: 0 } }) as never));
    expect(fns.setExecutions).toHaveBeenCalledTimes(1);
  });

  it('a successful refresh replaces the stale answer with a current one', () => {
    const stale = exec('e2', { staleSince: '2026-10-20T12:05:00Z' });
    const fresh = exec('e2', { updatedAt: '2026-10-20T12:10:00Z', staleSince: null });
    const merged = mergeResultExecutions([stale as never], [fresh as never]);
    expect(merged).toHaveLength(1);
    expect(merged[0].staleSince).toBeNull();
  });
});
