import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import type { AskExecutionResponse, AskGroupedListItem, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { InspectionFinding } from '@/types';

jest.mock('@/lib/api/client', () => ({ api: { listInspectionFindings: jest.fn() } }));
const mockedList = api.listInspectionFindings as jest.MockedFunction<typeof api.listInspectionFindings>;

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-015, FRD v1.75): inspection findings as a card deck. Accept as work and
// Dismiss are only recorded on the card; at the end they are sent together for one confirmation. Mark resolved keeps
// its own confirmation.

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const action = (id: string, label: string, message: string) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INSPECTION_FINDING_UPDATE' });
const ACCEPT = action('finding-accept', 'Accept as work', 'Accept this inspection finding as work.');
const DISMISS = action('finding-dismiss', 'Dismiss', 'Dismiss this inspection finding.');
const RESOLVE = action('finding-resolve', 'Mark resolved', 'Mark this inspection finding resolved.');
const BATCH = { operationId: 'INSPECTION_FINDING_UPDATE', entityType: 'INSPECTION_FINDING', actionIds: ['finding-accept', 'finding-dismiss'], message: 'Review my inspection finding decisions.' };
const item = (id: string, extra: Partial<AskGroupedListItem> = {}): AskGroupedListItem => ({
  id, title: `ELECTRICAL: Finding ${id}`, meta: [], status: 'OPEN', entityType: 'INSPECTION_FINDING', parentId: 'report-1',
  href: `/dashboard/properties/home/inspection-hub/report-1?findingId=${id}`, actions: [ACCEPT, DISMISS, RESOLVE], ...extra,
});
const findingsBlock = (items: AskGroupedListItem[] = [
  item('breaker', { tone: 'CRITICAL', badgeLabel: 'Safety', timingLabel: 'Inspected Sep 12, 2026', amountLabel: 'Est. $150–$300' }),
  item('toilet', { title: 'PLUMBING: Finding toilet' }),
  item('crack', { title: 'STRUCTURE: Finding crack' }),
], presentation: GroupedList['presentation'] = { pattern: 'DECK', swipeRightActionId: 'finding-accept', swipeLeftActionId: 'finding-dismiss', batch: BATCH }): GroupedList => ({
  type: 'GROUPED_LIST', id: 'inspection-findings', title: 'Open inspection findings', filters: [], presentation,
  actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href: '/dashboard/properties/home/inspection-hub/open-items', style: 'SECONDARY' }],
  sections: [{ id: 'open', title: 'Needs review', count: items.length, items }],
});

