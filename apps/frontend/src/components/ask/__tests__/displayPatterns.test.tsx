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

  test('a choice grid requires one action per item, no links, and a bounded item count', () => {
    const choice = (entries: AskGroupedListItem[]) => list({ presentation: { pattern: 'CHOICE_GRID' } }, [{ id: 'choices', title: 'Choices', count: entries.length, items: entries }]);
    expect(resolveGroupedListPattern(choice([item('one', { actions: [action('start', 'Start')] })]), 'AUTO')).toMatchObject({ pattern: 'CHOICE_GRID', offersChoice: false });
    expect(resolveGroupedListPattern(choice([item('one')]), 'AUTO')).toMatchObject({ pattern: null, reason: 'CHOICE_GRID_INCOMPATIBLE' });
    expect(resolveGroupedListPattern(choice([item('one', { href: '/somewhere', actions: [action('start', 'Start')] })]), 'AUTO')).toMatchObject({ pattern: null, reason: 'CHOICE_GRID_INCOMPATIBLE' });
    const many = Array.from({ length: 13 }, (_, index) => item(String(index), { actions: [action('start', 'Start')] }));
    expect(resolveGroupedListPattern(choice(many), 'AUTO')).toMatchObject({ pattern: null, reason: 'CHOICE_GRID_INCOMPATIBLE' });
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

describe('choice grid', () => {
  const choices = list({
    title: 'What would you like to review?', description: 'Choose one. Nothing is saved yet.', presentation: { pattern: 'CHOICE_GRID' },
  }, [{ id: 'reviews', title: 'Reviews you can start', count: 4, items: [
    item('quote', { title: 'Contractor quote review', description: 'Check a quote before accepting it.', actions: [action('start', 'Start', 'PRIMARY')] }),
    item('premium', { title: 'Insurance premium increase', description: 'Review a renewal increase.', actions: [action('start', 'Start', 'PRIMARY')] }),
    item('claim', { title: 'Insurance claim settlement', description: 'Compare a settlement with your estimate.', actions: [action('start', 'Start', 'PRIMARY')] }),
    item('urgency', { title: 'Contractor urgency pressure', description: 'Test a do-it-now recommendation.', actions: [action('start', 'Start', 'PRIMARY')] }),
  ] }]);

  test('uses responsive compact tiles and makes each whole option the single action', async () => {
    const onItemAction = jest.fn();
    const { container } = render(<Harness block={choices} onItemAction={onItemAction} />);
    await waitFor(() => expect(container.querySelector('[data-display-pattern="choice_grid"]')).toBeInTheDocument());
    const listElement = screen.getByRole('list');
    expect(listElement).toHaveClass('grid-cols-1', 'sm:grid-cols-2');
    expect(screen.getByText('4 options')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List' })).toBeNull();
    const quote = screen.getByRole('button', { name: /Contractor quote review.*Check a quote.*Start/ });
    expect(quote).toHaveClass('min-h-[4.5rem]');
    fireEvent.click(quote);
    expect(onItemAction).toHaveBeenCalledWith('THING', 'quote', 'Start message', 'INSPECTION_FINDINGS', 'CONVERSATION_CONTINUE');
  });

  test('disables the whole option when item actions are disabled', () => {
    render(<GroupedListBlock block={choices} executionId="e" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);
    expect(screen.getByRole('button', { name: /Contractor quote review/ })).toBeDisabled();
  });
});

describe('budget breakdown', () => {
  const budget = list({
    title: 'Where the upkeep budget goes', description: 'Estimated annual upkeep by category.', presentation: { pattern: 'BUDGET_BREAKDOWN' },
  }, [
    { id: 'categories', title: 'By category', count: 2, items: [
      item('hvac', { title: 'HVAC', amountLabel: '$586 a year', proportionPercent: 25, status: '25%', meta: ['Seasonal maintenance', 'Filter replacements'] }),
      item('plumbing', { title: 'Plumbing', amountLabel: '$352 a year', proportionPercent: 15, status: '15%', meta: ['Drain cleaning', 'Leak repairs'] }),
    ] },
    { id: 'months', title: 'By month', count: 2, items: [
      item('january', { title: 'January', description: '$180: routine $80, preventive $70, unexpected $30', status: '$180' }),
      item('february', { title: 'February', description: '$140: routine $60, preventive $50, unexpected $30', status: '$140' }),
    ] },
  ]);

  test('shows compact proportional categories and progressively discloses monthly details', () => {
    const { container } = render(<Harness block={budget} />);
    expect(container.querySelector('[data-display-pattern="budget_breakdown"]')).toBeInTheDocument();
    expect(container.querySelector('[data-budget-breakdown] > ul')?.querySelectorAll('[data-budget-row]')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'HVAC: 25% of the upkeep budget' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('$586 a year')).toBeVisible();
    expect(screen.getByText('Seasonal maintenance · Filter replacements')).toBeVisible();
    expect(screen.getByText('Show by month details')).toBeVisible();
    expect(screen.getByText('Show by month details').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Show by month details'));
    expect(screen.getByText('January')).toBeVisible();
    expect(container.querySelectorAll('[data-budget-row]')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument();
  });

  test('the pattern resolver does not offer generic layout choices', () => {
    expect(resolveGroupedListPattern(budget, 'AUTO')).toEqual({ pattern: 'BUDGET_BREAKDOWN', offersChoice: false, reason: 'DECLARED' });
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

  test('a dense shelves fallback shows one view control and compact rows', async () => {
    const dense = { ...block, listDensity: 'DENSE' as const };
    const { container } = render(<Harness block={dense} />);
    fireEvent.click(await screen.findByRole('button', { name: 'List' }));
    expect(await screen.findByRole('button', { name: 'Show as shelves' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cards' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-list-density="dense"]')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Change choice' }));
    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeEnabled();
  });

  test('revisiting a sent choice cannot dispatch it a second time', async () => {
    const onItemAction = jest.fn();
    render(<Harness block={block} onItemAction={onItemAction} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Already sent: Add to plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Change choice' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('group', { name: /Finding breaker/ }), { key: 'ArrowRight' });
    expect(onItemAction).toHaveBeenCalledTimes(1);
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

  test('keeps every declared action reachable when a card has more than three', async () => {
    const onItemAction = jest.fn();
    const actions = [
      action('accept', 'Add to plan', 'PRIMARY'),
      action('dismiss', 'Not relevant'),
      action('monitor', 'Monitor'),
      action('assign', 'Assign'),
    ];
    const manyActions = list({ presentation: { pattern: 'DECK', swipeRightActionId: 'accept', swipeLeftActionId: 'dismiss' } }, [
      { id: 'open', title: 'Needs review', count: 1, items: [item('breaker', { title: 'Finding breaker', actions })] },
    ]);
    render(<Harness block={manyActions} onItemAction={onItemAction} />);
    expect(await screen.findByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not relevant' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('More actions'));
    expect(screen.getByRole('button', { name: 'Monitor' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(onItemAction).toHaveBeenCalledWith('THING', 'breaker', 'Assign message', 'INSPECTION_FINDINGS', 'CONVERSATION_CONTINUE');
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
