import { fireEvent, render, screen } from '@testing-library/react';
import { HomeActionSpecialistPanel } from '@/components/home/HomeActionSpecialistPanel';
import {
  useHvacSpecialistStatus,
  useStartHvacSpecialist,
  useSubmitHvacSpecialistContext,
} from '@/hooks/useHvacSpecialist';

jest.mock('@/hooks/useHvacSpecialist', () => ({
  useHvacSpecialistStatus: jest.fn(),
  useStartHvacSpecialist: jest.fn(),
  useSubmitHvacSpecialistContext: jest.fn(),
}));

const status = {
  runId: 'run-1',
  agentId: 'hvac-repair-replace-specialist',
  agentVersion: '1.0.0',
  phase: 'NEEDS_CONTEXT' as const,
  decisionThreadId: 'thread-1',
  currentRecommendationSnapshotId: 'snapshot-1',
  verdict: null,
  confidenceLabel: 'LOW' as const,
  outstanding: [{ key: 'hvac.installDate', label: 'Year installed', correctionPath: null, kind: 'FACT' as const }],
  explanation: [],
  abstentionReason: null,
  paused: true,
  casVersion: 7,
  expectedOperation: 'SUBMIT_CONTEXT' as const,
};

test('sends Home Action provenance on start and the rendered CAS version on context submission', () => {
  const start = jest.fn();
  const submit = jest.fn();
  (useHvacSpecialistStatus as jest.Mock).mockReturnValue({ data: null, isLoading: false });
  (useStartHvacSpecialist as jest.Mock).mockReturnValue({ data: { status }, mutate: start, isPending: false });
  (useSubmitHvacSpecialistContext as jest.Mock).mockReturnValue({ mutate: submit, isPending: false, isError: false });

  render(
    <HomeActionSpecialistPanel
      propertyId="property-1"
      inventoryItemId="item-1"
      homeActionOrigin={{
        homeActionId: 'action-1',
        lineageId: 'repair-replace:analysis-1',
        sourceEntityId: 'analysis-1',
        sourceVersion: 'v1',
        contextVersion: null,
      }}
    />,
  );

  const startCall = (useStartHvacSpecialist as jest.Mock).mock.calls[0];
  expect(startCall[0]).toBe('property-1');
  expect(startCall[1]).toBe('item-1');
  expect(startCall[2]).toEqual(expect.objectContaining({
    homeActionId: 'action-1',
    lineageId: 'repair-replace:analysis-1',
    sourceEntityId: 'analysis-1',
    engagementNonce: expect.any(String),
  }));

  fireEvent.click(screen.getByRole('button', { name: 'Get help deciding' }));
  expect(start).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Year installed'), { target: { value: '2012' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to the Specialist' }));
  expect(submit).toHaveBeenCalledWith({ contextIntake: { 'hvac.installDate': '2012' }, expectedCasVersion: 7 });
});
