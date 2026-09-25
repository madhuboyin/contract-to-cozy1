/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSessionLifecycle } from '../workspace/useSessionLifecycle';
import { draftStorageKey } from '../workspace/support';
import { createResultRequestTracker, EMPTY_RESULT_VIEW, resultViewKey, writeResultView, readResultView } from '@/features/ask/resultViewState';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getAskSession: jest.fn(), deleteAskSession: jest.fn() } }));
const getSession = api.getAskSession as jest.Mock;
const del = api.deleteAskSession as jest.Mock;

const exec = (id: string, extra: Record<string, unknown> = {}) => ({ executionId: id, sessionId: 's1', property: { id: 'p1' }, viewState: null, ...extra }) as any;

function setup(overrides: Record<string, unknown> = {}) {
  const fns = {
    setSessionId: jest.fn(), setInput: jest.fn(), setExecutions: jest.fn(), setRefreshIssues: jest.fn(), setRefreshRequests: jest.fn(), setHistoryLoading: jest.fn(),
    setError: jest.fn(), setLoading: jest.fn(), setConfirmClear: jest.fn(), setJustUpdatedExecutionId: jest.fn(), setServiceUnavailable: jest.fn(),
    setRecentSessionsEpoch: jest.fn(), setHistoryDrawerOpen: jest.fn(), refreshResult: jest.fn().mockResolvedValue(undefined),
  };
  const refs = {
    requests: { current: createResultRequestTracker() }, deniedProperties: { current: new Set<string>() },
    activeSessionRef: { current: '' }, activeSessionPropertyRef: { current: undefined as string | undefined }, textareaRef: { current: null },
  };
  const props = {
    mode: 'panel' as 'page' | 'panel', sessionId: '', executions: [] as any[], selectedPropertyId: 'p1' as string | undefined, initialQuestion: '', initialSessionId: '', initialExecutionId: '',
    propertyMismatch: false, availabilityEpoch: 0, historyLoading: false, loading: false, ...refs, ...fns, ...overrides,
  };
  const hook = renderHook((p: typeof props) => useSessionLifecycle(p as any), { initialProps: props });
  return { hook, props, fns, refs };
}

beforeEach(() => { getSession.mockReset(); del.mockReset(); window.localStorage.clear(); window.sessionStorage.clear(); window.history.replaceState(null, '', '/dashboard/ask'); });

