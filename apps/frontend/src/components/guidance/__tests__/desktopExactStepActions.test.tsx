import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Desktop tool actions launched from a journey step carry that exact step id and send no completion of their own (continuation FRD section 49).
const runDoNothingSimulation = jest.fn().mockResolvedValue({});
const completeGuidanceStep = jest.fn();
const acknowledgeGuidanceStep = jest.fn().mockResolvedValue({});
jest.mock('@/lib/api/doNothingSimulatorApi', () => ({
  getLatestDoNothingRun: jest.fn().mockResolvedValue({ exists: false }),
  runDoNothingSimulation: (...args: unknown[]) => runDoNothingSimulation(...args),
}));
jest.mock('@/lib/api/guidanceApi', () => ({
  completeGuidanceStep: (...args: unknown[]) => completeGuidanceStep(...args),
  acknowledgeGuidanceStep: (...args: unknown[]) => acknowledgeGuidanceStep(...args),
  recordGuidanceToolStatus: jest.fn(),
}));

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/recalls/recallsApi', () => ({
  confirmRecallMatch: jest.fn(), dismissRecallMatch: jest.fn(), resolveRecallMatch: jest.fn(),
  listInventoryItemRecalls: jest.fn().mockResolvedValue({ matches: [] }),
  listPropertyRecalls: jest.fn().mockResolvedValue({ matches: [] }),
}));
jest.mock('@/app/(dashboard)/dashboard/components/recalls/RecallMatchCard', () => ({ __esModule: true, default: () => null }));

import { DoNothingGuidanceStep } from '../DoNothingGuidanceStep';
import { RecallCheckInline } from '../RecallCheckInline';

function wrap(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('Do-Nothing guidance step', () => {
  it('runs the analysis for this exact step and never completes the step itself', async () => {
    const onComplete = jest.fn();
    wrap(<DoNothingGuidanceStep propertyId="p1" journeyId="j1" stepId="s1" stepKey="compare_action_options" onComplete={onComplete} />);
    await userEvent.click(await screen.findByRole('button', { name: /generate 12-month delay analysis/i }));
    await waitFor(() => expect(runDoNothingSimulation).toHaveBeenCalledWith('p1', { horizonMonths: 12, guidanceStepId: 's1' }));
    expect(completeGuidanceStep).not.toHaveBeenCalled();
  });
});

describe('Recall check inline', () => {
  const base = { propertyId: 'p1', journeyId: 'j1', stepId: 's1', inventoryItemId: 'i1', onComplete: jest.fn() } as const;

  it('has no completion button for the steps a recall action completes', async () => {
    wrap(<RecallCheckInline {...base} stepKey="safety_alert" />);
    await screen.findByText(/no open recalls found/i);
    expect(screen.queryByRole('button', { name: /mark safety alert acknowledged/i })).toBeNull();
    expect(screen.getByText(/completed by the recall action you take/i)).toBeTruthy();
  });

  it('records reading the remedy instructions as a typed acknowledgement of this step, not free-form completion', async () => {
    wrap(<RecallCheckInline {...base} stepKey="review_remedy_instructions" />);
    await userEvent.click(await screen.findByRole('button', { name: /mark remedy instructions reviewed/i }));
    await waitFor(() => expect(acknowledgeGuidanceStep).toHaveBeenCalledWith('p1', 's1'));
    expect(completeGuidanceStep).not.toHaveBeenCalled();
  });
});
