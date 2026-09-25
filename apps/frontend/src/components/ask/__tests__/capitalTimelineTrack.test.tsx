import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { reconcileResultView } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { getLatestTimeline } from '@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi';
import type { TimelineAnalysisResult, TimelineItemDTO } from '@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi', () => ({ getLatestTimeline: jest.fn() }));
const mockedGet = getLatestTimeline as jest.MockedFunction<typeof getLatestTimeline>;

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-017, FRD v1.90): the capital windows on a timeline track, with the live
// canonical window detail kept under the track and in the list.

type Timeline = Extract<AskPresentationBlock, { type: 'TIMELINE' }>;
const item = (id: string, label: string, date: string, category: string) => ({
  id, label, date, datePrecision: 'MONTH' as const, description: null, status: 'High confidence', href: '/dashboard/properties/home/tools/capital-timeline',
  category: { id: category, label: category === 'PLUMBING' ? 'Plumbing' : 'Roofing' }, meta: ['Window Jan 1, 2027–Jun 1, 2027', 'Estimated $1,000–$1,400'],
});
const block = (items = [item('timeline-0', 'Water heater', '2027-01', 'PLUMBING'), item('timeline-1', 'Asphalt roof', '2028-05', 'ROOFING')]): Timeline => ({
  type: 'TIMELINE', id: 'capital-timeline-table', title: 'Upcoming capital windows', description: 'Windows come from the canonical Home Capital Timeline.', items,
});
const canonical = (overrides: Partial<TimelineItemDTO> = {}): TimelineItemDTO => ({
  id: 'timeline-0', inventoryItemId: 'item-0', category: 'PLUMBING', eventType: 'REPLACEMENT', windowStart: '2027-01-01T00:00:00.000Z', windowEnd: '2027-06-01T00:00:00.000Z',
  estimatedCostMinCents: 100000, estimatedCostMaxCents: 140000, currency: 'USD', confidence: 'HIGH', priority: 'HIGH',
  why: 'Typical service life for this water heater type is 10-12 years.', missingFactors: [], inventoryItem: { name: 'Water heater', brand: 'AquaCore', model: 'AC-50' }, ...overrides,
} as TimelineItemDTO);
const analysis = (items: TimelineItemDTO[]): TimelineAnalysisResult => ({ analysis: { id: 'a', status: 'READY', confidence: 'HIGH', horizonYears: 10, summary: null, computedAt: '2026-09-22T00:00:00.000Z', items }, assumptionSetId: null, nextAction: null } as TimelineAnalysisResult);

function Harness({ timeline, onAccessLost = () => {} }: { timeline: Timeline; onAccessLost?: () => void }) {
  const response = useMemo(() => ({ executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [timeline], viewState: { resultId: 'r', revision: 1 } }) as unknown as AskExecutionResponse, [timeline]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={timeline} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={onAccessLost} />
  </ResultViewContext.Provider>;
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('on the track, the selected window opens its live canonical detail, re-read from the capital timeline', async () => {
  mockedGet.mockResolvedValueOnce(analysis([canonical()]));
  const { container } = render(<Harness timeline={block()} />);
  expect(container.querySelector('[data-display-pattern="timeline"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Jan 2027: Water heater/ }));
  fireEvent.click(screen.getByRole('button', { name: /Details for Water heater/ }));
  await waitFor(() => expect(screen.getByText('Typical service life for this water heater type is 10-12 years.')).toBeInTheDocument());
  expect(mockedGet).toHaveBeenCalledWith('home');
  expect(screen.getByText('Capital window detail')).toBeInTheDocument();
});

test('in the list the same detail opens from each window, and a window gone from the capital timeline says so', async () => {
  mockedGet.mockResolvedValueOnce(analysis([canonical({ id: 'other' })]));
  render(<Harness timeline={block()} />);
  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  const rows = screen.getAllByRole('button', { name: /Details for/ });
  expect(rows).toHaveLength(2);
  fireEvent.click(rows[1]);
  await waitFor(() => expect(screen.getByText('Capital window no longer exists')).toBeInTheDocument());
});

test('a single window has no track, but keeps its list and its detail', async () => {
  mockedGet.mockResolvedValueOnce(analysis([canonical()]));
  const { container } = render(<Harness timeline={block([item('timeline-0', 'Water heater', '2027-01', 'PLUMBING')])} />);
  expect(container.querySelector('[data-display-pattern="timeline-list"]')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /View Upcoming capital windows/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Details for Water heater/ }));
  await waitFor(() => expect(screen.getByText('Typical service life for this water heater type is 10-12 years.')).toBeInTheDocument());
});

test('an access denial redacts through the existing path, and another timeline gets no Details button', async () => {
  mockedGet.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
  const onAccessLost = jest.fn();
  const { unmount } = render(<Harness timeline={block()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: /Jan 2027: Water heater/ }));
  fireEvent.click(screen.getByRole('button', { name: /Details for Water heater/ }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
  unmount();
  render(<Harness timeline={{ ...block(), id: 'home-timeline-events' }} />);
  expect(screen.queryByRole('button', { name: /Details for/ })).not.toBeInTheDocument();
  expect(within(document.body).queryByText('Capital window detail')).not.toBeInTheDocument();
});

test('a detail target on a timeline block survives hydration only while that window is still in the result', () => {
  const execution = { blocks: [block()] } as unknown as AskExecutionResponse;
  const view = { detailTarget: { blockId: 'capital-timeline-table', entityId: 'timeline-1' }, expandedRows: [], visibleCounts: {}, selectedTaskId: null, detailTaskId: null } as never;
  expect(reconcileResultView(view, execution).detailTarget).toEqual({ blockId: 'capital-timeline-table', entityId: 'timeline-1' });
  const gone = { blocks: [block([item('timeline-0', 'Water heater', '2027-01', 'PLUMBING')])] } as unknown as AskExecutionResponse;
  expect(reconcileResultView(view, gone).detailTarget).toBeNull();
});
