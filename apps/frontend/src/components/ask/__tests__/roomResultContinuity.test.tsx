import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { RoomResultList } from '../RoomResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { getRoomInsights, type RoomInsightsDTO } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

jest.mock('@/app/(dashboard)/dashboard/inventory/inventoryApi', () => ({ getRoomInsights: jest.fn() }));
const mockedGetRoomInsights = getRoomInsights as jest.MockedFunction<typeof getRoomInsights>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'property-rooms', title: 'Rooms', filters: [],
  description: 'Select a room to inspect its current canonical details without leaving Ask Cozy.',
  sections: [{ id: 'rooms', title: 'Recorded rooms', count: 2, items: [
    { id: 'room-0', title: 'Kitchen', entityType: 'INVENTORY_ROOM', meta: ['Kitchen', 'Updated Sep 18, 2026'], description: null, status: null, href: null },
    { id: 'room-1', title: 'Living room', entityType: 'INVENTORY_ROOM', meta: ['Living room', 'Updated Sep 17, 2026'], description: null, status: null, href: null },
  ] }],
  actions: [{ id: 'open-rooms', label: 'Open Rooms', href: '/dashboard/properties/home/rooms', style: 'SECONDARY' }],
};

function execution(revision = 1): AskExecutionResponse {
  return { executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-18T00:00:0${revision}.000Z`,
    viewState: { resultId: 'property-summary', revision, domainScopePhrase: 'property summary', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}

function List({ response, onAccessLost = () => {} }: { response: AskExecutionResponse; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><RoomResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onAccessLost={onAccessLost} link={(href, content) => <a href={href}>{content}</a>} /></ResultViewContext.Provider>;
}

function canonicalRoom(overrides: Partial<RoomInsightsDTO> = {}): RoomInsightsDTO {
  return {
    room: { id: 'room-0', name: 'Kitchen', type: 'KITCHEN', profile: null },
    stats: { itemCount: 8, replacementTotalCents: 1250000, coverageGapsCount: 1, appliancesCount: 4, docsLinkedCount: 3 },
    healthScore: { score: 82, band: 'GOOD', label: 'Good', evaluationState: 'SCORED', badges: [], improvements: [] },
    kitchen: { missingAppliances: [], quickWins: [] },
    ...overrides,
  };
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('Property Summary room titles dispatch through the registry and open canonical room detail inline', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetRoomInsights.mockResolvedValueOnce(canonicalRoom());

  render(<BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'Kitchen' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open Rooms/ })).toHaveAttribute('href', '/dashboard/properties/home/rooms');
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));

  await waitFor(() => expect(screen.getByText('$12,500')).toBeInTheDocument());
  expect(screen.getByText('Good · 82/100')).toBeInTheDocument();
  expect(mockedGetRoomInsights).toHaveBeenCalledWith('home', 'room-0');
  expect(window.location.pathname).toBe('/dashboard/ask');
});

test('room selection persists in result view state', async () => {
  mockedGetRoomInsights.mockResolvedValueOnce(canonicalRoom());
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  await waitFor(() => expect(screen.getByText('Good · 82/100')).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'property-summary')).detailTaskId).toBe('room-0');
});

test('deleted room detail is distinct from an access-loss failure', async () => {
  mockedGetRoomInsights.mockRejectedValueOnce({ status: 404, payload: { success: false, error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } } });
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Room no longer exists'));
});

test('property access denial redacts the whole result instead of exposing a room state', async () => {
  const onAccessLost = jest.fn();
  mockedGetRoomInsights.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a room leaving the refreshed result clears selection without choosing a substitute', () => {
  mockedGetRoomInsights.mockResolvedValueOnce(canonicalRoom());
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], count: 1, items: block.sections[0].items.filter((item) => item.id !== 'room-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'property-summary')).detailTaskId).toBeNull();
});

test('room detail shows the declared rename action with exact identity, and none when the server declares none (viewer)', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetRoomInsights.mockResolvedValue(canonicalRoom());
  const withAction: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], actions: [{ id: 'rename-room', label: 'Rename room', message: 'Rename this room.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'ROOM_RENAME' }] },
    ...block.sections[0].items.slice(1),
  ] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [withAction] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><RoomResultList block={withAction} propertyId="home" onAction={onAction} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  const first = render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  fireEvent.click(await screen.findByRole('button', { name: /Rename room/ }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ROOM', 'room-0', 'Rename this room.', 'ROOM_RENAME', 'MUTATE_RECORD');
  first.unmount();
  window.sessionStorage.clear();

  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
  await waitFor(() => expect(screen.getByText('$12,500')).toBeInTheDocument());
  expect(screen.queryByRole('group', { name: /Corrections for/ })).not.toBeInTheDocument();
});
