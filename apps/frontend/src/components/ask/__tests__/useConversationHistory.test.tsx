/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConversationHistory } from '../workspace/useConversationHistory';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getRecentAskSessions: jest.fn(), searchAskSessions: jest.fn() } }));
const recent = api.getRecentAskSessions as jest.Mock;
const search = api.searchAskSessions as jest.Mock;
const session = (id: string) => ({ sessionId: id, title: id });
const ok = (data: unknown) => Promise.resolve({ success: true, data });

function setup(overrides: Record<string, unknown> = {}) {
  const onAccessLost = jest.fn();
  const setServiceUnavailable = jest.fn();
  const props = {
    selectedPropertyId: 'p1', effectiveHistoryScope: 'THIS_HOME' as const, propertyMismatch: false, availabilityEpoch: 0, recentSessionsEpoch: 0,
    setServiceUnavailable, onAccessLostRef: { current: onAccessLost }, ...overrides,
  };
  const hook = renderHook((p: typeof props) => useConversationHistory(p), { initialProps: props });
  return { hook, onAccessLost, setServiceUnavailable, props };
}

beforeEach(() => { recent.mockReset(); search.mockReset(); });

describe('useConversationHistory', () => {
  it('loads recent and pinned conversations for this home, and no pinned group in the archived view', async () => {
    recent.mockImplementation(() => ok({ items: [session('a')], pinned: [session('pin')], nextCursor: 'c1' }));
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.recentSessions.map((s: any) => s.sessionId)).toEqual(['a']));
    expect(hook.result.current.pinnedSessions.map((s: any) => s.sessionId)).toEqual(['pin']);
    expect(hook.result.current.recentSessionsNextCursor).toBe('c1');
    expect(recent.mock.calls[0][0]).toEqual({ propertyId: 'p1' });
    expect(recent.mock.calls[0][1]).toMatchObject({ archived: false });
    act(() => hook.result.current.setHistoryView('ARCHIVED'));
    await waitFor(() => expect(recent.mock.calls.at(-1)[1]).toMatchObject({ archived: true }));
    await waitFor(() => expect(hook.result.current.pinnedSessions).toEqual([]));
  });

  it('uses the all-homes scope, and does nothing for a property mismatch or a missing home', async () => {
    recent.mockImplementation(() => ok({ items: [], pinned: [], nextCursor: null }));
    setup({ effectiveHistoryScope: 'ALL_HOMES', selectedPropertyId: undefined });
    await waitFor(() => expect(recent).toHaveBeenCalledTimes(1));
    expect(recent.mock.calls[0][0]).toEqual({ allHomes: true });
    recent.mockClear();
    setup({ propertyMismatch: true });
    setup({ selectedPropertyId: undefined });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recent).not.toHaveBeenCalled();
  });

  it('pages older conversations without duplicating rows, and keeps rows on a failed page with a message', async () => {
    recent.mockImplementationOnce(() => ok({ items: [session('a'), session('b')], pinned: [], nextCursor: 'c1' }));
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.recentSessions).toHaveLength(2));
    recent.mockImplementationOnce(() => ok({ items: [session('b'), session('c')], nextCursor: null }));
    await act(async () => { await hook.result.current.loadMoreRecentSessions(); });
    expect(hook.result.current.recentSessions.map((s: any) => s.sessionId)).toEqual(['a', 'b', 'c']);
    expect(hook.result.current.recentSessionsNextCursor).toBeNull();
    act(() => hook.result.current.setRecentSessionsNextCursor('c9'));
    recent.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await act(async () => { await hook.result.current.loadMoreRecentSessions(); });
    expect(hook.result.current.recentSessions).toHaveLength(3);
    expect(hook.result.current.recentSessionsIssue).toMatch(/older conversations/);
  });

  it('on access loss clears through the workspace callback instead of showing a generic error', async () => {
    recent.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { code: 'ASK_PROPERTY_NOT_FOUND' })));
    const { onAccessLost } = setup();
    await waitFor(() => expect(onAccessLost).toHaveBeenCalledWith('p1'));
  });

  it('searches after a pause, pages matches, and clears when the term is cleared', async () => {
    recent.mockImplementation(() => ok({ items: [], pinned: [], nextCursor: null }));
    search.mockImplementationOnce(() => ok({ items: [session('m1')], nextCursor: 's1' }));
    const { hook } = setup();
    act(() => hook.result.current.setHistorySearchInput('  roof '));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(search).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.searchSessions.map((s: any) => s.sessionId)).toEqual(['m1']));
    expect(search.mock.calls[0][1]).toBe('roof');
    search.mockImplementationOnce(() => ok({ items: [session('m1'), session('m2')], nextCursor: null }));
    await act(async () => { await hook.result.current.loadMoreSearchSessions(); });
    expect(hook.result.current.searchSessions.map((s: any) => s.sessionId)).toEqual(['m1', 'm2']);
    act(() => hook.result.current.setHistorySearchInput(''));
    await waitFor(() => expect(hook.result.current.searchSessions).toEqual([]));
  });

  it('ignores a slow answer for a home the person has already left', async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    recent.mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }));
    recent.mockImplementationOnce(() => ok({ items: [session('p2-a')], pinned: [], nextCursor: null }));
    const { hook, props } = setup();
    hook.rerender({ ...props, selectedPropertyId: 'p2' });
    await waitFor(() => expect(hook.result.current.recentSessions.map((s: any) => s.sessionId)).toEqual(['p2-a']));
    await act(async () => { releaseFirst({ success: true, data: { items: [session('p1-late')], pinned: [], nextCursor: null } }); await Promise.resolve(); });
    expect(hook.result.current.recentSessions.map((s: any) => s.sessionId)).toEqual(['p2-a']);
  });

  it('drops an older page that arrives after the list was reloaded for another home', async () => {
    recent.mockImplementationOnce(() => ok({ items: [session('a')], pinned: [], nextCursor: 'c1' }));
    const { hook, props } = setup();
    await waitFor(() => expect(hook.result.current.recentSessions).toHaveLength(1));
    let releasePage: (value: unknown) => void = () => {};
    recent.mockImplementationOnce(() => new Promise((resolve) => { releasePage = resolve; }));
    let paging: Promise<void> = Promise.resolve();
    act(() => { paging = hook.result.current.loadMoreRecentSessions(); });
    recent.mockImplementationOnce(() => ok({ items: [session('p2-a')], pinned: [], nextCursor: null }));
    hook.rerender({ ...props, selectedPropertyId: 'p2' });
    await waitFor(() => expect(hook.result.current.recentSessions.map((s: any) => s.sessionId)).toEqual(['p2-a']));
    await act(async () => { releasePage({ success: true, data: { items: [session('p1-old-page')], nextCursor: null } }); await paging; });
    expect(hook.result.current.recentSessions.map((s: any) => s.sessionId)).toEqual(['p2-a']);
  });

  it('marks the service unavailable only when the request says the account role is disabled', async () => {
    recent.mockImplementation(() => Promise.reject(Object.assign(new Error('paused'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' })));
    const paused = setup();
    await waitFor(() => expect(paused.setServiceUnavailable).toHaveBeenCalledWith(true));
    recent.mockImplementation(() => Promise.reject(new Error('plain')));
    const plain = setup();
    await waitFor(() => expect(plain.hook.result.current.recentSessionsIssue).toMatch(/Could not refresh/));
    expect(plain.setServiceUnavailable).not.toHaveBeenCalled();
  });
});
