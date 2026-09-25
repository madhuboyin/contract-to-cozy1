/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useAskRequest } from '../workspace/useAskRequest';
import { draftStorageKey } from '../workspace/support';
import { createResultRequestTracker, EMPTY_RESULT_VIEW, resultViewKey, writeResultView } from '@/features/ask/resultViewState';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';

jest.mock('@/lib/api/client', () => ({ api: { createAskExecution: jest.fn() } }));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
const create = api.createAskExecution as jest.Mock;
const tracked = track as jest.Mock;

const exec = (id: string, extra: Record<string, unknown> = {}) => ({ executionId: id, sessionId: 's1', status: 'ANSWERED', question: 'q', property: { id: 'p1' }, operation: { id: 'OP' }, updatedAt: '2026-09-25T00:00:00Z', ...extra }) as any;
const ok = (data: unknown) => Promise.resolve({ success: true, data });

function setup(overrides: Record<string, unknown> = {}) {
  const fns = { setInput: jest.fn(), setError: jest.fn(), setLoading: jest.fn(), setServiceUnavailable: jest.fn(), setExecutions: jest.fn(), setJustUpdatedExecutionId: jest.fn(), setRecentSessionsEpoch: jest.fn() };
  const refs = {
    requests: { current: createResultRequestTracker() }, inFlight: { current: null as any }, stoppedRequests: { current: new Set<number>() },
    deniedProperties: { current: new Set<string>() }, activeSessionRef: { current: 's1' }, textareaRef: { current: null },
  };
  const props = { sessionId: 's1', loading: false, executions: [] as any[], selectedPropertyId: 'p1', mode: 'panel' as const, launchSurface: '', launchCapabilityId: '', safeBackTo: '', ...refs, ...fns, ...overrides };
  const hook = renderHook(() => useAskRequest(props as any));
  return { hook, fns, refs, props };
}
const merged = (fns: any, current: any[] = []) => fns.setExecutions.mock.calls[0][0](current);

beforeEach(() => { create.mockReset(); tracked.mockReset(); window.localStorage.clear(); window.sessionStorage.clear(); });

