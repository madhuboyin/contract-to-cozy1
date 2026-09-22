import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { ReserveAllocationResultList } from '../ReserveAllocationResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { listLineItems } from '@/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/reserveFundApi';
import type { ReserveFundLineItemDTO } from '@/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/reserveFundApi';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/reserveFundApi', () => ({
  listLineItems: jest.fn(),
}));
const mockedListLineItems = listLineItems as jest.MockedFunction<typeof listLineItems>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'reserve-allocations', title: 'Active reserve allocations', filters: [],
  description: 'Allocated amounts are derived from timeline items and the homeowner’s reserve posture.',
  sections: [{ id: 'allocations', title: 'Funding plan', count: 1, items: [
    { id: 'line-0', title: 'Water heater', entityType: 'RESERVE_LINE_ITEM', meta: ['active'], description: '$25/month toward $1,200', status: 'ACTIVE', href: '/dashboard/properties/home/tools/reserve-fund' },
  ] }],
  actions: [{ id: 'open-reserve-fund', label: 'Open Reserve Fund', href: '/dashboard/properties/home/tools/reserve-fund', style: 'SECONDARY' }],
};

function execution(revision = 1): AskExecutionResponse {
  return { executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-22T00:00:0${revision}.000Z`,
    viewState: { resultId: 'capital-plan', revision, domainScopePhrase: 'capital reserve plan', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}

function List({ response, onAccessLost = () => {} }: { response: AskExecutionResponse; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><ReserveAllocationResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onAccessLost={onAccessLost} link={(href, content) => <a href={href}>{content}</a>} /></ResultViewContext.Provider>;
}

function canonicalLineItem(overrides: Partial<ReserveFundLineItemDTO> = {}): ReserveFundLineItemDTO {
  return {
    id: 'line-0', fundId: 'fund-0', timelineItemId: 'timeline-0', status: 'ACTIVE',
    targetCostCents: 120000, allocatedMonthlyCents: 2500, allocatedBalanceCents: 45000,
    retiredAt: null, retiredReason: null, retiredEvidenceRef: null,
    timelineItem: {
      id: 'timeline-0', inventoryItemId: 'item-0', category: 'PLUMBING', eventType: 'REPLACEMENT',
      windowStart: '2027-01-01T00:00:00.000Z', windowEnd: '2027-06-01T00:00:00.000Z',
      estimatedCostMinCents: 100000, estimatedCostMaxCents: 140000,
      why: 'Typical service life for this water heater type is 10-12 years; it was installed 11 years ago.',
      inventoryItem: { name: 'Water heater', condition: 'FAIR', installedOn: '2016-01-01T00:00:00.000Z', purchasedOn: '2016-01-01T00:00:00.000Z' },
    },
    ...overrides,
  };
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('reserve allocation titles dispatch through the registry and open canonical allocation detail inline', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedListLineItems.mockResolvedValueOnce([canonicalLineItem()]);

  render(<BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'Water heater' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open Reserve Fund/ })).toHaveAttribute('href', '/dashboard/properties/home/tools/reserve-fund');
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));

  await waitFor(() => expect(screen.getByText('Typical service life for this water heater type is 10-12 years; it was installed 11 years ago.')).toBeInTheDocument());
  expect(mockedListLineItems).toHaveBeenCalledWith('home');
  expect(window.location.pathname).toBe('/dashboard/ask');
});

test('detail shows target cost, allocated monthly/balance, planning window, and the linked inventory item -- not just the list item\'s own summary text', async () => {
  mockedListLineItems.mockResolvedValueOnce([canonicalLineItem()]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByText(/Typical service life/)).toBeInTheDocument());
  expect(screen.getByText('$1,200')).toBeInTheDocument();
  expect(screen.getByText('$25')).toBeInTheDocument();
  expect(screen.getByText('$450')).toBeInTheDocument();
  // Loose date match -- toLocaleDateString() is timezone-sensitive enough (UTC midnight can shift a full
  // calendar day, even across a year boundary) that pinning exact dates here would be a flaky assertion.
  expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{4}\s*–\s*\d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument();
  expect(screen.getByText('$1,000 – $1,400')).toBeInTheDocument();
  expect(screen.getByText(/Water heater · Fair/)).toBeInTheDocument();
});

test('allocation selection persists in result view state', async () => {
  mockedListLineItems.mockResolvedValueOnce([canonicalLineItem()]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByText(/Typical service life/)).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'capital-plan')).detailTaskId).toBe('line-0');
});

test('an allocation removed from the fund is distinct from an access-loss failure', async () => {
  mockedListLineItems.mockResolvedValueOnce([canonicalLineItem({ id: 'line-1' })]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Allocation no longer exists'));
});

test('property access denial redacts the whole result instead of exposing an allocation state', async () => {
  const onAccessLost = jest.fn();
  mockedListLineItems.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a retired allocation shows its retirement date and reason', async () => {
  mockedListLineItems.mockResolvedValueOnce([canonicalLineItem({ status: 'RETIRED', retiredAt: '2027-03-01T00:00:00.000Z', retiredReason: 'LINKED_HOME_EVENT' })]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  // Loose date match -- toLocaleDateString() is timezone-sensitive at the day (and possibly year) level.
  await waitFor(() => expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{4}\s*·\s*Linked home event/)).toBeInTheDocument());
});

test('an allocation leaving the refreshed result clears selection without choosing a substitute', () => {
  mockedListLineItems.mockResolvedValueOnce([canonicalLineItem()]);
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], count: 0, items: block.sections[0].items.filter((item) => item.id !== 'line-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'capital-plan')).detailTaskId).toBeNull();
});
