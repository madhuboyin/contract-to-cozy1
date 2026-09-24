import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { GroupedListBlock } from '../blocks/GroupedListBlock';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import {
  comparisonBadges, lifespanOrder, resolveGroupedListPattern, resolveTimelineTrack, roomFloors, timelinePoint,
} from '@/features/ask/displayPatterns';
import type { AskExecutionResponse, AskGroupedListItem, AskGroupedListItemAction, AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-013–022, FRD v1.72).

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const action = (id: string, label: string, style: AskGroupedListItemAction['style'] = 'SECONDARY'): AskGroupedListItemAction => ({
  id, label, message: `${label} message`, style, interactionType: 'CONVERSATION_CONTINUE', operationId: 'INSPECTION_FINDINGS',
});
const item = (id: string, extra: Partial<AskGroupedListItem> = {}): AskGroupedListItem => ({ id, title: `Item ${id}`, meta: [], entityType: 'THING', ...extra });
const list = (extra: Partial<GroupedList>, sections: GroupedList['sections']): GroupedList => ({
  type: 'GROUPED_LIST', id: 'records', title: 'Records', filters: [], actions: [], sections, ...extra,
});

function Harness({ block, onItemAction = jest.fn() }: { block: AskPresentationBlock; onItemAction?: jest.Mock }) {
  const response = useMemo(() => ({
    sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'result', revision: 1 }, blocks: [block],
  } as AskExecutionResponse), [block]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

describe('pattern resolver', () => {
  const deckBlock = (items: AskGroupedListItem[], presentation: GroupedList['presentation'] = { pattern: 'DECK', swipeRightActionId: 'accept', swipeLeftActionId: 'dismiss' }) =>
    list({ presentation }, [{ id: 's', title: 'S', count: items.length, items }]);

  test('no declared pattern, no items, or a homeowner List/Cards choice means the plain list', () => {
    expect(resolveGroupedListPattern(list({}, [{ id: 's', title: 'S', count: 1, items: [item('1')] }]), 'AUTO')).toMatchObject({ pattern: null, reason: 'NO_PATTERN', offersChoice: false });
    expect(resolveGroupedListPattern(list({ presentation: { pattern: 'SHELVES' } }, [{ id: 's', title: 'S', count: 0, items: [] }]), 'AUTO')).toMatchObject({ pattern: null, reason: 'NO_ITEMS' });
    const shelves = list({ presentation: { pattern: 'SHELVES' } }, [{ id: 's', title: 'S', count: 1, items: [item('1')] }]);
    expect(resolveGroupedListPattern(shelves, 'LIST')).toMatchObject({ pattern: null, reason: 'HOMEOWNER_CHOSE_LIST', offersChoice: true });
    expect(resolveGroupedListPattern(shelves, 'CARDS')).toMatchObject({ pattern: null, reason: 'HOMEOWNER_CHOSE_LIST' });
    expect(resolveGroupedListPattern(shelves, 'AUTO')).toMatchObject({ pattern: 'SHELVES' });
  });

  test('a deck needs actions on every item and a bounded count; swipe ids must exist on every item', () => {
    const both = [action('accept', 'Accept'), action('dismiss', 'Dismiss')];
    expect(resolveGroupedListPattern(deckBlock([item('1', { actions: both }), item('2')]), 'AUTO')).toMatchObject({ pattern: null, reason: 'ITEMS_WITHOUT_ACTIONS' });
    const many = Array.from({ length: 31 }, (_, index) => item(String(index), { actions: both }));
    expect(resolveGroupedListPattern(deckBlock(many), 'AUTO')).toMatchObject({ pattern: null, reason: 'TOO_MANY_FOR_DECK' });
    const partial = deckBlock([item('1', { actions: both }), item('2', { actions: [action('accept', 'Accept')] })]);
    expect(resolveGroupedListPattern(partial, 'AUTO')).toMatchObject({ pattern: 'DECK', swipeRightActionId: 'accept', swipeLeftActionId: null });
  });

  test('timeline dates keep their recorded precision and never invent a day', () => {
    expect(timelinePoint('a', '2022-03', 'MONTH')).toMatchObject({ label: 'Mar 2022' });
    expect(timelinePoint('a', '2022-03-14T10:00:00Z', 'MONTH')).toMatchObject({ label: 'Mar 2022' });
    expect(timelinePoint('a', '2022-03-14', null)).toMatchObject({ label: 'Mar 14, 2022' });
    expect(timelinePoint('a', '2019', null)).toMatchObject({ label: '2019' });
    expect(timelinePoint('a', 'last spring', null)).toBeNull();
    expect(timelinePoint('a', '2022-13', null)).toBeNull();
    const timeline = (dates: Array<string | null>): Extract<AskPresentationBlock, { type: 'TIMELINE' }> => ({ type: 'TIMELINE', id: 't', title: 'T', items: dates.map((date, index) => ({ id: String(index), label: `E${index}`, date })) });
    expect(resolveTimelineTrack(timeline(['2020']))).toBeNull();
    expect(resolveTimelineTrack(timeline(['2020', null]))).toBeNull();
    expect(resolveTimelineTrack(timeline(['2020', '2021-05']))).toHaveLength(2);
  });

  test('rooms group by floor level, lowest first, with rooms lacking a floor last', () => {
    const floors = roomFloors([item('a', { floorLevel: 2 }), item('b', { floorLevel: null }), item('c', { floorLevel: 1 }), item('d', { floorLevel: 2 })]);
    expect(floors.map((floor) => [floor.label, floor.items.map((room) => room.id)])).toEqual([['Floor 1', ['c']], ['Floor 2', ['a', 'd']], ['Other', ['b']]]);
    expect(roomFloors([item('x')]).map((floor) => floor.label)).toEqual(['Rooms']);
  });

  test('lifespan order is by share of typical life used; badges fall back to the single legacy badge', () => {
    const ordered = lifespanOrder([
      { id: 'roof', ageYears: 6, typicalLifeYears: { max: 25 } },
      { id: 'ac', ageYears: 14, typicalLifeYears: { max: 17 } },
      { id: 'wh', ageYears: 10, typicalLifeYears: { max: 12 } },
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(['wh', 'ac', 'roof']);
    const badge = { label: 'Lowest price', basis: 'b', policyCode: 'LOWEST' };
    expect(comparisonBadges({ id: 'o', label: 'O', attributes: [], actions: [], badge })).toEqual([badge]);
    expect(comparisonBadges({ id: 'o', label: 'O', attributes: [], actions: [], badge, badges: [] })).toEqual([badge]);
    expect(comparisonBadges({ id: 'o', label: 'O', attributes: [], actions: [] })).toEqual([]);
  });
});

describe('shelves', () => {
  const block = list({ presentation: { pattern: 'SHELVES' }, actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: '/dashboard/maintenance?propertyId=home', style: 'SECONDARY' }] }, [
    { id: 'overdue', title: 'Overdue', count: 2, items: [
      item('filter', { title: 'Replace HVAC filter', tone: 'CRITICAL', timingLabel: '12 days late', amountLabel: '$25', description: 'Due every 90 days.', actions: [action('complete', 'Mark done', 'PRIMARY')] }),
      item('alarm', { title: 'Test alarms', tone: 'CRITICAL', timingLabel: '5 days late' }),
    ] },
    { id: 'later', title: 'Later', count: 5, items: [item('hose', { title: 'Winterize hose bibs', timingLabel: 'Nov 8' })] },
  ]);

  test('each group is a labelled shelf with an honest count, and a partial shelf says so', async () => {
    const { container } = render(<Harness block={block} />);
    await waitFor(() => expect(container.querySelector('[data-display-pattern="shelves"]')).toBeInTheDocument());
    expect(screen.getByRole('list', { name: 'Overdue, 2 items' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Later, Showing 1 of 5' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See all 5 · Open Maintenance/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scroll Overdue back' })).toBeInTheDocument();
  });

  test('tapping a card opens its detail in place, and its action is sent with the item identity', async () => {
    const onItemAction = jest.fn();
    render(<Harness block={block} onItemAction={onItemAction} />);
    fireEvent.click(await screen.findByRole('button', { name: /Replace HVAC filter/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Replace HVAC filter' });
    expect(within(sheet).getByText('Due every 90 days.')).toBeInTheDocument();
    expect(within(sheet).getByText('$25')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mark done' }));
    expect(onItemAction).toHaveBeenCalledWith('THING', 'filter', 'Mark done message', 'INSPECTION_FINDINGS', 'CONVERSATION_CONTINUE');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('the homeowner can switch to the plain list and back, and the choice is kept', async () => {
    const { container, unmount } = render(<Harness block={block} />);
    fireEvent.click(await screen.findByRole('button', { name: 'List' }));
    expect(container.querySelector('[data-display-pattern="shelves"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-ask-task-id]')).toHaveLength(3);
    unmount();
    const restored = render(<Harness block={block} />);
    const back = await screen.findByRole('button', { name: 'Show as shelves' });
    expect(restored.container.querySelector('[data-display-pattern="shelves"]')).not.toBeInTheDocument();
    fireEvent.click(back);
    expect(restored.container.querySelector('[data-display-pattern="shelves"]')).toBeInTheDocument();
  });

  test('without a declared pattern the grouped list renders exactly as before', () => {
    const plain = { ...block, presentation: undefined };
    const { container } = render(<GroupedListBlock block={plain} executionId="e" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);
    expect(container.querySelector('[data-display-pattern]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-grouped-list-presentation]')).toBeInTheDocument();
  });
});

describe('card deck', () => {
  const findings = ['breaker', 'toilet', 'downspout'].map((id) => item(id, { title: `Finding ${id}`, status: 'NEEDS_REVIEW', actions: [action('accept', 'Add to plan', 'PRIMARY'), action('dismiss', 'Not relevant')] }));
  const block = list({ presentation: { pattern: 'DECK', swipeRightActionId: 'accept', swipeLeftActionId: 'dismiss' } }, [{ id: 'open', title: 'Needs review', count: 3, items: findings }]);

  test('one card at a time: an action is sent and the next card shows; Skip sends nothing; Back revisits', async () => {
    const onItemAction = jest.fn();
    render(<Harness block={block} onItemAction={onItemAction} />);
    expect(await screen.findByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(onItemAction).toHaveBeenCalledWith('THING', 'breaker', 'Add to plan message', 'INSPECTION_FINDINGS', 'CONVERSATION_CONTINUE');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(onItemAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    // A skipped card says so; nothing was sent for it.
    expect(screen.getByText('Skipped for now')).toBeInTheDocument();
  });

  test('arrow keys perform the declared swipe actions, and the end shows what was sent', async () => {
    const onItemAction = jest.fn();
    const { container } = render(<Harness block={block} onItemAction={onItemAction} />);
    const card = await screen.findByRole('group', { name: /Finding breaker, 1 of 3/ });
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('group', { name: /Finding toilet/ }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('group', { name: /Finding downspout/ }), { key: 'ArrowRight' });
    expect(onItemAction.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['breaker', 'Add to plan message'], ['toilet', 'Not relevant message'], ['downspout', 'Add to plan message'],
    ]);
    expect(container.querySelector('[data-ask-deck-complete]')).toBeInTheDocument();
    expect(screen.getByText('2 · Add to plan')).toBeInTheDocument();
    expect(screen.getByText('1 · Not relevant')).toBeInTheDocument();
  });

  test('an item without declared actions means no deck: the plain list is shown', () => {
    const mixed = list({ presentation: { pattern: 'DECK' } }, [{ id: 'open', title: 'Needs review', count: 2, items: [findings[0], item('bare')] }]);
    const { container } = render(<Harness block={mixed} />);
    expect(container.querySelector('[data-display-pattern="deck"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-ask-task-id]')).toHaveLength(2);
  });
});

describe('room map', () => {
  test('floors are switchable and a room opens its detail in place', async () => {
    const block = list({ presentation: { pattern: 'ROOM_MAP' } }, [{ id: 'rooms', title: 'Rooms', count: 3, items: [
      item('kitchen', { title: 'Kitchen', floorLevel: 1, countLabel: '14 items', badgeLabel: '1 open' }),
      item('den', { title: 'Den', floorLevel: 1, countLabel: '3 items' }),
      item('primary', { title: 'Primary bedroom', floorLevel: 2, countLabel: '5 items' }),
    ] }]);
    render(<Harness block={block} />);
    expect(await screen.findByRole('list', { name: 'Floor 1, 2 rooms' })).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Floor 2/ }));
    expect(screen.getByRole('list', { name: 'Floor 2, 1 room' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Primary bedroom/ }));
    expect(await screen.findByRole('dialog', { name: 'Primary bedroom' })).toBeInTheDocument();
  });
});

describe('lifespan, progress, timeline, chips and badges', () => {
  test('lifespan shows the server status as declared, most-used first, and missing years offer their action', () => {
    const onItemAction = jest.fn();
    const { container } = render(<Harness onItemAction={onItemAction} block={{
      type: 'LIFESPAN', id: 'life', title: 'Appliance ages', basis: 'Estimated from install years, not an inspection.',
      items: [
        { id: 'roof', label: 'Roof', ageYears: 6, typicalLifeYears: { min: 20, max: 25 }, status: 'WITHIN_RANGE', statusLabel: 'Plenty of life' },
        // Deliberately inconsistent numbers: the renderer must show the declared label, not derive its own.
        { id: 'wh', label: 'Water heater', ageYears: 10, typicalLifeYears: { min: 8, max: 12 }, status: 'PAST_RANGE', statusLabel: 'Past typical range' },
      ],
      missingAge: [{ id: 'mw', label: 'Microwave', entityType: 'INVENTORY_ITEM', actions: [action('add-year', 'Add install year', 'PRIMARY')] }],
    }} />);
    expect(Array.from(container.querySelectorAll('[data-ask-lifespan-item]')).map((row) => row.getAttribute('data-ask-lifespan-item'))).toEqual(['wh', 'roof']);
    expect(screen.getByText('Past typical range')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Water heater: 10 yrs old; typical life 8 to 12 years' })).toBeInTheDocument();
    expect(screen.getByText('Estimated from install years, not an inspection.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add install year' }));
    expect(onItemAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'mw', 'Add install year message', 'INSPECTION_FINDINGS', 'CONVERSATION_CONTINUE');
  });

  test('progress shows the declared percent with its basis, not a count of the steps', () => {
    const onItemAction = jest.fn();
    render(<Harness onItemAction={onItemAction} block={{
      type: 'PROGRESS', id: 'ready', title: 'Sale readiness', percent: 68.4, basis: 'Weighted by buyer impact across 25 items',
      metrics: [{ label: 'items done', value: '17/25', tone: 'DEFAULT' }],
      nextSteps: [item('paint', { title: 'Repaint the hall', amountLabel: '~$1,800', actions: [action('quotes', 'Get quotes')] })],
      actions: [],
    }} />);
    expect(screen.getByRole('img', { name: '68% ready. Weighted by buyer impact across 25 items' })).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get quotes' }));
    expect(onItemAction).toHaveBeenCalledWith('THING', 'paint', 'Get quotes message', 'INSPECTION_FINDINGS', 'CONVERSATION_CONTINUE');
  });

  test('timeline: dated records use the track with filters and stepping; unreadable dates keep the list', () => {
    const timeline: Extract<AskPresentationBlock, { type: 'TIMELINE' }> = { type: 'TIMELINE', id: 't', title: 'Home history', items: [
      { id: 'roof', label: 'Roof replaced', date: '2020-08', datePrecision: 'MONTH', category: { id: 'improve', label: 'Improvement' } },
      { id: 'claim', label: 'Water claim', date: '2022-02-10', datePrecision: 'DAY', category: { id: 'ins', label: 'Insurance' } },
      { id: 'deck', label: 'Deck sealed', date: '2024', datePrecision: 'YEAR', category: { id: 'maint', label: 'Maintenance' } },
    ] };
    const { container, unmount } = render(<Harness block={timeline} />);
    expect(container.querySelector('[data-display-pattern="timeline"]')).toBeInTheDocument();
    expect(container.querySelector('[data-ask-timeline-selected="deck"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous event' }));
    expect(container.querySelector('[data-ask-timeline-selected="claim"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aug 2020: Roof replaced (Improvement)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insurance' }));
    expect(container.querySelector('[data-ask-timeline-point="claim"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-ask-timeline-selected="deck"]')).toBeInTheDocument();
    unmount();
    const undated = render(<Harness block={{ ...timeline, items: [...timeline.items, { id: 'x', label: 'Sometime', date: 'unknown' }] }} />);
    expect(undated.container.querySelector('[data-display-pattern="timeline"]')).not.toBeInTheDocument();
    expect(screen.getByText('Sometime')).toBeInTheDocument();
  });

  test('summary shows its answer chips; comparison options show every declared badge with its basis', () => {
    render(<Harness block={{ type: 'SUMMARY', id: 's', title: 'Two are overdue', body: 'The filter and alarm test.', tone: 'DEFAULT', actions: [], chips: [{ label: '2 overdue', tone: 'CRITICAL' }, { label: '~$495 planned', tone: 'DEFAULT' }] }} />);
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('2 overdue~$495 planned');
    render(<Harness block={{ type: 'COMPARISON', id: 'q', title: 'Quotes', actions: [], options: [
      { id: 'a', label: 'Harbor', attributes: [], actions: [], badges: [{ label: 'Soonest start', basis: 'Starts Oct 2.', policyCode: 'EARLIEST_START' }, { label: 'Longest warranty', basis: '10-year parts.', policyCode: 'LONGEST_WARRANTY' }] },
      { id: 'b', label: 'Northside', attributes: [], actions: [], badge: { label: 'Lowest price', basis: 'Smallest total.', policyCode: 'LOWEST_TOTAL' } },
    ] }} />);
    expect(screen.getByText('Soonest start')).toBeInTheDocument();
    expect(screen.getByText('Lowest price')).toBeInTheDocument();
    expect(screen.getByText('Why these labels')).toBeInTheDocument();
    expect(screen.getByText('10-year parts.')).toBeInTheDocument();
  });
});