describe('ask', () => {
  it('sends the trimmed question, clears the box and its draft, and appends the answer with its child executions', async () => {
    create.mockImplementation(() => ok(exec('e1', { childExecutions: [exec('c1')] })));
    window.localStorage.setItem(draftStorageKey('p1', 's1'), 'draft');
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.ask('  Is my roof ok?  '); });
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({ sessionId: 's1', message: 'Is my roof ok?', propertyId: 'p1' });
    expect(typeof body.clientRequestId).toBe('string');
    expect(body.launchContext.surface).toBe('GLOBAL_LAUNCHER');
    expect(fns.setInput).toHaveBeenCalledWith('');
    expect(window.localStorage.getItem(draftStorageKey('p1', 's1'))).toBeNull();
    expect(merged(fns).map((e: any) => e.executionId)).toEqual(['e1', 'c1']);
    expect(fns.setJustUpdatedExecutionId).toHaveBeenCalledWith('e1');
    expect(fns.setRecentSessionsEpoch).toHaveBeenCalledTimes(1);
    expect(fns.setLoading.mock.calls.map(([v]) => v)).toEqual([true, false]);
  });

  it('launch surface and capability apply to the first message only; the page surface is used on the page', async () => {
    create.mockImplementation(() => ok(exec('e1')));
    const first = setup({ launchSurface: 'WARRANTIES_PAGE', launchCapabilityId: 'cap-1', mode: 'page' });
    await act(async () => { await first.hook.result.current.ask('hi'); });
    expect(create.mock.calls[0][0].launchContext).toMatchObject({ surface: 'WARRANTIES_PAGE', capabilityId: 'cap-1' });
    create.mockClear();
    const later = setup({ launchSurface: 'WARRANTIES_PAGE', launchCapabilityId: 'cap-1', mode: 'page', executions: [exec('old')] });
    await act(async () => { await later.hook.result.current.ask('again'); });
    expect(create.mock.calls[0][0].launchContext.surface).toBe('ASK_PAGE');
    expect(create.mock.calls[0][0].launchContext.capabilityId).toBeUndefined();
  });

  it('passes prompt context and the safe back link through', async () => {
    create.mockImplementation(() => ok(exec('e1')));
    const { hook } = setup({ safeBackTo: '/dashboard/x' });
    await act(async () => { await hook.result.current.ask('go', undefined, { propertyId: 'p2', entityType: 'WARRANTY', entityId: 'w1', operationId: 'OP2', documentId: 'd1' } as any); });
    expect(create.mock.calls[0][0]).toMatchObject({ propertyId: 'p2', launchContext: { entityType: 'WARRANTY', entityId: 'w1', operationId: 'OP2', documentId: 'd1', returnTo: '/dashboard/x' } });
  });

  it('does nothing for an empty question, no session, or a running question', async () => {
    const empty = setup();
    await act(async () => { await empty.hook.result.current.ask('   '); });
    const noSession = setup({ sessionId: '' });
    await act(async () => { await noSession.hook.result.current.ask('hi'); });
    const busy = setup({ loading: true });
    await act(async () => { await busy.hook.result.current.ask('hi'); });
    expect(create).not.toHaveBeenCalled();
  });

  it('a failure puts the question back with its draft and shows the message; a paused service shows no message', async () => {
    create.mockRejectedValueOnce(new Error('offline'));
    const a = setup();
    await act(async () => { await a.hook.result.current.ask('Is my roof ok?'); });
    expect(a.fns.setInput).toHaveBeenLastCalledWith('Is my roof ok?');
    expect(window.localStorage.getItem(draftStorageKey('p1', 's1'))).toBe('Is my roof ok?');
    expect(a.fns.setError).toHaveBeenLastCalledWith('offline');
    expect(a.fns.setExecutions).not.toHaveBeenCalled();
    create.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    const b = setup();
    await act(async () => { await b.hook.result.current.ask('hi'); });
    expect(b.fns.setServiceUnavailable).toHaveBeenCalledWith(true);
    expect(b.fns.setError).toHaveBeenLastCalledWith(null);
    create.mockResolvedValueOnce({ success: false, message: 'Nope' });
    const c = setup();
    await act(async () => { await c.hook.result.current.ask('hi'); });
    expect(c.fns.setError).toHaveBeenLastCalledWith('Nope');
  });

  it('discards an answer that arrives after the person moved to another session or lost the home, without restoring text', async () => {
    let release: (v: unknown) => void = () => {};
    create.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const moved = setup();
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = moved.hook.result.current.ask('hi'); });
    moved.refs.activeSessionRef.current = 'other';
    await act(async () => { release({ success: true, data: exec('e1') }); await pending; });
    expect(moved.fns.setExecutions).not.toHaveBeenCalled();
    const denied = setup();
    act(() => { pending = denied.hook.result.current.ask('hi'); });
    denied.refs.deniedProperties.current.add('s1:p1');
    await act(async () => { release({ success: true, data: exec('e1') }); await pending; });
    expect(denied.fns.setExecutions).not.toHaveBeenCalled();
    create.mockImplementation(() => new Promise((_, reject) => { release = reject; }));
    const failed = setup();
    act(() => { pending = failed.hook.result.current.ask('hi'); });
    failed.refs.activeSessionRef.current = 'other';
    await act(async () => { release(new Error('late')); await pending; });
    expect(failed.fns.setInput.mock.calls.map(([v]) => v)).toEqual(['']);
    expect(failed.fns.setError).not.toHaveBeenCalledWith('late');
  });

  it('"this task" uses the one selected task from the result on screen', async () => {
    create.mockImplementation(() => ok(exec('e2')));
    const source = exec('e1', { viewState: { resultId: 'r1' } });
    writeResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'r1'), { ...EMPTY_RESULT_VIEW, selectedTaskId: 'task-9' });
    const { hook } = setup({ executions: [source] });
    await act(async () => { await hook.result.current.ask('Reschedule this task'); });
    expect(create.mock.calls[0][0].launchContext).toMatchObject({ sourceExecutionId: 'e1', entityType: 'MAINTENANCE_TASK', entityId: 'task-9' });
    create.mockClear();
    const none = setup({ executions: [exec('e1', { viewState: { resultId: 'r-none' } })] });
    await act(async () => { await none.hook.result.current.ask('Reschedule this task'); });
    expect(create.mock.calls[0][0].launchContext.entityType).toBeUndefined();
    create.mockClear();
    writeResultView(window.sessionStorage, resultViewKey('s1', 'p1', 'r2'), { ...EMPTY_RESULT_VIEW, selectedTaskId: 'task-10' });
    const two = setup({ executions: [source, exec('e3', { viewState: { resultId: 'r2' } })] });
    await act(async () => { await two.hook.result.current.ask('Reschedule this task'); });
    expect(create.mock.calls[0][0].launchContext.entityType).toBeUndefined();
  });

  it('records the prompt outcome when the question came from a suggested prompt', async () => {
    const attribution = { promptId: 'pr1', categoryId: 'MAINTAIN', source: 'DISCOVERY' } as any;
    create.mockImplementationOnce(() => ok(exec('e1', { status: 'ANSWERED' })));
    const a = setup();
    await act(async () => { await a.hook.result.current.ask('hi', attribution); });
    expect(tracked).toHaveBeenLastCalledWith('ask_prompt_outcome', expect.objectContaining({ promptId: 'pr1', executionId: 'e1', operationId: 'OP', status: 'ANSWERED', succeeded: true }));
    create.mockImplementationOnce(() => ok(exec('e2', { status: 'FAILED_TERMINAL' })));
    await act(async () => { await a.hook.result.current.ask('hi', attribution); });
    expect(tracked).toHaveBeenLastCalledWith('ask_prompt_outcome', expect.objectContaining({ succeeded: false }));
    create.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await a.hook.result.current.ask('hi', attribution); });
    expect(tracked).toHaveBeenLastCalledWith('ask_prompt_outcome', expect.objectContaining({ status: 'REQUEST_FAILED', succeeded: false }));
    tracked.mockClear();
    create.mockImplementationOnce(() => ok(exec('e3')));
    await act(async () => { await a.hook.result.current.ask('plain'); });
    expect(tracked).not.toHaveBeenCalled();
  });
});

