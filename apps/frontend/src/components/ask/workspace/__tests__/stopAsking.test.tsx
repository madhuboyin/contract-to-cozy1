import { act, renderHook } from '@testing-library/react';
import { useAskRequest } from '../useAskRequest';
import { api } from '@/lib/api/client';
import { createResultRequestTracker } from '@/features/ask/resultViewState';

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('@/lib/api/client', () => ({ api: { createAskExecution: jest.fn(), retryAskExecution: jest.fn() } }));

// BICC-TRN-001/002: stopping aborts the browser request and is reported as a calm notice, not an error.
describe('useAskRequest stop', () => {
  it('aborts the in-flight request, restores the question, and sets a notice instead of an error', async () => {
    let seenSignal: AbortSignal | undefined;
    (api.createAskExecution as jest.Mock).mockImplementation((_payload, options) => {
      seenSignal = options?.signal;
      return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    });
    const setInput = jest.fn(); const setError = jest.fn(); const setNotice = jest.fn(); const setLoading = jest.fn();
    const requests = { current: createResultRequestTracker() };
    const inFlight = { current: null as { key: string; token: number; message: string } | null };
    const { result } = renderHook(() => useAskRequest({
      sessionId: 's1', loading: false, executions: [], selectedPropertyId: 'p1', mode: 'panel', launchSurface: '', launchCapabilityId: '', safeBackTo: '',
      requests, inFlight, stoppedRequests: { current: new Set<number>() }, deniedProperties: { current: new Set<string>() }, activeSessionRef: { current: 's1' },
      textareaRef: { current: null }, setInput, setError, setNotice, setLoading, setServiceUnavailable: jest.fn(), setExecutions: jest.fn(), setJustUpdatedExecutionId: jest.fn(), setRecentSessionsEpoch: jest.fn(),
    }));

    let pending: Promise<unknown> | undefined;
    act(() => { pending = result.current.ask('When was the roof replaced?'); });
    expect(seenSignal?.aborted).toBe(false);
    act(() => { result.current.stopAsking(); });
    await act(async () => { await pending; });

    expect(seenSignal?.aborted).toBe(true);
    expect(setInput).toHaveBeenLastCalledWith('When was the roof replaced?');
    expect(setNotice).toHaveBeenLastCalledWith(expect.stringMatching(/^Stopped\./));
    expect(setError).not.toHaveBeenCalledWith(expect.stringMatching(/./));
  });
});
