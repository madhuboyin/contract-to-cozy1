/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useResultRefresh } from '../workspace/useResultRefresh';
import { restoreResultPosition } from '../workspace/support';
import { createResultRequestTracker, EMPTY_RESULT_VIEW, resultViewKey, writeResultView, readResultView } from '@/features/ask/resultViewState';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { refreshAskExecution: jest.fn() } }));
const refresh = api.refreshAskExecution as jest.Mock;

const exec = (id: string, extra: Record<string, unknown> = {}) => ({ executionId: id, sessionId: 's1', status: 'ANSWERED', question: 'q', property: { id: 'p1' }, updatedAt: '2026-09-25T00:00:00Z', ...extra }) as any;

function setup(executions: any[] = [exec('e1')]) {
  const fns = { setExecutions: jest.fn(), setPendingWork: jest.fn(), setJustUpdatedExecutionId: jest.fn() };
  const refs = { activeSessionRef: { current: 's1' }, requests: { current: createResultRequestTracker() }, deniedProperties: { current: new Set<string>() } };
  const hook = renderHook(() => useResultRefresh({ executions, ...refs, ...fns } as any));
  return { hook, fns, refs };
}
const run = (fn: jest.Mock, list: any[]) => fn.mock.calls[0][0](list);

beforeEach(() => { refresh.mockReset(); window.sessionStorage.clear(); document.body.innerHTML = ''; });

describe('refreshResult', () => {
  it('merges the refreshed result and its child executions, marks it pending while it runs, and clears the mark', async () => {
    let release: (v: unknown) => void = () => {};
    refresh.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { hook, fns } = setup();
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = hook.result.current.refreshResult(exec('e1')); });
    expect(Object.keys(hook.result.current.refreshRequests)).toEqual(['s1:e1']);
    await act(async () => { release({ success: true, data: exec('e1', { updatedAt: '2026-09-26T00:00:00Z', childExecutions: [exec('c1')] }) }); await pending; });
    expect(run(fns.setExecutions, [exec('e1')]).map((e: any) => e.executionId)).toEqual(['e1', 'c1']);
    expect(hook.result.current.refreshRequests).toEqual({});
    expect(hook.result.current.refreshIssues).toEqual({});
  });

  it('keeps the last view and shows a message on an ordinary failure, and clears it on the next try', async () => {
    refresh.mockRejectedValueOnce(new Error('offline'));
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.refreshResult(exec('e1')); });
    expect(hook.result.current.refreshIssues.e1).toEqual({ accessLost: false, message: 'Could not refresh this result. Showing the last known view. offline' });
    expect(fns.setExecutions).not.toHaveBeenCalled();
    refresh.mockResolvedValueOnce({ success: true, data: exec('e1') });
    await act(async () => { await hook.result.current.refreshResult(exec('e1')); });
    expect(hook.result.current.refreshIssues.e1).toBeUndefined();
  });

  it('on access loss blanks every result of that home, drops its pending work, clears saved views and records the issue', async () => {
    writeResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'r1'), { ...EMPTY_RESULT_VIEW, selectedTaskId: 't1' });
    refresh.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_PROPERTY_NOT_FOUND' }));
    const { hook, fns, refs } = setup([exec('e1'), exec('e2'), exec('e3', { property: { id: 'p2' } })]);
    await act(async () => { await hook.result.current.refreshResult(exec('e1')); });
    expect(refs.deniedProperties.current.has('s1:p1')).toBe(true);
    expect(readResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'r1')).selectedTaskId).toBeNull();
    const blanked = run(fns.setExecutions, [exec('e1'), exec('e3', { property: { id: 'p2' }, question: 'keep me' })]);
    expect(blanked.map((e: any) => e.question)).toEqual(['Unavailable result', 'keep me']);
    const pending = run(fns.setPendingWork, [{ execution: exec('x') }, { execution: exec('y', { property: { id: 'p2' } }) }]);
    expect(pending.map((p: any) => p.execution.executionId)).toEqual(['y']);
    expect(Object.keys(hook.result.current.refreshIssues).sort()).toEqual(['e1', 'e2']);
    expect(hook.result.current.refreshIssues.e1).toMatchObject({ accessLost: true });
  });

  it('records the access-loss issue for the result that failed even when it is not in the list', async () => {
    refresh.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'AUTH_REQUIRED' }));
    const { hook } = setup([exec('e2')]);
    await act(async () => { await hook.result.current.refreshResult(exec('e1')); });
    expect(Object.keys(hook.result.current.refreshIssues).sort()).toEqual(['e1', 'e2']);
  });

  it('ignores an answer that arrives after the person left the session, lost the home, or asked again', async () => {
    let release: (v: unknown) => void = () => {};
    refresh.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const moved = setup();
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = moved.hook.result.current.refreshResult(exec('e1')); });
    moved.refs.activeSessionRef.current = 'other';
    await act(async () => { release({ success: true, data: exec('e1') }); await pending; });
    expect(moved.fns.setExecutions).not.toHaveBeenCalled();
    const denied = setup();
    act(() => { pending = denied.hook.result.current.refreshResult(exec('e1')); });
    denied.refs.deniedProperties.current.add('s1:p1');
    await act(async () => { release({ success: true, data: exec('e1') }); await pending; });
    expect(denied.fns.setExecutions).not.toHaveBeenCalled();
    const twice = setup();
    let first: (v: unknown) => void = () => {};
    refresh.mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }));
    refresh.mockImplementationOnce(() => Promise.resolve({ success: true, data: exec('e1', { question: 'newer' }) }));
    let p1: Promise<void> = Promise.resolve();
    act(() => { p1 = twice.hook.result.current.refreshResult(exec('e1')); });
    await act(async () => { await twice.hook.result.current.refreshResult(exec('e1')); });
    await act(async () => { first({ success: true, data: exec('e1', { question: 'older' }) }); await p1; });
    expect(twice.fns.setExecutions).toHaveBeenCalledTimes(1);
    expect(Object.keys(twice.hook.result.current.refreshRequests)).toEqual([]);
  });

  it('an older request finishing does not clear the pending mark of a newer one for the same result', async () => {
    let first: (v: unknown) => void = () => {};
    let second: (v: unknown) => void = () => {};
    refresh.mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }));
    refresh.mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
    const { hook } = setup();
    let p1: Promise<void> = Promise.resolve();
    let p2: Promise<void> = Promise.resolve();
    act(() => { p1 = hook.result.current.refreshResult(exec('e1')); });
    act(() => { p2 = hook.result.current.refreshResult(exec('e1')); });
    await act(async () => { first({ success: true, data: exec('e1') }); await p1; });
    expect(Object.keys(hook.result.current.refreshRequests)).toEqual(['s1:e1']);
    await act(async () => { second({ success: true, data: exec('e1') }); await p2; });
    expect(hook.result.current.refreshRequests).toEqual({});
  });
});

