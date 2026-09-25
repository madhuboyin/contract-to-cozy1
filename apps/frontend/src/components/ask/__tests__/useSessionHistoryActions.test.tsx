/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useSessionHistoryActions } from '../workspace/useSessionHistoryActions';
import { draftStorageKey } from '../workspace/support';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { updateAskSession: jest.fn(), deleteAskSession: jest.fn(), getAskSession: jest.fn() } }));
const update = api.updateAskSession as jest.Mock;
const del = api.deleteAskSession as jest.Mock;
const getSession = api.getAskSession as jest.Mock;

const row = (id: string, extra: Record<string, unknown> = {}) => ({ sessionId: id, title: `t-${id}`, pinned: false, archived: false, titleSetByUser: false, property: { id: 'p1' }, latestExecutionId: `e-${id}`, ...extra }) as any;

function setup(overrides: Record<string, unknown> = {}) {
  const fns = {
    setRecentSessions: jest.fn(), setPinnedSessions: jest.fn(), setSearchSessions: jest.fn(), setRecentSessionsEpoch: jest.fn(), setServiceUnavailable: jest.fn(),
    setSessionId: jest.fn(), setExecutions: jest.fn(), setConfirmClear: jest.fn(), setJustUpdatedExecutionId: jest.fn(), setError: jest.fn(), setHistoryLoading: jest.fn(),
    setInput: jest.fn(), setHistoryDrawerOpen: jest.fn(),
  };
  const activeSessionRef = { current: 'open' };
  const activeSessionPropertyRef = { current: 'p1' as string | undefined };
  const props = { selectedPropertyId: 'p1', mode: 'panel' as const, loading: false, activeSessionRef, activeSessionPropertyRef, ...fns, ...overrides };
  const hook = renderHook(() => useSessionHistoryActions(props as any));
  return { hook, fns, activeSessionRef, activeSessionPropertyRef };
}
const applied = (fn: jest.Mock, items: any[]) => fn.mock.calls[0][0](items);

beforeEach(() => { update.mockReset(); del.mockReset(); getSession.mockReset(); window.localStorage.clear(); });

describe('changeHistorySession', () => {
  it('a rename updates the loaded rows in place and does not reload the lists', async () => {
    update.mockResolvedValue({ success: true, data: { sessionId: 'a', title: '  New name ', pinned: false, archived: false, titleSetByUser: true } });
    const { hook, fns } = setup();
    let ok = false;
    await act(async () => { ok = await hook.result.current.changeHistorySession(row('a'), { title: 'New name' }); });
    expect(ok).toBe(true);
    expect(applied(fns.setRecentSessions, [row('a'), row('b')]).map((r: any) => [r.sessionId, r.title, r.titleSetByUser])).toEqual([['a', 'New name', true], ['b', 't-b', false]]);
    expect(fns.setPinnedSessions).toHaveBeenCalled();
    expect(fns.setSearchSessions).toHaveBeenCalled();
    expect(fns.setRecentSessionsEpoch).not.toHaveBeenCalled();
    expect(hook.result.current.sessionActionId).toBeNull();
  });

  it('pinning or archiving reloads the lists', async () => {
    update.mockResolvedValue({ success: true, data: { sessionId: 'a', title: '', pinned: true, archived: false, titleSetByUser: false } });
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.changeHistorySession(row('a'), { pinned: true }); });
    expect(applied(fns.setRecentSessions, [row('a')])[0]).toMatchObject({ pinned: true, title: 't-a' });
    expect(fns.setRecentSessionsEpoch).toHaveBeenCalledTimes(1);
  });

  it('says nothing changed on a failure, and reloads when the conversation is gone', async () => {
    update.mockRejectedValueOnce(new Error('boom'));
    const { hook, fns } = setup();
    let ok = true;
    await act(async () => { ok = await hook.result.current.changeHistorySession(row('a'), { archived: true }); });
    expect(ok).toBe(false);
    expect(hook.result.current.sessionActionIssue).toBe('Could not update that conversation. Nothing was changed.');
    expect(fns.setRecentSessionsEpoch).not.toHaveBeenCalled();
    update.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_SESSION_NOT_FOUND' }));
    await act(async () => { await hook.result.current.changeHistorySession(row('a'), { archived: true }); });
    expect(hook.result.current.sessionActionIssue).toMatch(/no longer available/);
    expect(fns.setRecentSessionsEpoch).toHaveBeenCalledTimes(1);
  });

  it('flags the service unavailable only for the role-disabled code', async () => {
    update.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.changeHistorySession(row('a'), { pinned: true }); });
    expect(fns.setServiceUnavailable).toHaveBeenCalledWith(true);
  });
});

