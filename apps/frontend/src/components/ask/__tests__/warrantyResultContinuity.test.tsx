import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { WarrantyResultList } from '../WarrantyResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { Warranty } from '@/types';

jest.mock('@/lib/api/client', () => ({ api: { getPropertyWarranties: jest.fn() } }));
const mockedGetPropertyWarranties = api.getPropertyWarranties as jest.MockedFunction<typeof api.getPropertyWarranties>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'property-warranties', title: 'Warranties', filters: [],
  description: 'Select a warranty to inspect its current canonical details without leaving Ask Cozy.',
  sections: [{ id: 'warranties', title: 'Recorded warranties', count: 1, items: [
    { id: 'warranty-0', title: 'Acme Home Warranty', entityType: 'WARRANTY', meta: ['Home warranty plan', 'Expires Dec 1, 2027'], description: null, status: 'ACTIVE', href: null },
  ] }],
  actions: [{ id: 'open-warranties', label: 'Open Warranties', href: '/dashboard/warranties', style: 'SECONDARY' }],
};

function execution(revision = 1): AskExecutionResponse {
  return { executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-18T00:00:0${revision}.000Z`,
    viewState: { resultId: 'property-summary', revision, domainScopePhrase: 'property summary', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}

function List({ response, onAccessLost = () => {} }: { response: AskExecutionResponse; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><WarrantyResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onAccessLost={onAccessLost} link={(href, content) => <a href={href}>{content}</a>} /></ResultViewContext.Provider>;
}

function canonicalWarranty(overrides: Partial<Warranty> = {}): Warranty {
  return {
    id: 'warranty-0', homeownerProfileId: 'profile-0', propertyId: 'home', inventoryItemId: null,
    category: 'HOME_WARRANTY_PLAN', providerName: 'Acme Home Warranty', policyNumber: 'POL-123',
    coverageDetails: 'Covers HVAC and major appliances.', cost: 45000,
    startDate: '2026-01-01T00:00:00.000Z', expiryDate: '2027-12-01T00:00:00.000Z',
    documents: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('Property Summary warranty titles dispatch through the registry and open canonical warranty detail inline', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetPropertyWarranties.mockResolvedValueOnce([canonicalWarranty()]);

  render(<BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'Acme Home Warranty' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open Warranties/ })).toHaveAttribute('href', '/dashboard/warranties');
  fireEvent.click(screen.getByRole('button', { name: 'Acme Home Warranty' }));

  await waitFor(() => expect(screen.getByText('POL-123')).toBeInTheDocument());
  expect(mockedGetPropertyWarranties).toHaveBeenCalledWith('home');
  expect(window.location.pathname).toBe('/dashboard/ask');
});

test('warranty selection persists in result view state', async () => {
  mockedGetPropertyWarranties.mockResolvedValueOnce([canonicalWarranty()]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Acme Home Warranty' }));
  await waitFor(() => expect(screen.getByText('POL-123')).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'property-summary')).detailTaskId).toBe('warranty-0');
});

test('a warranty removed from the record is distinct from an access-loss failure', async () => {
  mockedGetPropertyWarranties.mockResolvedValueOnce([canonicalWarranty({ id: 'warranty-1' })]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Acme Home Warranty' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Warranty no longer exists'));
});

test('property access denial redacts the whole result instead of exposing a warranty state', async () => {
  const onAccessLost = jest.fn();
  mockedGetPropertyWarranties.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Acme Home Warranty' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a warranty leaving the refreshed result clears selection without choosing a substitute', () => {
  mockedGetPropertyWarranties.mockResolvedValueOnce([canonicalWarranty()]);
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Acme Home Warranty' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], count: 0, items: block.sections[0].items.filter((item) => item.id !== 'warranty-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'property-summary')).detailTaskId).toBeNull();
});
