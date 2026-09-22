import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { getLatestTimeline } from '@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi';
import type { TimelineAnalysisResult, TimelineItemDTO } from '@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi', () => ({
  getLatestTimeline: jest.fn(),
}));
const mockedGetLatestTimeline = getLatestTimeline as jest.MockedFunction<typeof getLatestTimeline>;

type TableBlock = Extract<AskPresentationBlock, { type: 'TABLE' }>;
const block: TableBlock = {
  type: 'TABLE', id: 'capital-timeline-table', title: 'Upcoming capital windows',
  description: 'The next 12 planning windows across your capital timeline.',
  columns: [{ key: 'item', label: 'Item' }, { key: 'window', label: 'Planning window' }, { key: 'cost', label: 'Estimated range' }, { key: 'confidence', label: 'Confidence' }],
  rows: [{ id: 'timeline-0', values: { item: 'Water heater', window: 'Jan 2027 – Jun 2027', cost: '$950 – $1,350', confidence: 'High' } }],
  totalCount: 1,
  actions: [],
};

function execution(revision = 1): AskExecutionResponse {
  return { executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-22T00:00:0${revision}.000Z`,
    viewState: { resultId: 'capital-plan', revision, domainScopePhrase: 'capital reserve plan', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}

function Table({ response, onAccessLost = () => {} }: { response: AskExecutionResponse; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={response.blocks[0] as typeof block} executionId={response.executionId} propertyId={response.property?.id} itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={onAccessLost} />
  </ResultViewContext.Provider>;
}

function canonicalItem(overrides: Partial<TimelineItemDTO> = {}): TimelineItemDTO {
  return {
    id: 'timeline-0', inventoryItemId: 'item-0', category: 'PLUMBING', eventType: 'REPLACEMENT',
    windowStart: '2027-01-01T00:00:00.000Z', windowEnd: '2027-06-01T00:00:00.000Z',
    estimatedCostMinCents: 100000, estimatedCostMaxCents: 140000, currency: 'USD',
    confidence: 'HIGH', priority: 'HIGH',
    why: 'Typical service life for this water heater type is 10-12 years; it was installed 11 years ago.',
    missingFactors: [],
    inventoryItem: { name: 'Water heater', brand: 'AquaCore', model: 'AC-50' },
    ...overrides,
  };
}

function analysisWith(items: TimelineItemDTO[]): TimelineAnalysisResult {
  return { analysis: { id: 'analysis-0', status: 'READY', confidence: 'HIGH', horizonYears: 10, summary: null, computedAt: '2026-09-22T00:00:00.000Z', items }, assumptionSetId: null, nextAction: null };
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('a capital-timeline-table row dispatches through the registry and opens canonical window detail inline', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetLatestTimeline.mockResolvedValueOnce(analysisWith([canonicalItem()]));

  render(<BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByText('Typical service life')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));

  await waitFor(() => expect(screen.getByText('Typical service life for this water heater type is 10-12 years; it was installed 11 years ago.')).toBeInTheDocument());
  expect(mockedGetLatestTimeline).toHaveBeenCalledWith('home');
  expect(window.location.pathname).toBe('/dashboard/ask');
});

test('detail shows category, planning window, cost range, and the linked inventory item -- not just the row\'s own summary text', async () => {
  mockedGetLatestTimeline.mockResolvedValueOnce(analysisWith([canonicalItem()]));
  render(<Table response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByText(/Typical service life/)).toBeInTheDocument());
  expect(screen.getByText('Plumbing')).toBeInTheDocument();
  expect(screen.getByText('$1,000 – $1,400')).toBeInTheDocument();
  // Loose date match -- toLocaleDateString() is timezone-sensitive enough (UTC midnight can shift a full
  // calendar day, even across a year boundary) that pinning exact dates here would be a flaky assertion.
  expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{4}\s*–\s*\d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument();
  expect(screen.getByText(/Water heater · AquaCore AC-50/)).toBeInTheDocument();
});

test('window selection persists in result view state', async () => {
  mockedGetLatestTimeline.mockResolvedValueOnce(analysisWith([canonicalItem()]));
  render(<Table response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByText(/Typical service life/)).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'capital-plan')).detailTaskId).toBe('timeline-0');
});

test('a window removed or superseded by a later timeline run is distinct from an access-loss failure', async () => {
  mockedGetLatestTimeline.mockResolvedValueOnce(analysisWith([canonicalItem({ id: 'timeline-1' })]));
  render(<Table response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Capital window no longer exists'));
});

test('property access denial redacts the whole result instead of exposing a capital window state', async () => {
  const onAccessLost = jest.fn();
  mockedGetLatestTimeline.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<Table response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('closing the detail panel refocuses the row trigger', async () => {
  mockedGetLatestTimeline.mockResolvedValueOnce(analysisWith([canonicalItem()]));
  render(<Table response={execution()} />);
  const trigger = screen.getByRole('button', { name: 'Water heater' });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByText(/Typical service life/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Close capital window detail/ }));
  await waitFor(() => expect(screen.queryByText(/Typical service life/)).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('a TABLE block with a different id stays non-interactive (no accidental opt-in)', () => {
  const other: TableBlock = { ...block, id: 'cost-table', title: 'Ownership costs' };
  render(<BlockView block={other} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Water heater' })).not.toBeInTheDocument();
  expect(screen.getByText('Water heater')).toBeInTheDocument();
});
