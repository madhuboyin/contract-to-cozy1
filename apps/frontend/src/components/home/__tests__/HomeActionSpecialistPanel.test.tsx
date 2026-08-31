import { fireEvent, render, screen } from '@testing-library/react';
import { HomeActionSpecialistPanel } from '@/components/home/HomeActionSpecialistPanel';
import {
  useHvacSpecialistStatus,
  useDisputeHvacSpecialistInput,
  useStartHvacSpecialist,
  useSubmitHvacSpecialistContext,
  useUploadHvacSpecialistDocument,
} from '@/hooks/useHvacSpecialist';

jest.mock('@/hooks/useHvacSpecialist', () => ({
  useHvacSpecialistStatus: jest.fn(),
  useDisputeHvacSpecialistInput: jest.fn(),
  useStartHvacSpecialist: jest.fn(),
  useSubmitHvacSpecialistContext: jest.fn(),
  useUploadHvacSpecialistDocument: jest.fn(),
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
  (useHvacSpecialistStatus as jest.Mock).mockReturnValue({ data: { status }, isLoading: false });
  (useStartHvacSpecialist as jest.Mock).mockReturnValue({ data: null, mutate: start, isPending: false });
  (useSubmitHvacSpecialistContext as jest.Mock).mockReturnValue({ mutate: submit, isPending: false, isError: false });
  (useUploadHvacSpecialistDocument as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });
  (useDisputeHvacSpecialistInput as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

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

test('uploads document evidence with the paused CAS so the mutation can attach and resume', () => {
  const upload = jest.fn();
  const documentStatus = {
    ...status,
    phase: 'NEEDS_DOCUMENT' as const,
    outstanding: [{
      key: 'hvac.technicianAssessment', label: 'Technician assessment',
      correctionPath: 'document-upload:hvac-quote', kind: 'DOCUMENT' as const,
    }],
  };
  (useHvacSpecialistStatus as jest.Mock).mockReturnValue({ data: { status: documentStatus }, isLoading: false });
  (useStartHvacSpecialist as jest.Mock).mockReturnValue({ data: { status }, mutate: jest.fn(), isPending: false });
  (useSubmitHvacSpecialistContext as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });
  (useUploadHvacSpecialistDocument as jest.Mock).mockReturnValue({ mutate: upload, isPending: false, isError: false });
  (useDisputeHvacSpecialistInput as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

  render(
    <HomeActionSpecialistPanel
      propertyId="property-1"
      inventoryItemId="item-1"
      homeActionOrigin={{
        homeActionId: 'action-1', lineageId: 'repair-replace:analysis-1', sourceEntityId: 'analysis-1',
        sourceVersion: 'v1', contextVersion: null,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Get help deciding' }));
  const file = new File(['assessment'], 'assessment.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Upload assessment or estimate'), { target: { files: [file] } });
  expect(upload).toHaveBeenCalledWith({ file, expectedCasVersion: 7 });
});

test('shows appliance-specific dispute inputs and the canonical inventory correction path', () => {
  const dispute = jest.fn();
  const ready = {
    ...status,
    phase: 'RECOMMENDATION_READY' as const,
    verdict: 'REPLACE' as const,
    outstanding: [],
    paused: false,
    casVersion: null,
    expectedOperation: null,
  };
  (useHvacSpecialistStatus as jest.Mock).mockReturnValue({ data: { status: ready }, isLoading: false, isError: false });
  (useStartHvacSpecialist as jest.Mock).mockReturnValue({ data: { status: ready }, mutate: jest.fn(), isPending: false, isSuccess: true, isError: false });
  (useSubmitHvacSpecialistContext as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });
  (useUploadHvacSpecialistDocument as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });
  (useDisputeHvacSpecialistInput as jest.Mock).mockReturnValue({ mutate: dispute, isPending: false, isError: false });

  render(
    <HomeActionSpecialistPanel
      propertyId="property-1"
      inventoryItemId="dishwasher-1"
      profileId="GENERIC_APPLIANCE"
      homeActionOrigin={{
        homeActionId: 'action-1', lineageId: 'appliance-repair-replace:dishwasher-1', sourceEntityId: 'analysis-1',
        sourceVersion: 'v1', contextVersion: null,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Get help deciding' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dispute an input' }));
  expect(screen.getByRole('option', { name: 'Appliance condition' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Technician assessment' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Correct this appliance’s inventory record' })).toHaveAttribute(
    'href', '/dashboard/properties/property-1/inventory/items/dishwasher-1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record dispute' }));
  expect(dispute).toHaveBeenCalledWith({ key: 'appliance.condition', note: undefined, expectedCasVersion: undefined });
});
