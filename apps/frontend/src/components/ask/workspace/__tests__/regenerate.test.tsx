import { act, renderHook } from '@testing-library/react';
import { useAskRequest } from '../useAskRequest';
import { api } from '@/lib/api/client';
import { createResultRequestTracker } from '@/features/ask/resultViewState';
import type { AskExecutionResponse } from '@/features/ask/types';

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('@/lib/api/client', () => ({ api: { createAskExecution: jest.fn(), retryAskExecution: jest.fn(), regenerateAskExecution: jest.fn() } }));

// BICC-CTX-006: regeneration appends a new linked attempt; the original answer stays.
const execution = (executionId: string, extra: Partial<AskExecutionResponse> = {}) => ({ executionId, sessionId: 's1', question: 'What maintenance is due?', status: 'ANSWERED', blocks: [], ...extra }) as unknown as AskExecutionResponse;

function setup() {
  const setExecutions = jest.fn(); const setError = jest.fn(); const setLoading = jest.fn();
  const hook = renderHook(() => useAskRequest({
    sessionId: 's1', loading: false, executions: [], selectedPropertyId: 'p1', mode: 'panel', launchSurface: '', launchCapabilityId: '', safeBackTo: '',
    requests: { current: createResultRequestTracker() }, inFlight: { current: null }, stoppedRequests: { current: new Set<number>() }, deniedProperties: { current: new Set<string>() },
    activeSessionRef: { current: 's1' }, textareaRef: { current: null }, setInput: jest.fn(), setError, setNotice: jest.fn(), setLoading,
    setServiceUnavailable: jest.fn(), setExecutions, setJustUpdatedExecutionId: jest.fn(), setRecentSessionsEpoch: jest.fn(),
  }));
  return { hook, setExecutions, setError };
}

describe('regenerateExecution', () => {
  it('asks for a new attempt with a fresh request id and appends it beside the original', async () => {
    const attempt = execution('e2', { regeneratedFromExecutionId: 'e1' });
    (api.regenerateAskExecution as jest.Mock).mockResolvedValue({ success: true, data: attempt });
    const { hook, setExecutions } = setup();
    await act(async () => { await hook.result.current.regenerateExecution(execution('e1')); });
    const [executionId, clientRequestId] = (api.regenerateAskExecution as jest.Mock).mock.calls[0];
    expect(executionId).toBe('e1');
    expect(String(clientRequestId).length).toBeGreaterThan(7);
    const merged = (setExecutions.mock.calls[0][0] as (current: AskExecutionResponse[]) => AskExecutionResponse[])([execution('e1')]);
    expect(merged.map((item) => item.executionId)).toEqual(['e1', 'e2']);
  });

  it('reports a refused regeneration as an error and changes nothing', async () => {
    (api.regenerateAskExecution as jest.Mock).mockResolvedValue({ success: false, message: 'This answer cannot be regenerated.' });
    const { hook, setExecutions, setError } = setup();
    await act(async () => { await hook.result.current.regenerateExecution(execution('e1')); });
    expect(setExecutions).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith('This answer cannot be regenerated.');
  });
});
