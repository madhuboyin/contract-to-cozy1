import React, { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useMeasuredElementHeight } from '../workspace/useMeasuredElementHeight';

let resize: (() => void) | null = null;
let elementHeight = 0;

class TestResizeObserver {
  constructor(callback: () => void) { resize = callback; }
  observe() {}
  disconnect() {}
}

function Harness({ height }: { height: number }) {
  const measured = useMeasuredElementHeight();
  useEffect(() => {
    elementHeight = height;
    resize?.();
  }, [height]);
  return <><div ref={measured.ref} /><output>{measured.height}</output></>;
}

describe('useMeasuredElementHeight', () => {
  const bounds = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  beforeAll(() => {
    global.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
    bounds.mockImplementation(() => ({ height: elementHeight, width: 100, x: 0, y: 0, top: 0, right: 100, bottom: elementHeight, left: 0, toJSON: () => ({}) }));
  });
  afterAll(() => {
    bounds.mockRestore();
    delete (global as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  });

  it('tracks variable composer height through ResizeObserver', () => {
    const { rerender } = render(<Harness height={88} />);
    act(() => resize?.());
    expect(screen.getByText('88')).toBeInTheDocument();
    rerender(<Harness height={144} />);
    act(() => resize?.());
    expect(screen.getByText('144')).toBeInTheDocument();
  });
});
