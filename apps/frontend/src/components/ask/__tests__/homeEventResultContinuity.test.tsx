import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EVIDENCE_ATTACH_MESSAGE, HomeEventResultList } from '../HomeEventResultList';
import { AskBlockActionContext } from '../blocks/context';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { getHomeEvent, type HomeEvent } from '@/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi';
import { api } from '@/lib/api/client';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi', () => ({
  getHomeEvent: jest.fn(),
}));
jest.mock('@/lib/api/client', () => ({ api: { uploadAskEvidence: jest.fn() } }));
const mockedGetHomeEvent = getHomeEvent as jest.MockedFunction<typeof getHomeEvent>;
const mockedUploadAskEvidence = api.uploadAskEvidence as jest.MockedFunction<typeof api.uploadAskEvidence>;

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

test('Property Summary timeline events use the same inline canonical detail and keep traditional navigation secondary', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetHomeEvent.mockResolvedValueOnce(canonicalEvent({ id: 'event-summary', title: 'Roof replacement' }));
  const propertySummaryBlock: typeof block = {
    type: 'GROUPED_LIST', id: 'property-recent-events', title: 'Recent verified home activity', filters: [],
    sections: [{ id: 'recent-events', title: 'Home Timeline', count: 1, items: [{
      id: 'event-summary', title: 'Roof replacement', entityType: 'HOME_EVENT', meta: ['Sep 1, 2026', 'improvement'], description: null, status: 'EVIDENCE_VERIFIED', href: null,
    }] }],
    actions: [{ id: 'open-home-timeline', label: 'Open home timeline', href: '/dashboard/properties/home/timeline', style: 'SECONDARY' }],
  };

  render(<BlockView block={propertySummaryBlock} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'Roof replacement' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open home timeline/ })).toHaveAttribute('href', '/dashboard/properties/home/timeline');
  fireEvent.click(screen.getByRole('button', { name: 'Roof replacement' }));

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Roof replacement' })).toBeInTheDocument());
  expect(mockedGetHomeEvent).toHaveBeenCalledWith('home', 'event-summary');
  expect(window.location.pathname).toBe('/dashboard/ask');
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

test('inline event detail exposes declared correction actions with exact event identity; none render without declared actions', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetHomeEvent.mockResolvedValue(canonicalEvent());
  const withActions: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], actions: [{ id: 'correct-title', label: 'Correct title', message: 'Correct the title of this timeline event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_CORRECT' }] },
    ...block.sections[0].items.slice(1),
  ] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [withActions] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><HomeEventResultList block={withActions} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  const first = render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  fireEvent.click(await screen.findByRole('button', { name: /Correct title/ }));
  expect(onAction).toHaveBeenCalledWith('HOME_EVENT', 'event-0', 'Correct the title of this timeline event.', 'HOME_EVENT_CORRECT', 'MUTATE_RECORD');
  first.unmount();
  window.sessionStorage.clear();

  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  await waitFor(() => expect(screen.getByText('Homeowner confirmed')).toBeInTheDocument());
  expect(screen.queryByRole('group', { name: /Corrections for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Attach evidence/ })).not.toBeInTheDocument();
});

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3, evidence upload design (approved 2026-09-22).
test('Attach evidence control: uploads the picked file out of band, then dispatches CAPTURE_EVIDENCE_CONFIRM with the resulting documentId', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetHomeEvent.mockResolvedValue(canonicalEvent());
  mockedUploadAskEvidence.mockResolvedValueOnce({ success: true, data: { document: { id: 'doc-1', name: 'invoice.pdf', mimeType: 'application/pdf', fileSize: 1024 } } } as Awaited<ReturnType<typeof api.uploadAskEvidence>>);
  const withActions: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], actions: [{ id: 'correct-title', label: 'Correct title', message: 'Correct the title of this timeline event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_CORRECT' }] },
    ...block.sections[0].items.slice(1),
  ] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [withActions] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><HomeEventResultList block={withActions} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  await screen.findByRole('button', { name: /Attach evidence/ });

  const file = new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Attach evidence file for Water heater replaced'), { target: { files: [file] } });

  await waitFor(() => expect(onAction).toHaveBeenCalledWith('HOME_EVENT', 'event-0', EVIDENCE_ATTACH_MESSAGE, 'CAPTURE_EVIDENCE_CONFIRM', 'MUTATE_RECORD', 'doc-1'));
  expect(mockedUploadAskEvidence).toHaveBeenCalledWith('home', file);
});

test('Attach evidence control: an unsupported file type or a failed upload is refused with a visible error and never dispatches', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetHomeEvent.mockResolvedValue(canonicalEvent());
  mockedUploadAskEvidence.mockRejectedValueOnce(new Error('The server refused the file.'));
  const withActions: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], actions: [{ id: 'correct-title', label: 'Correct title', message: 'Correct the title of this timeline event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_CORRECT' }] },
    ...block.sections[0].items.slice(1),
  ] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [withActions] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><HomeEventResultList block={withActions} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater replaced' }));
  await screen.findByRole('button', { name: /Attach evidence/ });

  // Client-side type rejection: never even calls the upload endpoint.
  const badType = new File(['x'], 'notes.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Attach evidence file for Water heater replaced'), { target: { files: [badType] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPEG, PNG, WEBP, or PDF file.'));
  expect(mockedUploadAskEvidence).not.toHaveBeenCalled();

  // Server-side failure: the upload is attempted but rejected.
  const goodType = new File(['x'], 'invoice.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Attach evidence file for Water heater replaced'), { target: { files: [goodType] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The server refused the file.'));
  expect(onAction).not.toHaveBeenCalled();
});


test('the events list renders its declared START_WORKFLOW block action as a button and dispatches that exact action; href actions stay links', () => {
  const addAction = { id: 'add-timeline-event', label: 'Add a timeline event', interactionType: 'START_WORKFLOW' as const, message: 'Add an event to my home timeline.', operationId: 'CAPTURE_EVENT_CONFIRM', style: 'PRIMARY' as const };
  const withAdd: typeof block = { ...block, actions: [addAction, ...block.actions] };
  const invoke = jest.fn();
  render(
    <AskBlockActionContext.Provider value={{ disabled: false, invoke }}>
      <ResultViewContext.Provider value={null}>
        <HomeEventResultList block={withAdd} propertyId="home" onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(href, content) => <a href={href}>{content}</a>} />
      </ResultViewContext.Provider>
    </AskBlockActionContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Add a timeline event/ }));
  expect(invoke).toHaveBeenCalledWith(addAction);
  expect(screen.getByRole('link', { name: /Open home inventory/ })).toBeInTheDocument();
});