describe('deleteHistorySession', () => {
  it('deletes another conversation: removes it from every list and its saved draft, and keeps the open one', async () => {
    del.mockResolvedValue({ success: true });
    window.localStorage.setItem(draftStorageKey('p1', 'a'), 'draft');
    const { hook, fns, activeSessionRef } = setup();
    await act(async () => { expect(await hook.result.current.deleteHistorySession(row('a'))).toBe(true); });
    expect(del).toHaveBeenCalledWith('a');
    for (const setter of [fns.setRecentSessions, fns.setPinnedSessions, fns.setSearchSessions]) expect(applied(setter, [row('a'), row('b')]).map((r: any) => r.sessionId)).toEqual(['b']);
    expect(window.localStorage.getItem(draftStorageKey('p1', 'a'))).toBeNull();
    expect(activeSessionRef.current).toBe('open');
    expect(fns.setSessionId).not.toHaveBeenCalled();
    expect(fns.setRecentSessionsEpoch).toHaveBeenCalledTimes(1);
  });

  it('deleting the open conversation starts a fresh one', async () => {
    del.mockResolvedValue({ success: true });
    const { hook, fns, activeSessionRef } = setup();
    await act(async () => { await hook.result.current.deleteHistorySession(row('open')); });
    expect(activeSessionRef.current).not.toBe('open');
    expect(fns.setSessionId).toHaveBeenCalledWith(activeSessionRef.current);
    expect(fns.setExecutions).toHaveBeenCalledWith([]);
    expect(fns.setConfirmClear).toHaveBeenCalledWith(false);
  });

  it('keeps everything when the delete fails', async () => {
    del.mockRejectedValue(new Error('boom'));
    const { hook, fns } = setup();
    await act(async () => { expect(await hook.result.current.deleteHistorySession(row('a'))).toBe(false); });
    expect(hook.result.current.sessionActionIssue).toBe('Could not delete that conversation. It is still here.');
    expect(fns.setRecentSessions).not.toHaveBeenCalled();
  });

  it('runs one session action at a time', async () => {
    let release: (v: unknown) => void = () => {};
    del.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { hook } = setup();
    let first: Promise<boolean> = Promise.resolve(false);
    act(() => { first = hook.result.current.deleteHistorySession(row('a')); });
    expect(hook.result.current.sessionActionId).toBe('a');
    let second = true;
    await act(async () => { second = await hook.result.current.deleteHistorySession(row('b')); });
    expect(second).toBe(false);
    expect(del).toHaveBeenCalledTimes(1);
    await act(async () => { release({ success: true }); await first; });
  });
});

describe('openRecentSession', () => {
  it('opens a conversation in the same home with its saved draft, and closes the drawer', async () => {
    getSession.mockResolvedValue({ success: true, data: { executions: [{ executionId: 'e1' }] } });
    window.localStorage.setItem(draftStorageKey('p1', 'a'), 'half typed');
    const { hook, fns, activeSessionRef } = setup();
    await act(async () => { await hook.result.current.openRecentSession(row('a')); });
    expect(activeSessionRef.current).toBe('a');
    expect(fns.setSessionId).toHaveBeenCalledWith('a');
    expect(fns.setExecutions).toHaveBeenCalledWith([{ executionId: 'e1' }]);
    expect(fns.setInput).toHaveBeenCalledWith('half typed');
    expect(fns.setHistoryDrawerOpen).toHaveBeenCalledWith(false);
    expect(hook.result.current.openingRecentSessionId).toBeNull();
    expect(fns.setHistoryLoading).toHaveBeenLastCalledWith(false);
  });

  it('drops an empty conversation from the lists and says it is unavailable', async () => {
    getSession.mockResolvedValue({ success: true, data: { executions: [] } });
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.openRecentSession(row('a')); });
    expect(applied(fns.setRecentSessions, [row('a'), row('b')]).map((r: any) => r.sessionId)).toEqual(['b']);
    expect(fns.setError).toHaveBeenLastCalledWith('This conversation is no longer available with your current home access.');
    expect(fns.setSessionId).not.toHaveBeenCalled();
  });

  it('does nothing while a question runs, and shows a plain error on failure', async () => {
    const busy = setup({ loading: true });
    await act(async () => { await busy.hook.result.current.openRecentSession(row('a')); });
    expect(getSession).not.toHaveBeenCalled();
    getSession.mockRejectedValue(new Error('offline'));
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.openRecentSession(row('a')); });
    expect(fns.setError).toHaveBeenLastCalledWith('offline');
    expect(fns.setSessionId).not.toHaveBeenCalled();
  });

  it('marks the service unavailable, without an error message, when the role is disabled', async () => {
    getSession.mockRejectedValue(Object.assign(new Error('x'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    const { hook, fns } = setup();
    await act(async () => { await hook.result.current.openRecentSession(row('a')); });
    expect(fns.setServiceUnavailable).toHaveBeenCalledWith(true);
    expect(fns.setError).toHaveBeenLastCalledWith(null);
  });
});
