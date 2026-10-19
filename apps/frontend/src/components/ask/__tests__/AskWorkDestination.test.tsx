/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AskWorkDestination } from '../workspace/AskWorkDestination';
import { api } from '@/lib/api/client';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('propertyId=home-1'),
}));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: {
  getAskPendingWork: jest.fn(),
  continueAskExecution: jest.fn(),
  cancelAskExecution: jest.fn(),
} }));

const getPending = api.getAskPendingWork as jest.Mock;
const continueExecution = api.continueAskExecution as jest.Mock;

describe('AskWorkDestination', () => {
  beforeEach(() => {
    push.mockReset();
    getPending.mockReset();
    continueExecution.mockReset();
  });

  it('loads the selected-home preview and resumes through the canonical Ask continuation', async () => {
    getPending.mockResolvedValue({ success: true, data: { items: [{
      pendingKind: 'CONFIRMATION',
      actionLabel: 'Review and confirm',
      execution: {
        executionId: 'execution-1',
        sessionId: 'session-1',
        question: 'Approve the maintenance plan',
        updatedAt: '2026-10-18T12:00:00.000Z',
      },
    }] } });
    continueExecution.mockResolvedValue({ success: true, data: {
      executionId: 'execution-1',
      sessionId: 'session-1',
      property: { id: 'home-1', label: 'Home' },
    } });

    render(<AskWorkDestination />);
    expect(await screen.findByText('Approve the maintenance plan')).toBeInTheDocument();
    expect(getPending).toHaveBeenCalledWith('home-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));

    fireEvent.click(screen.getByRole('button', { name: 'Review and confirm' }));
    await waitFor(() => expect(continueExecution).toHaveBeenCalledWith('execution-1', 'ASK_PAGE'));
    expect(push).toHaveBeenCalledWith('/dashboard/ask?propertyId=home-1&sessionId=session-1&executionId=execution-1');
  });
});
