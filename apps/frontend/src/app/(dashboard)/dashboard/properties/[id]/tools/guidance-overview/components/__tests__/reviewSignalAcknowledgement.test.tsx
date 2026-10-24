import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GuidanceOverviewInlineStep } from '../GuidanceOverviewInlineStep';
import { acknowledgeGuidanceStep, completeGuidanceStep } from '@/lib/api/guidanceApi';

jest.mock('@/lib/api/guidanceApi', () => ({ acknowledgeGuidanceStep: jest.fn().mockResolvedValue({}), completeGuidanceStep: jest.fn().mockResolvedValue({}) }));

const step = (stepKey: string) => ({ id: 'step-1', stepKey, label: 'Review', status: 'IN_PROGRESS', producedData: null, toolKey: 'guidance-overview' }) as never;

describe('the signal review step is recorded as a typed acknowledgement, never as free-form completion data', () => {
  beforeEach(() => jest.clearAllMocks());

  it('review_signal acknowledges with the chosen disposition and the note, and never calls the generic completion', async () => {
    const onComplete = jest.fn();
    render(<GuidanceOverviewInlineStep propertyId="p1" step={step('review_signal')} onComplete={onComplete} nextStepKey="next" />);
    fireEvent.change(screen.getByPlaceholderText(/Add any quick takeaway/), { target: { value: '  Watch the water bill  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Plan this soon/ }));
    await waitFor(() => expect(acknowledgeGuidanceStep).toHaveBeenCalledWith('p1', 'step-1', { disposition: 'plan_soon', note: 'Watch the water bill' }));
    expect(completeGuidanceStep).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith('next');
  });

  it('a failed acknowledgement says so and does not move on', async () => {
    (acknowledgeGuidanceStep as jest.Mock).mockRejectedValueOnce(new Error('409'));
    const onComplete = jest.fn();
    render(<GuidanceOverviewInlineStep propertyId="p1" step={step('review_signal')} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Monitor for now/ }));
    expect(await screen.findByText(/could not save that step/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
