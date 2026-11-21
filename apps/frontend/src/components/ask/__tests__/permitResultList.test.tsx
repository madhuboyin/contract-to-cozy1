import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PermitResultList } from '../PermitResultList';
import { api } from '@/lib/api/client';
import type { AskPresentationBlock } from '@/features/ask/types';

jest.mock('@/lib/api/client', () => ({ api: { getPermitDetail: jest.fn() } }));
const getPermitDetail = api.getPermitDetail as jest.MockedFunction<typeof api.getPermitDetail>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'permit-tracker-permits', title: 'Permits', filters: [], actions: [],
  sections: [{ id: 'open-permits', title: 'Open permits', count: 1, items: [{
    id: 'permit-1', title: 'Electrical permit E-100', description: 'Official: Issued', status: 'Issued',
    meta: ['Official: Issued'], entityType: 'PERMIT_RECORD', actions: [],
  }] }],
};

beforeEach(() => jest.clearAllMocks());

test('a permit row opens a fresh property-scoped permit detail inline', async () => {
  getPermitDetail.mockResolvedValueOnce({
    id: 'permit-1', permitNumber: 'E-100', category: 'ELECTRICAL', workTypes: [], description: 'Panel replacement',
    status: 'ISSUED', reportedStatus: 'SUBMITTED', source: 'MANUAL_ENTRY', isVerified: true, hasOpenInspections: true,
    issueDate: '2026-10-01T00:00:00.000Z', estimatedCostCents: 250000, contractorName: 'Bright Electric',
    documentIds: [], inspectionMilestones: [{ id: 'step-1', stageName: 'Final', stageType: 'FINAL', status: 'SCHEDULED', isRequired: true, sortOrder: 1, isOverdue: false }],
  });

  render(<PermitResultList block={block} propertyId="home-1" onAccessLost={() => {}} />);
  expect(screen.queryByText('View details')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Electrical permit E-100/ }));

  await waitFor(() => expect(screen.getByText('Panel replacement')).toBeInTheDocument());
  expect(getPermitDetail).toHaveBeenCalledWith('home-1', 'permit-1');
  expect(screen.getByText('Bright Electric')).toBeInTheDocument();
  expect(screen.getByText('$2,500.00')).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
});

test('an empty pending-permits section is explicit and compact', () => {
  const empty = { ...block, title: 'Pending permits', sections: [{ ...block.sections[0], title: 'Pending permits', count: 0, items: [] }] };
  render(<PermitResultList block={empty} propertyId="home-1" onAccessLost={() => {}} />);
  expect(screen.getByText('Pending permits · 0')).toBeInTheDocument();
  expect(screen.getByText('No pending permit records were found in this home record.')).toBeInTheDocument();
});