describe('stopAsking and editAndResend', () => {
  it('stopping brings the question back, says so, and discards the late answer without touching the loading state of the stop', async () => {
    let release: (v: unknown) => void = () => {};
    create.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { hook, fns, refs } = setup();
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = hook.result.current.ask('Is my roof ok?'); });
    expect(refs.inFlight.current).toMatchObject({ message: 'Is my roof ok?' });
    act(() => hook.result.current.stopAsking());
    expect(refs.inFlight.current).toBeNull();
    expect(fns.setInput).toHaveBeenLastCalledWith('Is my roof ok?');
    expect(window.localStorage.getItem(draftStorageKey('p1', 's1'))).toBe('Is my roof ok?');
    expect(fns.setError).toHaveBeenLastCalledWith(expect.stringMatching(/^Stopped\./));
    expect(fns.setLoading).toHaveBeenLastCalledWith(false);
    const loadingCalls = fns.setLoading.mock.calls.length;
    await act(async () => { release({ success: true, data: exec('late') }); await pending; });
    expect(fns.setExecutions).not.toHaveBeenCalled();
    expect(fns.setLoading).toHaveBeenCalledTimes(loadingCalls);
  });

  it('stop with nothing running does nothing', () => {
    const { hook, fns } = setup();
    act(() => hook.result.current.stopAsking());
    expect(fns.setInput).not.toHaveBeenCalled();
    expect(fns.setError).not.toHaveBeenCalled();
  });

  it('edit and send again puts an earlier question in the box with its draft and clears the error', () => {
    const { hook, fns } = setup();
    act(() => hook.result.current.editAndResend('Earlier question'));
    expect(fns.setError).toHaveBeenCalledWith(null);
    expect(fns.setInput).toHaveBeenCalledWith('Earlier question');
    expect(window.localStorage.getItem(draftStorageKey('p1', 's1'))).toBe('Earlier question');
  });
});