function Harness({ block, onItemAction = jest.fn(), onBatchItemAction }: { block: GroupedList; onItemAction?: jest.Mock; onBatchItemAction?: jest.Mock }) {
  const response = useMemo(() => ({
    sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'result', revision: 1 }, blocks: [block],
  } as AskExecutionResponse), [block]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} onBatchItemAction={onBatchItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

beforeEach(() => { jest.clearAllMocks(); window.sessionStorage.clear(); });

test('the deck records Accept and Dismiss without sending anything, and sends them together at the end', async () => {
  const onItemAction = jest.fn();
  const onBatchItemAction = jest.fn();
  const { container } = render(<Harness block={findingsBlock()} onItemAction={onItemAction} onBatchItemAction={onBatchItemAction} />);
  await waitFor(() => expect(container.querySelector('[data-display-pattern="deck"]')).toBeInTheDocument());
  const card = screen.getByRole('group', { name: /Finding breaker, 1 of 3/ });
  expect(card).toHaveTextContent('Safety');
  expect(card).toHaveTextContent('Inspected Sep 12, 2026 · Est. $150–$300');
  expect(screen.getByText(/Nothing is saved until you review and confirm at the end/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Accept as work' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
  expect(onItemAction).not.toHaveBeenCalled();
  expect(onBatchItemAction).not.toHaveBeenCalled();
  expect(container.querySelector('[data-ask-deck-review="Accept as work"]')).toHaveTextContent('ELECTRICAL: Finding breaker');
  expect(container.querySelector('[data-ask-deck-review="Dismiss"]')).toHaveTextContent('PLUMBING: Finding toilet');
  expect(screen.getByText('1 skipped for now.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review and confirm 2 changes' }));
  expect(onBatchItemAction).toHaveBeenCalledWith({
    operationId: 'INSPECTION_FINDING_UPDATE', entityType: 'INSPECTION_FINDING', message: 'Review my inspection finding decisions.',
    decisions: [{ entityId: 'breaker', actionId: 'finding-accept' }, { entityId: 'toilet', actionId: 'finding-dismiss' }],
  });
  expect(screen.getByRole('status')).toHaveTextContent('Sent for your confirmation below. Nothing changes until you confirm.');
  expect(screen.getByRole('button', { name: 'Review and confirm 2 changes' })).toBeDisabled();
});

test('Mark resolved is sent on its own; arrow keys record the swipe decisions; Back lets a choice be changed', async () => {
  const onItemAction = jest.fn();
  const onBatchItemAction = jest.fn();
  render(<Harness block={findingsBlock()} onItemAction={onItemAction} onBatchItemAction={onBatchItemAction} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark resolved …' }));
  expect(onItemAction).toHaveBeenCalledWith('INSPECTION_FINDING', 'breaker', 'Mark this inspection finding resolved.', 'INSPECTION_FINDING_UPDATE', 'MUTATE_RECORD');
  fireEvent.keyDown(screen.getByRole('group', { name: /Finding toilet/ }), { key: 'ArrowRight' });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Your choice: Accept as work (not sent yet)')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('group', { name: /Finding toilet/ }), { key: 'ArrowLeft' });
  fireEvent.keyDown(screen.getByRole('group', { name: /Finding crack/ }), { key: 'ArrowLeft' });
  expect(onItemAction).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/1 sent on its own for confirmation: ELECTRICAL: Finding breaker/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review and confirm 2 changes' }));
  expect(onBatchItemAction.mock.calls[0][0].decisions).toEqual([{ entityId: 'toilet', actionId: 'finding-dismiss' }, { entityId: 'crack', actionId: 'finding-dismiss' }]);
});

test('with nothing chosen there is nothing to confirm', async () => {
  const onBatchItemAction = jest.fn();
  render(<Harness block={findingsBlock([item('breaker')])} onBatchItemAction={onBatchItemAction} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
  expect(screen.getByRole('button', { name: 'Review and confirm 0 changes' })).toBeDisabled();
  expect(screen.getByText('No changes to review.')).toBeInTheDocument();
});

test('Details opens the live finding in the sheet, read-only, so decisions stay in the deck', async () => {
  mockedList.mockResolvedValueOnce([{ id: 'breaker', reportId: 'report-1', propertyId: 'home', homeSystem: 'ELECTRICAL', location: 'Panel', severity: 'SAFETY', conditionRating: 'POOR',
    inspectorDescription: 'Two wires share one breaker terminal.', inspectorRecommendation: 'Have an electrician separate them.', aiInterpretation: '', status: 'OPEN', workDisposition: 'PENDING_REVIEW',
    estimatedCostCentsLow: 15000, estimatedCostCentsHigh: 30000 } as unknown as InspectionFinding]);
  render(<Harness block={findingsBlock()} onBatchItemAction={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
  const sheet = await screen.findByRole('dialog', { name: 'Finding detail: ELECTRICAL: Finding breaker' });
  expect(await within(sheet).findByText('Two wires share one breaker terminal.')).toBeInTheDocument();
  expect(within(sheet).queryByRole('button', { name: 'Accept as work' })).not.toBeInTheDocument();
  expect(mockedList).toHaveBeenCalledWith('home', 'report-1');
});

test('a refreshed result (after confirming) starts a fresh deck over what is still open', async () => {
  const { rerender } = render(<Harness block={findingsBlock()} onBatchItemAction={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Accept as work' }));
  expect(screen.getByText('2 of 3')).toBeInTheDocument();
  rerender(<Harness block={findingsBlock([item('crack', { title: 'STRUCTURE: Finding crack' })])} onBatchItemAction={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('1 of 1')).toBeInTheDocument());
});

test('the list is used where the batch sender is unavailable, for a viewer, and when the homeowner chooses it', async () => {
  const noSender = render(<Harness block={findingsBlock()} />);
  expect(noSender.container.querySelector('[data-display-pattern="deck"]')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ELECTRICAL: Finding breaker' })).toBeInTheDocument();
  noSender.unmount();
  const viewer = render(<Harness block={findingsBlock([item('breaker', { actions: [] })], undefined)} onBatchItemAction={jest.fn()} />);
  expect(viewer.container.querySelector('[data-display-pattern="deck"]')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument();
  viewer.unmount();
  const chooser = render(<Harness block={findingsBlock()} onBatchItemAction={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'List' }));
  expect(chooser.container.querySelector('[data-display-pattern="deck"]')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'One at a time' }));
  expect(chooser.container.querySelector('[data-display-pattern="deck"]')).toBeInTheDocument();
});
