import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { InspectionFindingResultList, findingActionsForLiveState } from '../InspectionFindingResultList';
import type { AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { InspectionFinding } from '@/types';

jest.mock('@/lib/api/client', () => ({ api: { listInspectionFindings: jest.fn() } }));
const mockedList = api.listInspectionFindings as jest.MockedFunction<typeof api.listInspectionFindings>;

// FRD v1.43 inspection-hub capability-card slice.
const ACTIONS = [
  ['finding-accept', 'Accept as work', 'Accept this inspection finding as work.'],
  ['finding-dismiss', 'Dismiss', 'Dismiss this inspection finding.'],
  ['finding-resolve', 'Mark resolved', 'Mark this inspection finding resolved.'],
].map(([id, label, message]) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INSPECTION_FINDING_UPDATE' }));
const block = (actions = ACTIONS): Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> => ({
  type: 'GROUPED_LIST', id: 'inspection-findings', title: 'Open inspection findings', filters: [],
  actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href: '/dashboard/properties/home/inspection-hub/open-items', style: 'SECONDARY' }],
  sections: [{ id: 'open', title: 'Needs review', count: 1, items: [{
    id: 'finding-1', title: 'ROOF: Missing shingles', meta: ['Disposition: pending review'], description: 'major · Pat', status: 'OPEN',
    href: '/dashboard/properties/home/inspection-hub/report-1?findingId=finding-1', entityType: 'INSPECTION_FINDING', parentId: 'report-1', actions,
  }] }],
});
const finding = (overrides: Partial<InspectionFinding> = {}): InspectionFinding => ({
  id: 'finding-1', reportId: 'report-1', propertyId: 'home', homeSystem: 'ROOF', location: 'North slope', conditionRating: 'POOR', severity: 'MAJOR',
  inspectorDescription: 'Several shingles are missing on the north slope.', inspectorRecommendation: 'Replace missing shingles.', aiInterpretation: '',
  estimatedCostCentsLow: 30000, estimatedCostCentsHigh: 60000, extractionConfidence: 'HIGH', status: 'OPEN', workDisposition: 'PENDING_REVIEW',
  photoKeys: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', ...overrides,
} as InspectionFinding);
const link = (href: string, content: React.ReactNode) => <a href={href}>{content}</a>;
const shown = () => Array.from(document.querySelectorAll('[data-finding-action]')).map((node) => node.getAttribute('data-finding-action'));
async function open(live: InspectionFinding[] | Error, onAction = jest.fn(), actions = ACTIONS, onAccessLost = jest.fn()) {
  if (live instanceof Error) mockedList.mockRejectedValueOnce(live); else mockedList.mockResolvedValueOnce(live);
  render(<InspectionFindingResultList block={block(actions)} propertyId="home" onAction={onAction} onAccessLost={onAccessLost} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'ROOF: Missing shingles' }));
  return { onAction, onAccessLost };
}

beforeEach(() => jest.clearAllMocks());

test('live-state rules mirror the service: accept needs an open, unaccepted finding; closed findings take no action', () => {
  const ids = (state: Partial<InspectionFinding>) => findingActionsForLiveState(ACTIONS, { status: 'OPEN', workDisposition: 'PENDING_REVIEW', ...state }).map((action) => action.id);
  expect(ids({})).toEqual(['finding-accept', 'finding-dismiss', 'finding-resolve']);
  expect(ids({ workDisposition: 'ACCEPTED' })).toEqual(['finding-dismiss', 'finding-resolve']);
  expect(ids({ status: 'ACCEPTED_AS_IS' })).toEqual(['finding-dismiss', 'finding-resolve']);
  expect(ids({ status: 'RESOLVED' })).toEqual([]);
  expect(ids({ status: 'DISMISSED' })).toEqual([]);
});

test('a finding opens inline, re-read through its report, with a link to the report page', async () => {
  await open([finding({ id: 'other' }), finding()]);
  await waitFor(() => expect(screen.getByText('Several shingles are missing on the north slope.')).toBeInTheDocument());
  expect(mockedList).toHaveBeenCalledWith('home', 'report-1');
  expect(screen.getByText('$300 – $600')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open the report/ })).toHaveAttribute('href', '/dashboard/properties/home/inspection-hub/report-1?findingId=finding-1');
});

test('actions follow the LIVE state and dispatch the exact finding and canned message', async () => {
  const { onAction } = await open([finding({ workDisposition: 'ACCEPTED' })]);
  await waitFor(() => expect(shown()).toEqual(['finding-dismiss', 'finding-resolve']));
  fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
  expect(onAction).toHaveBeenCalledWith('INSPECTION_FINDING', 'finding-1', 'Mark this inspection finding resolved.', 'INSPECTION_FINDING_UPDATE', 'MUTATE_RECORD');
});

test('a viewer (no declared actions) gets read-only detail', async () => {
  await open([finding()], jest.fn(), []);
  await waitFor(() => expect(screen.getByText('Several shingles are missing on the north slope.')).toBeInTheDocument());
  expect(shown()).toEqual([]);
});

test('a finding missing from its report, or a deleted report, is "no longer exists"; an uncoded 404 is lost access', async () => {
  const first = await open([finding({ id: 'someone-else' })]);
  await waitFor(() => expect(screen.getByText('Finding no longer exists')).toBeInTheDocument());
  expect(first.onAccessLost).not.toHaveBeenCalled();
});

test('a deleted report (coded NOT_FOUND) is also "no longer exists"', async () => {
  const { onAccessLost } = await open(Object.assign(new Error('nf'), { status: 404, payload: { error: { code: 'NOT_FOUND' } } }));
  await waitFor(() => expect(screen.getByText('Finding no longer exists')).toBeInTheDocument());
  expect(onAccessLost).not.toHaveBeenCalled();
});

test('a property access denial redacts instead', async () => {
  const { onAccessLost } = await open(Object.assign(new Error('denied'), { status: 404, payload: { message: 'Property not found or access denied.' } }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
});

test('the registry routes inspection-findings here and wires item actions through', async () => {
  const onItemAction = jest.fn();
  mockedList.mockResolvedValueOnce([finding()]);
  render(<BlockView block={block()} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={onItemAction} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'ROOF: Missing shingles' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Accept as work' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Accept as work' }));
  expect(onItemAction).toHaveBeenCalledWith('INSPECTION_FINDING', 'finding-1', 'Accept this inspection finding as work.', 'INSPECTION_FINDING_UPDATE', 'MUTATE_RECORD');
});
