/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePendingWork } from '../workspace/usePendingWork';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getAskPendingWork: jest.fn(), cancelAskExecution: jest.fn() } }));
const pending = api.getAskPendingWork as jest.Mock;
const cancel = api.cancelAskExecution as jest.Mock;
const item = (id: string, pendingKind = 'NEEDS_INPUT') => ({ pendingKind, execution: { executionId: id, sessionId: `s-${id}`, property: { id: 'p1' } } });

function setup(overrides: Record<string, unknown> = {}) {
  const fns = { setError: jest.fn(), setServiceUnavailable: jest.fn(), onDismissed: jest.fn() };
  const props = { selectedPropertyId: 'p1', propertyMismatch: false, availabilityEpoch: 0, loading: false, ...fns, ...overrides };
  const hook = renderHook((p: typeof props) => usePendingWork(p), { initialProps: props });
  return { hook, props, ...fns };
}
const ids = (hook: any) => hook.result.current.pendingWork.map((x: any) => x.execution.executionId);

beforeEach(() => { pending.mockReset(); cancel.mockReset(); });

describe('usePendingWork', () => {
  it('loads pending work for the selected home, and not on a property mismatch', async () => {
    pending.mockResolvedValue({ success: true, data: { items: [item('a'), item('b')] } });
    const { hook } = setup();
    await waitFor(() => expect(ids(hook)).toEqual(['a', 'b']));
    expect(pending.mock.calls[0][0]).toBe('p1');
    expect(hook.result.current.pendingLoading).toBe(false);
    pending.mockClear();
    setup({ propertyMismatch: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pending).not.toHaveBeenCalled();
  });

  it('empties the list on failure, and flags the service as unavailable only for the role-disabled code', async () => {
    pending.mockResolvedValue({ success: true, data: { items: [item('a')] } });
    const { hook, props } = setup();
    await waitFor(() => expect(ids(hook)).toEqual(['a']));
    pending.mockRejectedValueOnce(new Error('plain'));
    hook.rerender({ ...props, availabilityEpoch: 1 });
    await waitFor(() => expect(ids(hook)).toEqual([]));
    expect(props.setServiceUnavailable).not.toHaveBeenCalled();
    pending.mockRejectedValueOnce(Object.assign(new Error('off'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    hook.rerender({ ...props, availabilityEpoch: 2 });
    await waitFor(() => expect(props.setServiceUnavailable).toHaveBeenCalledWith(true));
  });

  it('dismisses one item: cancels it, removes it, and tells the workspace', async () => {
    pending.mockResolvedValue({ success: true, data: { items: [item('a'), item('b')] } });
    cancel.mockResolvedValue({ success: true, data: { status: 'CANCELLED' } });
    const { hook, onDismissed, setError } = setup();
    await waitFor(() => expect(ids(hook)).toEqual(['a', 'b']));
    await act(async () => { await hook.result.current.dismissPendingWork(hook.result.current.pendingWork[0]); });
    expect(cancel).toHaveBeenCalledWith('a');
    expect(ids(hook)).toEqual(['b']);
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
    expect(hook.result.current.dismissingPendingId).toBeNull();
  });

  it('keeps the item and reports an error when the cancel is not confirmed', async () => {
    pending.mockResolvedValue({ success: true, data: { items: [item('a')] } });
    cancel.mockResolvedValue({ success: true, data: { status: 'RUNNING' } });
    const { hook, onDismissed, setError } = setup();
    await waitFor(() => expect(ids(hook)).toEqual(['a']));
    await act(async () => { await hook.result.current.dismissPendingWork(hook.result.current.pendingWork[0]); });
    expect(ids(hook)).toEqual(['a']);
    expect(onDismissed).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith('Could not dismiss this pending action.');
  });

  it('does not dismiss while a question runs, or a command recovery, or while another item is being resumed', async () => {
    pending.mockResolvedValue({ success: true, data: { items: [item('a'), item('r', 'COMMAND_RECOVERY')] } });
    cancel.mockResolvedValue({ success: true, data: { status: 'CANCELLED' } });
    const busy = setup({ loading: true });
    await waitFor(() => expect(ids(busy.hook)).toHaveLength(2));
    await act(async () => { await busy.hook.result.current.dismissPendingWork(busy.hook.result.current.pendingWork[0]); });
    const idle = setup();
    await waitFor(() => expect(ids(idle.hook)).toHaveLength(2));
    await act(async () => { await idle.hook.result.current.dismissPendingWork(idle.hook.result.current.pendingWork[1]); });
    act(() => idle.hook.result.current.setContinuingId('a'));
    await act(async () => { await idle.hook.result.current.dismissPendingWork(idle.hook.result.current.pendingWork[0]); });
    expect(cancel).not.toHaveBeenCalled();
  });
});
