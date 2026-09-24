import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { floorLabel, roomFloors } from '@/features/ask/displayPatterns';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { getRoomInsights, type RoomInsightsDTO } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-019 (FRD v1.79): the home record's rooms as a room map. Rooms keep
// their own component in both layouts, so a tile opens the same live room detail (in the drawer or bottom sheet)
// with its corrections.

jest.mock('@/app/(dashboard)/dashboard/inventory/inventoryApi', () => ({ getRoomInsights: jest.fn() }));
const mockedGetRoomInsights = getRoomInsights as jest.MockedFunction<typeof getRoomInsights>;

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const rename = { id: 'rename-room', label: 'Rename room', message: 'Rename this room.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'ROOM_RENAME' };
const room = (id: string, title: string, floorLevel: number | null, countLabel: string, badgeLabel?: string) => ({
  id, title, entityType: 'INVENTORY_ROOM', description: null, status: null, href: null, floorLevel, countLabel,
  ...(badgeLabel ? { badgeLabel, tone: 'CAUTION' as const } : {}), meta: [title, countLabel, ...(badgeLabel ? [badgeLabel] : []), 'Updated Sep 1, 2026'], actions: [rename],
});
const block: Block = {
  type: 'GROUPED_LIST', id: 'property-rooms', title: 'Rooms', filters: [], presentation: { pattern: 'ROOM_MAP' },
  description: 'Select a room to inspect its current canonical details without leaving Ask Cozy.',
  sections: [{ id: 'rooms', title: 'Recorded rooms', count: 4, items: [
    room('kitchen', 'Kitchen', 0, '7 items', '2 open tasks'),
    room('den', 'Den', 0, '3 items'),
    room('primary', 'Primary bedroom', 1, '5 items'),
    room('garage', 'Garage', null, '1 item', '1 open task'),
  ] }],
  actions: [{ id: 'open-rooms', label: 'Open Rooms', href: '/dashboard/properties/home/rooms', style: 'SECONDARY' }],
};

function Harness({ onItemAction = jest.fn() }: { onItemAction?: jest.Mock }) {
  const response = useMemo(() => ({ sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: '2026-09-24T12:00:00.000Z',
    viewState: { resultId: 'property-summary', revision: 1, domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null } } as AskExecutionResponse), []);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

const canonicalRoom = (): RoomInsightsDTO => ({
  room: { id: 'kitchen', name: 'Kitchen', type: 'KITCHEN', profile: null },
  stats: { itemCount: 7, replacementTotalCents: 1250000, coverageGapsCount: 1, appliancesCount: 4, docsLinkedCount: 3 },
  healthScore: { score: 82, band: 'GOOD', label: 'Good', evaluationState: 'SCORED', badges: [], improvements: [] },
  kitchen: { missingAppliances: [], quickWins: [] },
} as RoomInsightsDTO);

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('floor labels follow Ask\'s floor convention: ground floor is 0, below zero is below ground', () => {
  expect([-2, -1, 0, 1, 3].map(floorLabel)).toEqual(['Basement level 2', 'Basement', 'Ground floor', 'Floor 1', 'Floor 3']);
  expect(roomFloors(block.sections[0].items).map((floor) => [floor.label, floor.items.map((item) => item.id)])).toEqual([
    ['Ground floor', ['kitchen', 'den']], ['Floor 1', ['primary']], ['Other', ['garage']],
  ]);
});

test('the room map shows tiles by floor with item counts and open-task badges', async () => {
  render(<Harness />);
  const ground = await screen.findByRole('list', { name: 'Ground floor, 2 rooms' });
  const kitchen = within(ground).getByRole('button', { name: /Kitchen/ });
  expect(kitchen).toHaveTextContent('7 items');
  expect(kitchen).toHaveTextContent('2 open tasks');
  fireEvent.click(screen.getByRole('button', { name: /^Other/ }));
  expect(within(screen.getByRole('list', { name: 'Other, 1 room' })).getByRole('button', { name: /Garage/ })).toHaveTextContent('1 open task');
});

test('a tile opens the live room detail in the sheet, with its corrections', async () => {
  mockedGetRoomInsights.mockResolvedValueOnce(canonicalRoom());
  const onItemAction = jest.fn();
  render(<Harness onItemAction={onItemAction} />);
  fireEvent.click(await screen.findByRole('button', { name: /Kitchen/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Room detail: Kitchen' });
  await waitFor(() => expect(within(sheet).getByText('Good · 82/100')).toBeInTheDocument());
  expect(mockedGetRoomInsights).toHaveBeenCalledWith('home', 'kitchen');
  fireEvent.click(within(sheet).getByRole('button', { name: /Rename room/ }));
  expect(onItemAction).toHaveBeenCalledWith('INVENTORY_ROOM', 'kitchen', 'Rename this room.', 'ROOM_RENAME', 'MUTATE_RECORD');
});

test('the Room map / List switch keeps the rooms component: the list shows the counts and opens the same detail inline', async () => {
  // Switching back to the map keeps the open room and re-reads it live, so every read gets an answer.
  mockedGetRoomInsights.mockResolvedValue(canonicalRoom());
  const { container } = render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'List' }));
  expect(container.querySelector('[data-display-pattern="room_map"]')).toBeNull();
  expect(screen.getByText('Kitchen · 7 items · 2 open tasks · Updated Sep 1, 2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  await waitFor(() => expect(screen.getByText('Good · 82/100')).toBeInTheDocument());
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Room map' }));
  expect(container.querySelector('[data-display-pattern="room_map"]')).toBeInTheDocument();
  expect(await screen.findByRole('dialog', { name: 'Room detail: Kitchen' })).toBeInTheDocument();
});
