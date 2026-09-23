import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { ClaimResultList, claimActionsForLiveStatus } from '../ClaimResultList';
import type { AskPresentationBlock } from '@/features/ask/types';
import { getClaim } from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import type { ClaimDTO } from '@/types/claims.types';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi', () => ({ getClaim: jest.fn() }));
const mockedGetClaim = getClaim as jest.MockedFunction<typeof getClaim>;

// FRD v1.42 claims capability-card slice.
const CLAIM_ACTIONS = [
  ['claim-start', 'Mark in progress', 'Mark this claim as in progress.'],
  ['claim-submit', 'Mark submitted', 'Submit this claim.'],
  ['claim-under-review', 'Mark under review', 'Move this claim to under review.'],
  ['claim-approve', 'Mark approved', 'Mark this claim approved.'],
  ['claim-deny', 'Mark denied', 'Mark this claim denied.'],
  ['claim-close', 'Close claim', 'Close this claim.'],
].map(([id, label, message]) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'CLAIM_TRANSITION' }));

const block = (actions = CLAIM_ACTIONS): Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> => ({
  type: 'GROUPED_LIST', id: 'incident-claim-list', title: 'Incidents and claims', filters: [], actions: [],
  sections: [
    { id: 'active-incidents', title: 'Active incidents', count: 1, items: [{ id: 'incident-1', title: 'Basement flooding', meta: [], description: null, status: 'ACTIVE', href: '/dashboard/properties/home/incidents/incident-1' }] },
    { id: 'active-claims', title: 'Open claims', count: 1, items: [{ id: 'claim-1', title: 'Kitchen leak', meta: ['draft'], description: 'Acme · water damage', status: 'DRAFT', href: '/dashboard/properties/home/claims/claim-1', entityType: 'CLAIM', actions }] },
  ],
});

function claim(overrides: Partial<ClaimDTO> = {}): ClaimDTO {
  return {
    id: 'claim-1', propertyId: 'home', title: 'Kitchen leak', description: 'Water under the sink.', type: 'WATER_DAMAGE', status: 'DRAFT',
    providerName: 'Acme Insurance', claimNumber: 'CLM-9', incidentAt: '2026-09-01T00:00:00.000Z', submittedAt: null,
    estimatedLossAmount: '2500', deductibleAmount: '1000', settlementAmount: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
    checklistItems: [
      { id: 'c1', orderIndex: 0, title: 'Photos', required: true, status: 'DONE' },
      { id: 'c2', orderIndex: 1, title: 'Call adjuster', required: true, status: 'OPEN' },
    ] as ClaimDTO['checklistItems'],
    timelineEvents: [{ id: 't1', type: 'NOTE', title: 'Called insurer', occurredAt: '2026-09-02T00:00:00.000Z', createdAt: '2026-09-02T00:00:00.000Z' }] as ClaimDTO['timelineEvents'],
    checklistCompletionPct: 50,
    ...overrides,
  };
}

const link = (href: string, content: React.ReactNode) => <a href={href}>{content}</a>;
async function open(liveClaim: ClaimDTO, onAction = jest.fn(), actions = CLAIM_ACTIONS) {
  mockedGetClaim.mockResolvedValueOnce(liveClaim);
  render(<ClaimResultList block={block(actions)} propertyId="home" onAction={onAction} onAccessLost={() => {}} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen leak' }));
  await waitFor(() => expect(screen.getByText('Water under the sink.')).toBeInTheDocument());
  return onAction;
}
const shown = () => Array.from(document.querySelectorAll('[data-claim-action]')).map((node) => node.getAttribute('data-claim-action'));

beforeEach(() => jest.clearAllMocks());

test('the legal next statuses come from the canonical lifecycle', () => {
  const ids = (status: ClaimDTO['status']) => claimActionsForLiveStatus(CLAIM_ACTIONS, status).map((action) => action.id);
  expect(ids('DRAFT')).toEqual(['claim-start', 'claim-submit', 'claim-close']);
  expect(ids('SUBMITTED')).toEqual(['claim-under-review', 'claim-approve', 'claim-deny', 'claim-close']);
  expect(ids('APPROVED')).toEqual(['claim-close']);
  expect(ids('CLOSED')).toEqual([]);
});

test('a claim row opens canonical detail inline; an incident row keeps its link', async () => {
  await open(claim());
  expect(mockedGetClaim).toHaveBeenCalledWith('home', 'claim-1');
  expect(screen.getByRole('link', { name: 'Basement flooding' })).toHaveAttribute('href', '/dashboard/properties/home/incidents/incident-1');
  expect(screen.getByText('Acme Insurance')).toBeInTheDocument();
  expect(screen.getByText(/Checklist: 1 of 2 done \(50%\)/)).toBeInTheDocument();
  expect(screen.getByText(/Called insurer/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open this claim/ })).toHaveAttribute('href', '/dashboard/properties/home/claims/claim-1');
});

test('actions follow the LIVE status, not the (possibly stale) row, and dispatch the exact claim and canned message', async () => {
  const onAction = await open(claim({ status: 'SUBMITTED' }));
  expect(shown()).toEqual(['claim-under-review', 'claim-approve', 'claim-deny', 'claim-close']);
  fireEvent.click(screen.getByRole('button', { name: 'Mark approved' }));
  expect(onAction).toHaveBeenCalledWith('CLAIM', 'claim-1', 'Mark this claim approved.', 'CLAIM_TRANSITION', 'MUTATE_RECORD');
});

test('a closed claim shows no actions and says why; a viewer (no declared actions) sees none', async () => {
  await open(claim({ status: 'CLOSED' }));
  expect(shown()).toEqual([]);
  expect(screen.getByText(/Closed claims cannot change status/)).toBeInTheDocument();
});

test('a viewer gets read-only detail', async () => {
  await open(claim(), jest.fn(), []);
  expect(shown()).toEqual([]);
});

test('a removed claim is distinct from lost access', async () => {
  mockedGetClaim.mockRejectedValueOnce(Object.assign(new Error('nf'), { status: 404, payload: { message: 'Claim not found' } }));
  const onAccessLost = jest.fn();
  render(<ClaimResultList block={block()} propertyId="home" onAccessLost={onAccessLost} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen leak' }));
  await waitFor(() => expect(screen.getByText('Claim no longer exists')).toBeInTheDocument());
  expect(onAccessLost).not.toHaveBeenCalled();
});

test('a property access denial redacts instead', async () => {
  mockedGetClaim.mockRejectedValueOnce(Object.assign(new Error('denied'), { status: 404, payload: { message: 'Property not found or access denied.' } }));
  const onAccessLost = jest.fn();
  render(<ClaimResultList block={block()} propertyId="home" onAccessLost={onAccessLost} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen leak' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
});

test('the registry routes incident-claim-list here and wires item actions through', async () => {
  const onItemAction = jest.fn();
  mockedGetClaim.mockResolvedValueOnce(claim());
  render(<BlockView block={block()} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={onItemAction} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen leak' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark submitted' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Mark submitted' }));
  expect(onItemAction).toHaveBeenCalledWith('CLAIM', 'claim-1', 'Submit this claim.', 'CLAIM_TRANSITION', 'MUTATE_RECORD');
});
