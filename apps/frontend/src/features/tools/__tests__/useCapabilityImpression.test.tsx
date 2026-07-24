import React from 'react';
import { act, render } from '@testing-library/react';
import { useCapabilityImpression } from '../useCapabilityImpression';
import { track } from '@/lib/analytics/events';

jest.mock('@/lib/analytics/events', () => ({
  track: jest.fn(),
}));

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0];

let observerCallback: ObserverCallback;
const observe = jest.fn();
const disconnect = jest.fn();

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }

  observe = observe;
  disconnect = disconnect;
  unobserve = jest.fn();
  takeRecords = jest.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [0.5];
}

function Fixture() {
  const ref = useCapabilityImpression<HTMLDivElement>({
    capabilityId: 'material-specs',
    propertyId: 'property-1',
    surface: 'explore_tools',
    registryVersion: 'registry-v1',
  });
  return <div ref={ref}>Material Specs</div>;
}

function intersect(ratio: number) {
  observerCallback([
    {
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    } as IntersectionObserverEntry,
  ], {} as IntersectionObserver);
}

describe('useCapabilityImpression', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });
    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records only after 50 percent visibility for 750 continuous milliseconds', () => {
    render(<Fixture />);

    act(() => {
      intersect(0.49);
      jest.advanceTimersByTime(1_000);
    });
    expect(track).not.toHaveBeenCalled();

    act(() => {
      intersect(0.5);
      jest.advanceTimersByTime(749);
    });
    expect(track).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(track).toHaveBeenCalledWith('tool_discovery_impression', expect.objectContaining({
      surface: 'explore_tools',
      toolIds: ['material-specs'],
    }));
  });

  it('requires an active document and deduplicates within registry version and session', () => {
    const first = render(<Fixture />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      intersect(0.75);
      jest.advanceTimersByTime(1_000);
    });
    expect(track).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(750);
    });
    expect(track).toHaveBeenCalledTimes(1);

    first.unmount();
    render(<Fixture />);
    act(() => {
      intersect(1);
      jest.advanceTimersByTime(1_000);
    });
    expect(track).toHaveBeenCalledTimes(1);
  });
});
