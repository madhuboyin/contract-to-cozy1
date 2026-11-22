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
