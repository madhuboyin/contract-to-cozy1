import { act, render, screen } from '@testing-library/react';
import { PendingTurn } from '../calm/PendingTurn';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-006/012 (FRD v1.112).
describe('PendingTurn', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the question at once, a status naming the area, and placeholders in the answer\'s place', () => {
    const { container } = render(<PendingTurn message="What maintenance tasks are coming due?" />);
    expect(screen.getByText('What maintenance tasks are coming due?')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your maintenance records…');
    expect(container.querySelector('[data-pending-turn]')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
    expect(container.querySelectorAll('.motion-reduce\\:animate-none')).toHaveLength(2);
  });

  it('says it is still working, then that it can be stopped, as time passes', () => {
    render(<PendingTurn message="Give me a summary of my home record." />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your home record…');
    act(() => { jest.advanceTimersByTime(6_000); });
    expect(screen.getByRole('status')).toHaveTextContent('Still working on this…');
    act(() => { jest.advanceTimersByTime(9_000); });
    expect(screen.getByRole('status')).toHaveTextContent('This is taking longer than usual. You can stop and try again.');
  });

  it('starts again for a new question', () => {
    const { rerender } = render(<PendingTurn message="First question about maintenance" />);
    act(() => { jest.advanceTimersByTime(7_000); });
    expect(screen.getByRole('status')).toHaveTextContent('Still working on this…');
    rerender(<PendingTurn message="Second question about coverage" />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your coverage and warranty records…');
  });
});
