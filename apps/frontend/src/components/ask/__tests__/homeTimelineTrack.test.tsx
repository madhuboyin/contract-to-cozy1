import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-017 (FRD v1.77): the Home Timeline answer on the track, with the
// record facts in the selected event's detail and a Timeline/List switch kept with the result.

type TimelineBlock = Extract<AskPresentationBlock, { type: 'TIMELINE' }>;
const PAGE = '/dashboard/properties/home/timeline';
const block: TimelineBlock = {
  type: 'TIMELINE', id: 'home-timeline-events', title: 'Home timeline', description: 'Each event sits at its recorded date.',
  items: [
    { id: 'kitchen', label: 'Kitchen remodel', date: '2024-06-15', datePrecision: 'DAY', status: 'Evidence Verified', href: `${PAGE}?eventId=kitchen`, category: { id: 'work', label: 'Work done' }, entityType: 'HOME_EVENT', meta: ['Improvement', 'Highlight'], description: 'New cabinets and counters.' },
    { id: 'note', label: 'Paint colours', date: '2024-02', datePrecision: 'MONTH', status: 'Unverified', href: `${PAGE}?eventId=note`, category: { id: 'records', label: 'Records and notes' }, entityType: 'HOME_EVENT', meta: ['Note', 'Private'] },
    { id: 'inspection', label: 'Home inspection', date: '2023', datePrecision: 'YEAR', status: 'Homeowner Confirmed', href: `${PAGE}?eventId=inspection`, category: { id: 'inspections', label: 'Inspections' }, entityType: 'HOME_EVENT', meta: ['Inspection'] },
    { id: 'gutters', label: 'Gutter repair', date: '2020-04-01', datePrecision: 'DAY', status: 'Unverified', href: `${PAGE}?eventId=gutters`, category: { id: 'work', label: 'Work done' }, entityType: 'HOME_EVENT', meta: ['Apr 1, 2020 – Jun 30, 2020', 'Repair'] },
  ],
};

function Harness() {
  const response = useMemo(() => ({
    sessionId: 'timeline-session', executionId: 'timeline-execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'timeline-result', revision: 1, domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
    blocks: [block], updatedAt: '2026-09-24T12:00:00.000Z',
  } as AskExecutionResponse), []);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={block} executionId="timeline-execution" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

test('the track opens on the latest event and shows its record facts; stepping back reaches a range placed at its start', async () => {
  const { container } = render(<Harness />);
  await waitFor(() => expect(container.querySelector('[data-ask-timeline-selected="kitchen"]')).toBeInTheDocument());
  const detail = container.querySelector('[data-ask-timeline-selected="kitchen"]') as HTMLElement;
  expect(within(detail).getByText('Jun 15, 2024 · Work done · Evidence Verified')).toBeInTheDocument();
  expect(within(detail).getByText('Improvement · Highlight')).toBeInTheDocument();
  expect(within(detail).getByRole('link', { name: 'Open record' })).toHaveAttribute('href', `${PAGE}?eventId=kitchen`);
  // A month-precision event keeps its month; a year keeps its year.
  expect(screen.getByRole('button', { name: 'Feb 2024: Paint colours (Records and notes)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2023: Home inspection (Inspections)' })).toBeInTheDocument();
  for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Previous event' }));
  const gutters = container.querySelector('[data-ask-timeline-selected="gutters"]') as HTMLElement;
  expect(within(gutters).getByText('Apr 1, 2020 – Jun 30, 2020 · Repair')).toBeInTheDocument();
});

test('category chips name the grouped categories and hide their events', async () => {
  const { container } = render(<Harness />);
  const group = await screen.findByRole('group', { name: 'Show types' });
  expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Work done', 'Records and notes', 'Inspections']);
  fireEvent.click(within(group).getByRole('button', { name: 'Work done' }));
  expect(container.querySelector('[data-ask-timeline-point="kitchen"]')).toBeNull();
  expect(container.querySelector('[data-ask-timeline-point="gutters"]')).toBeNull();
  expect(container.querySelector('[data-ask-timeline-selected="note"]')).toBeInTheDocument();
});

test('the List choice shows every event newest first with readable dates and facts, and is kept with the result', async () => {
  const first = render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'List' }));
  expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  expect(first.container.querySelector('[data-display-pattern="timeline"]')).toBeNull();
  const list = first.container.querySelector('[data-timeline-list]') as HTMLElement;
  const rows = within(list).getAllByRole('listitem');
  expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual(['Kitchen remodel', 'Paint colours', 'Home inspection', 'Gutter repair']);
  expect(within(rows[1]).getByText('Feb 2024')).toBeInTheDocument();
  expect(within(rows[2]).getByText('2023')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Records and notes · Note · Private')).toBeInTheDocument();
  expect(readResultView(window.sessionStorage, resultViewKey('timeline-session', 'home', 'timeline-result')).timelineLayouts?.['home-timeline-events']).toBe('LIST');
  first.unmount();
  const second = render(<Harness />);
  await waitFor(() => expect(second.container.querySelector('[data-timeline-list]')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
  expect(second.container.querySelector('[data-display-pattern="timeline"]')).toBeInTheDocument();
});
