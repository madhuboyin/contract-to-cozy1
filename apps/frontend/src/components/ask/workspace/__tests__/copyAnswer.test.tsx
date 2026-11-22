import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExecutionFeedback } from '../ExecutionCard';

jest.mock('@/lib/api/client', () => ({ api: { submitAskFeedback: jest.fn(), requestAskCorrection: jest.fn() } }));

const capabilities = { intent: false, entity: false, homeRecord: false, retryResponse: false };

// BICC-UX-003: completed answers can be copied; nothing is offered when there is no text.
describe('ExecutionFeedback copy', () => {
  it('copies the answer text and announces it', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ExecutionFeedback executionId="e1" capabilities={capabilities} copyText="Roof — installed in 2012." />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy answer' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Roof — installed in 2012.'));
    expect(await screen.findByText('Answer copied.')).toBeInTheDocument();
  });

  it('reports a failed copy and offers no control without text', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
    const { rerender } = render(<ExecutionFeedback executionId="e1" capabilities={capabilities} copyText="Text" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy answer' }));
    expect(await screen.findByText('Could not copy the answer.')).toBeInTheDocument();
    rerender(<ExecutionFeedback executionId="e1" capabilities={capabilities} />);
    expect(screen.queryByRole('button', { name: 'Copy answer' })).toBeNull();
  });
});

// BICC-UX-003: a saved rating returns after reload and belongs to its own attempt.
describe('ExecutionFeedback hydration', () => {
  const saved = (attemptExecutionId: string) => ({ rating: 'DOWN' as const, attemptExecutionId, comment: 'too vague', submittedAt: '2026-11-22T00:00:00.000Z' });

  it('shows the rating saved for this attempt after a reload', () => {
    render(<ExecutionFeedback executionId="e1" capabilities={capabilities} savedFeedback={saved('e1')} />);
    expect(screen.getByRole('button', { name: 'Not helpful response' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Helpful response' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/your feedback was saved/i)).toBeInTheDocument();
  });

  it('never shows another attempt\'s rating on a regenerated answer', () => {
    render(<ExecutionFeedback executionId="e2" capabilities={capabilities} savedFeedback={saved('e1')} />);
    expect(screen.getByRole('button', { name: 'Not helpful response' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/your feedback was saved/i)).toBeNull();
  });
});