describe('starting a conversation', () => {
  it('a fresh visit starts a new empty session with no loading', () => {
    const { fns, refs } = setup();
    expect(refs.activeSessionRef.current).toMatch(/.+/);
    expect(fns.setSessionId).toHaveBeenCalledWith(refs.activeSessionRef.current);
    expect(fns.setExecutions).toHaveBeenCalledWith([]);
    expect(fns.setHistoryLoading).toHaveBeenLastCalledWith(false);
    expect(refs.activeSessionPropertyRef.current).toBe('p1');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('an initial question fills the box and is saved as the draft once', () => {
    const { fns, refs, hook, props } = setup({ initialQuestion: 'Is my roof ok?' });
    expect(fns.setInput).toHaveBeenCalledWith('Is my roof ok?');
    hook.rerender({ ...props, initialQuestion: 'Is my roof ok?', sessionId: refs.activeSessionRef.current });
    expect(window.localStorage.getItem(draftStorageKey('p1', refs.activeSessionRef.current))).toBe('Is my roof ok?');
    fns.setInput.mockClear();
    hook.rerender({ ...props, initialQuestion: 'Is my roof ok?', sessionId: refs.activeSessionRef.current, historyLoading: true });
    expect(fns.setInput).not.toHaveBeenCalled();
  });

  it('an initial question is applied once per question, not again when the session changes', () => {
    const { fns, refs, hook, props } = setup({ initialQuestion: 'Is my roof ok?' });
    hook.rerender({ ...props, initialQuestion: 'Is my roof ok?', sessionId: 'sA' });
    fns.setInput.mockClear();
    hook.rerender({ ...props, initialQuestion: 'Is my roof ok?', sessionId: 'sB' });
    expect(fns.setInput).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(draftStorageKey('p1', 'sB'))).toBeNull();
    expect(refs.activeSessionRef.current).toBeTruthy();
  });

  it('otherwise restores the saved draft of the session', () => {
    window.sessionStorage.setItem('ctc:ask-active-session:p1', 'saved');
    getSession.mockReturnValue(new Promise(() => {}));
    window.localStorage.setItem(draftStorageKey('p1', 'saved'), 'half typed');
    const { fns } = setup();
    expect(fns.setInput).toHaveBeenCalledWith('half typed');
  });

  it('does nothing while the property in the address differs from the selected one', () => {
    const { fns } = setup({ propertyMismatch: true });
    expect(fns.setSessionId).not.toHaveBeenCalled();
  });

  it('resets the per-result state and the denied homes when it starts', () => {
    const denied = { current: new Set(['s1:p1']) };
    const { fns } = setup({ deniedProperties: denied });
    expect(denied.current.size).toBe(0);
    expect(fns.setRefreshIssues).toHaveBeenCalledWith({});
    expect(fns.setRefreshRequests).toHaveBeenCalledWith({});
  });

  it('forgets in-flight result requests, so a late refresh cannot land in the new session', () => {
    const requests = { current: createResultRequestTracker() };
    const token = requests.current.begin('s1:e1');
    setup({ requests });
    expect(requests.current.current('s1:e1', token)).toBe(false);
  });
});

describe('restoring a conversation', () => {
  it('loads the explicit session, clears saved views of results no longer in it, and shows it', async () => {
    writeResultView(window.sessionStorage, resultViewKey('sX', 'p1', 'gone'), { ...EMPTY_RESULT_VIEW, selectedTaskId: 't1' });
    getSession.mockResolvedValue({ success: true, data: { executions: [exec('e1')] } });
    const { fns, refs } = setup({ initialSessionId: 'sX' });
    expect(fns.setHistoryLoading).toHaveBeenCalledWith(true);
    await waitFor(() => expect(fns.setExecutions).toHaveBeenCalledWith([exec('e1')]));
    expect(refs.activeSessionRef.current).toBe('sX');
    expect(readResultView(window.sessionStorage, resultViewKey('sX', 'p1', 'gone')).selectedTaskId).toBeNull();
    await waitFor(() => expect(fns.setHistoryLoading).toHaveBeenLastCalledWith(false));
  });

  it('coming back to a result refreshes it and scrolls to it', async () => {
    jest.useFakeTimers();
    document.body.innerHTML = '<article id="ask-execution-e2"></article>';
    const article = document.getElementById('ask-execution-e2')!;
    article.scrollIntoView = jest.fn();
    getSession.mockResolvedValue({ success: true, data: { executions: [exec('e1'), exec('e2')] } });
    const { fns } = setup({ initialSessionId: 'sX', initialExecutionId: 'e2' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fns.refreshResult).toHaveBeenCalledWith(exec('e2'));
    act(() => { jest.advanceTimersByTime(60); });
    expect(article.scrollIntoView).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('the result to return to can come from the record kept when the person left', async () => {
    window.sessionStorage.setItem('ctc:ask-return-execution:sX', 'e2');
    getSession.mockResolvedValue({ success: true, data: { executions: [exec('e1'), exec('e2')] } });
    const { fns } = setup({ initialSessionId: 'sX' });
    await waitFor(() => expect(fns.refreshResult).toHaveBeenCalledWith(exec('e2')));
  });

  it('a result id that is not in the session is ignored', async () => {
    getSession.mockResolvedValue({ success: true, data: { executions: [exec('e1')] } });
    const { fns } = setup({ initialSessionId: 'sX', initialExecutionId: 'nope' });
    await waitFor(() => expect(fns.setExecutions).toHaveBeenCalledWith([exec('e1')]));
    expect(fns.refreshResult).not.toHaveBeenCalled();
  });

  it('a conversation that is gone is forgotten; a paused service is flagged; a plain failure only empties the list', async () => {
    window.sessionStorage.setItem('ctc:ask-active-session:p1', 'sX');
    getSession.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_SESSION_NOT_FOUND' }));
    setup({ initialSessionId: 'sX' });
    await waitFor(() => expect(window.sessionStorage.getItem('ctc:ask-active-session:p1')).toBeNull());
    getSession.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    const paused = setup({ initialSessionId: 'sY' });
    await waitFor(() => expect(paused.fns.setServiceUnavailable).toHaveBeenCalledWith(true));
    window.sessionStorage.setItem('ctc:ask-active-session:p1', 'sZ');
    getSession.mockRejectedValueOnce(new Error('offline'));
    const plain = setup({ initialSessionId: 'sZ' });
    await waitFor(() => expect(plain.fns.setHistoryLoading).toHaveBeenLastCalledWith(false));
    expect(plain.fns.setServiceUnavailable).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('ctc:ask-active-session:p1')).toBe('sZ');
  });

  it('drops the answer when the session changed while it loaded', async () => {
    let release: (v: unknown) => void = () => {};
    getSession.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { fns, refs } = setup({ initialSessionId: 'sX' });
    refs.activeSessionRef.current = 'other';
    await act(async () => { release({ success: true, data: { executions: [exec('e1')] } }); await Promise.resolve(); });
    expect(fns.setExecutions).not.toHaveBeenCalledWith([exec('e1')]);
  });
});

describe('keeping the record and address in step', () => {
  it('records the active session for the home', () => {
    const { hook, props, refs } = setup();
    refs.activeSessionPropertyRef.current = 'p1';
    hook.rerender({ ...props, sessionId: 'abc' });
    expect(window.sessionStorage.getItem('ctc:ask-active-session:p1')).toBe('abc');
    expect(refs.activeSessionRef.current).toBe('abc');
  });

  it('on the page, puts the latest result in the address once loading is done, and does not rewrite it when it already matches', () => {
    const { hook, props } = setup({ mode: 'page' });
    const replace = jest.spyOn(window.history, 'replaceState');
    replace.mockClear();
    hook.rerender({ ...props, mode: 'page', sessionId: 's1', executions: [exec('e1'), exec('e2')], historyLoading: true });
    expect(replace).not.toHaveBeenCalled();
    hook.rerender({ ...props, mode: 'page', sessionId: 's1', executions: [exec('e1'), exec('e2')], historyLoading: false });
    expect(window.location.search).toContain('sessionId=s1');
    expect(window.location.search).toContain('executionId=e2');
    replace.mockClear();
    hook.rerender({ ...props, mode: 'page', sessionId: 's1', executions: [exec('e1'), exec('e2')], historyLoading: false, availabilityEpoch: 0 });
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  it('in the panel, leaves the address alone', () => {
    const { hook, props } = setup();
    hook.rerender({ ...props, sessionId: 's1', executions: [exec('e1')] });
    expect(window.location.search).toBe('');
  });
});

describe('back and forward', () => {
  const pop = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

  it('to an earlier conversation loads it', async () => {
    getSession.mockResolvedValue({ success: true, data: { executions: [exec('e9', { sessionId: 'sOld' })] } });
    window.localStorage.setItem(draftStorageKey('p1', 'sOld'), 'old draft');
    const { fns, refs } = setup({ mode: 'page' });
    window.history.replaceState(null, '', '/dashboard/ask?sessionId=sOld');
    pop();
    expect(fns.setError).toHaveBeenCalledWith(null);
    await waitFor(() => expect(fns.setSessionId).toHaveBeenLastCalledWith('sOld'));
    expect(refs.activeSessionRef.current).toBe('sOld');
    expect(fns.setInput).toHaveBeenLastCalledWith('old draft');
    expect(fns.setExecutions).toHaveBeenLastCalledWith([exec('e9', { sessionId: 'sOld' })]);
  });

  it('to an address with no session starts a fresh one', () => {
    const { fns, refs } = setup({ mode: 'page' });
    const before = refs.activeSessionRef.current;
    window.history.replaceState(null, '', '/dashboard/ask');
    refs.activeSessionRef.current = 'something';
    pop();
    expect(refs.activeSessionRef.current).not.toBe('something');
    expect(refs.activeSessionRef.current).not.toBe(before);
    expect(fns.setExecutions).toHaveBeenLastCalledWith([]);
    expect(fns.setHistoryLoading).toHaveBeenLastCalledWith(false);
  });

  it('to the session already open does nothing; in the panel it is not listened to', () => {
    const { hook, fns, refs } = setup({ mode: 'page' });
    fns.setSessionId.mockClear();
    window.history.replaceState(null, '', `/dashboard/ask?sessionId=${refs.activeSessionRef.current}`);
    pop();
    expect(fns.setSessionId).not.toHaveBeenCalled();
    hook.unmount();
    const panel = setup();
    panel.fns.setSessionId.mockClear();
    window.history.replaceState(null, '', '/dashboard/ask?sessionId=other');
    pop();
    expect(panel.fns.setSessionId).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('a failed load shows the message, or flags a paused service', async () => {
    getSession.mockRejectedValueOnce(new Error('offline'));
    const a = setup({ mode: 'page' });
    window.history.replaceState(null, '', '/dashboard/ask?sessionId=sOld');
    pop();
    await waitFor(() => expect(a.fns.setError).toHaveBeenLastCalledWith('offline'));
    getSession.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    pop();
    await waitFor(() => expect(a.fns.setServiceUnavailable).toHaveBeenCalledWith(true));
  });
});

describe('clearHistory and startNewSession', () => {
  it('clearing deletes the session and its draft and starts a fresh one', async () => {
    del.mockResolvedValue({ success: true });
    window.localStorage.setItem(draftStorageKey('p1', 's1'), 'draft');
    writeResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'r1'), { ...EMPTY_RESULT_VIEW, selectedTaskId: 't1' });
    const { hook, fns, refs } = setup({ sessionId: 's1' });
    await act(async () => { await hook.result.current.clearHistory(); });
    expect(del).toHaveBeenCalledWith('s1');
    expect(window.localStorage.getItem(draftStorageKey('p1', 's1'))).toBeNull();
    expect(readResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'r1')).selectedTaskId).toBeNull();
    expect(refs.activeSessionRef.current).not.toBe('s1');
    expect(fns.setExecutions).toHaveBeenLastCalledWith([]);
    expect(fns.setConfirmClear).toHaveBeenLastCalledWith(false);
    expect(fns.setRecentSessionsEpoch).toHaveBeenCalledTimes(1);
    expect(fns.setLoading.mock.calls.map(([v]) => v)).toEqual([true, false]);
  });

  it('a failed clear keeps the conversation and shows the message', async () => {
    del.mockResolvedValue({ success: false, message: 'Nope' });
    const { hook, fns, refs } = setup({ sessionId: 's1' });
    const before = refs.activeSessionRef.current;
    await act(async () => { await hook.result.current.clearHistory(); });
    expect(fns.setError).toHaveBeenLastCalledWith('Nope');
    expect(refs.activeSessionRef.current).toBe(before);
    expect(fns.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('clearing does nothing without a session or while a question runs', async () => {
    const none = setup({ sessionId: '' });
    await act(async () => { await none.hook.result.current.clearHistory(); });
    const busy = setup({ sessionId: 's1', loading: true });
    await act(async () => { await busy.hook.result.current.clearHistory(); });
    expect(del).not.toHaveBeenCalled();
  });

  it('a new conversation resets the box, closes the drawer, refreshes the history and moves the address on the page', () => {
    const { hook, fns, refs } = setup({ mode: 'page', sessionId: 's1' });
    const before = refs.activeSessionRef.current;
    const push = jest.spyOn(window.history, 'pushState');
    fns.setInput.mockClear();
    act(() => hook.result.current.startNewSession());
    expect(refs.activeSessionRef.current).not.toBe(before);
    expect(fns.setInput).toHaveBeenLastCalledWith('');
    expect(fns.setHistoryDrawerOpen).toHaveBeenCalledWith(false);
    expect(fns.setRecentSessionsEpoch).toHaveBeenCalledTimes(1);
    expect(fns.setJustUpdatedExecutionId).toHaveBeenCalledWith(null);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
    const busy = setup({ loading: true });
    const start = busy.refs.activeSessionRef.current;
    act(() => busy.hook.result.current.startNewSession());
    expect(busy.refs.activeSessionRef.current).toBe(start);
  });
});
