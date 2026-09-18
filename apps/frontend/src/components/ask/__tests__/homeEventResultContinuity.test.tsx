import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeEventResultList } from '../HomeEventResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { getHomeEvent, type HomeEvent } from '@/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi', () => ({
  getHomeEvent: jest.fn(),
}));
const mockedGetHomeEvent = getHomeEvent as jest.MockedFunction<typeof getHomeEvent>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'inventory-history', title: 'Water heater history', filters: [], actions: [
    { id: 'open-inventory', label: 'Open home inventory', href: '/dashboard/properties/home/inventory?tab=items', style: 'PRIMARY' },
  ],
  sections: [{ id: 'events', title: 'Timeline', count: 2, items: [
    { id: 'event-0', title: 'Water heater replaced', entityType: 'HOME_EVENT', meta: ['Jan 10, 2022', 'repair'], description: null, status: 'EXACT_DATE' },
    { id: 'event-1', title: 'Annual flush', entityType: 'HOME_EVENT', meta: ['Jan 10, 2023', 'maintenance'], description: null, status: 'EXACT_DATE' },
  ] }],
};
function execution(revision = 1, executionId = 'execution'): AskExecutionResponse {
  return { executionId, sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-18T00:00:0${revision}.000Z`,
    viewState: { resultId: 'result', revision, domainScopePhrase: 'inventory history', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}
function List({ response, onPage = () => {}, onAccessLost = () => {} }: { response: AskExecutionResponse; onPage?: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><HomeEventResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onFilter={() => {}} onPage={onPage} onAccessLost={onAccessLost} link={(_, label) => label} /></ResultViewContext.Provider>;
}
function canonicalEvent(overrides: Partial<HomeEvent> = {}): HomeEvent {
  return {
    id: 'event-0', propertyId: 'home', type: 'REPAIR', subtype: null, importance: 'NORMAL', visibility: 'HOUSEHOLD',
    occurredAt: '2022-01-10T00:00:00.000Z', endAt: null, datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null,
    observationKind: 'USER_REPORTED', verificationStatus: 'HOMEOWNER_CONFIRMED', title: 'Water heater replaced',
    summary: 'Old unit failed and was replaced by a licensed plumber.', amount: '850', currency: 'USD', valueDelta: null,
    meta: null, groupKey: null, createdAt: '2022-01-10T00:00:00.000Z', updatedAt: '2022-01-11T00:00:00.000Z', documents: [],
    ...overrides,
  } as HomeEvent;
}
beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('clicking a timeline event title opens canonical detail inline without navigating', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetHomeEvent.mockResolvedValueOnce(canonicalEvent());

  render(<List response={execution()} />);
  expect(screen.queryByRole('link', { name: 'Water heater replaced' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));

  await waitFor(() => expect(screen.getByText('Old unit failed and was replaced by a licensed plumber.')).toBeInTheDocument());
  expect(screen.getByText('Homeowner confirmed')).toBeInTheDocument();
  expect(screen.getByText('$850')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard/ask');
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBe('event-0');
});

test('deleted event detail is distinct from an access-loss failure', async () => {
  mockedGetHomeEvent.mockRejectedValueOnce({ status: 404, payload: { success: false, error: { message: 'Home event not found', code: 'HOME_EVENT_NOT_FOUND' } } });
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Event no longer exists'));
});

test('a 404 without HOME_EVENT_NOT_FOUND (property-level access denial) invokes whole-result redaction', async () => {
  const onAccessLost = jest.fn();
  mockedGetHomeEvent.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('an event leaving the result clears selection rather than selecting a substitute', () => {
  mockedGetHomeEvent.mockResolvedValueOnce(canonicalEvent());
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], items: block.sections[0].items.filter((item) => item.id !== 'event-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBeNull();
});

test('"Open home inventory" remains available as a separate, secondary option', () => {
  render(<List response={execution()} />);
  expect(screen.getByText('Open home inventory')).toBeInTheDocument();
});