describe('updateExecution', () => {
  it('merges an update from a card and marks it as just updated', () => {
    const { hook, fns } = setup();
    act(() => hook.result.current.updateExecution(exec('e1', { childExecutions: [exec('c1')] })));
    expect(run(fns.setExecutions, [exec('e1')]).map((e: any) => e.executionId)).toEqual(['e1', 'c1']);
    expect(fns.setJustUpdatedExecutionId).toHaveBeenCalledWith('e1');
  });

  it('drops the pending-work entry once the execution no longer needs the person, and keeps it while it does', () => {
    const done = setup();
    act(() => done.hook.result.current.updateExecution(exec('e1', { status: 'COMPLETED' })));
    expect(run(done.fns.setPendingWork, [{ execution: exec('e1') }, { execution: exec('e2') }]).map((p: any) => p.execution.executionId)).toEqual(['e2']);
    const waiting = setup();
    act(() => waiting.hook.result.current.updateExecution(exec('e1', { status: 'NEEDS_CONFIRMATION' })));
    expect(waiting.fns.setPendingWork).not.toHaveBeenCalled();
  });

  it('ignores an update for another session or a home whose access was lost', () => {
    const other = setup();
    act(() => other.hook.result.current.updateExecution(exec('e1', { sessionId: 'other' })));
    const denied = setup();
    denied.refs.deniedProperties.current.add('s1:p1');
    act(() => denied.hook.result.current.updateExecution(exec('e1')));
    expect(other.fns.setExecutions).not.toHaveBeenCalled();
    expect(denied.fns.setExecutions).not.toHaveBeenCalled();
  });

  it('filters child executions of a denied home out of the merge', () => {
    const { hook, fns, refs } = setup();
    refs.deniedProperties.current.add('s1:p9');
    act(() => hook.result.current.updateExecution(exec('e1', { childExecutions: [exec('c1'), exec('c2', { property: { id: 'p9' } })] })));
    expect(run(fns.setExecutions, []).map((e: any) => e.executionId)).toEqual(['e1', 'c1']);
  });
});

describe('restoreResultPosition', () => {
  const mount = () => {
    document.body.innerHTML = '<article id="ask-execution-e1"><div data-ask-task-id="t1" tabindex="-1"></div><div data-ask-task-id="t2" tabindex="-1"></div></article>';
    const article = document.getElementById('ask-execution-e1')!;
    const rows = Array.from(article.querySelectorAll<HTMLElement>('[data-ask-task-id]'));
    rows.forEach((row) => { row.scrollIntoView = jest.fn(); });
    article.scrollIntoView = jest.fn();
    window.scrollBy = jest.fn();
    return { article, rows };
  };
  const save = (view: Record<string, unknown>) => writeResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'e1'), { ...EMPTY_RESULT_VIEW, ...view } as any);

  it('scrolls to and focuses the selected task', () => {
    const { rows } = mount();
    save({ selectedTaskId: 't2' });
    restoreResultPosition(exec('e1'));
    expect(rows[1].scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[0].scrollIntoView).not.toHaveBeenCalled();
  });

  it('otherwise returns to the saved scroll offset, and otherwise to the top of the result', () => {
    const { article } = mount();
    article.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    save({ scrollOffset: 100 });
    restoreResultPosition(exec('e1'));
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 200 });
    (window.scrollBy as jest.Mock).mockClear();
    save({ scrollOffset: null });
    restoreResultPosition(exec('e1'));
    expect(article.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('does nothing when the result is not on screen', () => {
    window.scrollBy = jest.fn();
    expect(() => restoreResultPosition(exec('missing'))).not.toThrow();
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});
