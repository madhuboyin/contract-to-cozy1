import { act, renderHook } from '@testing-library/react';
import { useCoordinatedPostLoginTransition } from '../usePostLoginTransition';

describe('useCoordinatedPostLoginTransition', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('waits for both Home readiness and the minimum anti-flash duration', () => {
    const { result } = renderHook(() =>
      useCoordinatedPostLoginTransition(true, 800, 12_000),
    );

    act(() => {
      result.current.markTransitionReady();
      jest.advanceTimersByTime(799);
    });
    expect(result.current.transitionVisible).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.transitionVisible).toBe(false);
  });

  it('stays visible after the minimum while Home is still loading', () => {
    const { result } = renderHook(() =>
      useCoordinatedPostLoginTransition(true, 800, 12_000),
    );

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(result.current.transitionVisible).toBe(true);

    act(() => {
      result.current.markTransitionReady();
    });
    expect(result.current.transitionVisible).toBe(false);
  });

  it('keeps the same surface and exposes a timeout state when loading is slow', () => {
    const { result } = renderHook(() =>
      useCoordinatedPostLoginTransition(true, 800, 12_000),
    );

    act(() => {
      jest.advanceTimersByTime(12_000);
    });
    expect(result.current.transitionVisible).toBe(true);
    expect(result.current.transitionTimedOut).toBe(true);
  });

  it('does not introduce a transition during normal dashboard navigation', () => {
    const { result } = renderHook(() =>
      useCoordinatedPostLoginTransition(false, 800, 12_000),
    );

    expect(result.current.transitionVisible).toBe(false);
  });
});
