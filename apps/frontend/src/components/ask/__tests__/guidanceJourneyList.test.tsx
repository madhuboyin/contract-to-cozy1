import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { GuidanceJourneyListView } from '../GuidanceJourneyList';
import { EMPTY_RESULT_VIEW, type ResultView } from '@/features/ask/resultViewState';
import { ResultViewContext, type ResultViewControls } from '@/features/ask/useResultView';

type Props = Parameters<typeof GuidanceJourneyListView>[0]['props'];
const block = { type: 'GROUPED_LIST', id: 'guidance-journeys-items', title: 'Guided journeys', actions: [], filters: [], sections: [{ id: 's', title: 'Act now', count: 1, items: [{ id: 'j1', title: 'Water heater', meta: [], entityType: 'GUIDANCE_JOURNEY', actions: [{ id: 'continue-guided-journey', label: 'Open journey', message: 'Continue this guided journey.', interactionType: 'CONVERSATION_CONTINUE', operationId: 'GUIDANCE_JOURNEY_CONTINUE' }] }] }] };
const workspaceBlock = { type: 'TASK_GUIDE', id: 'guidance-journey-workspace', title: 'Water heater: Aging System', summary: 'Next: Compare.', eyebrow: ['Guided journey'], icon: 'TASK', chips: [], main: { title: 'Current step', body: 'Do the thing.', facts: [] }, history: [], notes: [], actions: [] };
const executionOf = (blocks: unknown[]) => ({ executionId: 'e2', blocks }) as never;

function Harness({ onItemAction, initial = null, rerenderKey = 0, freshHandler = false }: { onItemAction: jest.Mock; initial?: string | null; rerenderKey?: number; freshHandler?: boolean }) {
  const [view, setView] = useState<ResultView>({ ...EMPTY_RESULT_VIEW, detailTarget: initial ? { blockId: 'guidance-journeys-items', entityId: initial } : null });
  const controls: ResultViewControls = {
    view, change: (update) => setView((previous) => update(previous)),
    detailIdFor: (id) => (view.detailTarget?.blockId === id ? view.detailTarget.entityId : null),
    openDetail: (blockId, entityId) => setView((previous) => ({ ...previous, detailTarget: { blockId, entityId } })),
    closeDetail: () => setView((previous) => ({ ...previous, detailTarget: null })),
  };
  const props = { block: rerenderKey ? { ...block } : block, executionId: 'e1', itemActionsDisabled: false, onItemAction: freshHandler ? ((...args: unknown[]) => onItemAction(...args)) : onItemAction, onFilterClick: jest.fn(), onCollectionPage: jest.fn(), onAccessLost: jest.fn() } as unknown as Props;
  return <ResultViewContext.Provider value={controls}><GuidanceJourneyListView props={props} renderList={(open) => (
    <ul>{block.sections[0].items.map((item) => <li key={item.id}>{item.title}<button type="button" onClick={() => open(item.entityType, item.id, item.actions[0].message, item.actions[0].operationId, 'CONVERSATION_CONTINUE')}>Open journey</button></li>)}</ul>
  )} /></ResultViewContext.Provider>;
}

describe('Guidance journey list opens in place', () => {
  it('opens the journey in the same card without a conversational turn, and Back returns to the list', async () => {
    const onItemAction = jest.fn().mockResolvedValue(executionOf([workspaceBlock, { type: 'BOUNDARY', id: 'guidance-journey-boundary', title: 'Guidance', body: 'Not a professional assessment.', severity: 'INFO', suggestions: [] }]));
    render(<Harness onItemAction={onItemAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open journey' }));
    expect(await screen.findByText('Water heater: Aging System')).toBeInTheDocument();
    expect(onItemAction).toHaveBeenCalledTimes(1);
    expect(onItemAction).toHaveBeenCalledWith('GUIDANCE_JOURNEY', 'j1', 'Continue this guided journey.', 'GUIDANCE_JOURNEY_CONTINUE', 'CONVERSATION_CONTINUE', undefined, undefined, 'WORKSPACE');
    expect(screen.getByText('Not a professional assessment.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All journeys/ }));
    expect(screen.getByRole('button', { name: 'Open journey' })).toBeInTheDocument();
    expect(screen.queryByText('Water heater: Aging System')).toBeNull();
  });

  it('on a reload that restored a journey, re-reads it from the server and shows it', async () => {
    const onItemAction = jest.fn().mockResolvedValue(executionOf([workspaceBlock]));
    render(<Harness onItemAction={onItemAction} initial="j1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening this journey');
    expect(await screen.findByText('Water heater: Aging System')).toBeInTheDocument();
    expect(onItemAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['dismissed', [{ type: 'SUMMARY', id: 'guidance-journey-summary', title: 'This guided journey was dismissed', body: 'x', tone: 'DEFAULT', actions: [] }], /This guided journey was dismissed\. Your journeys are listed below\./],
    ['removed', [{ type: 'EMPTY_STATE', id: 'guidance-journey-unavailable', title: 'This guided journey is no longer available', body: 'x', actions: [] }], /no longer available\. Your journeys are listed below\./],
  ])('a restored journey that is %s falls back to the list with a short explanation', async (_name, blocks, message) => {
    const onItemAction = jest.fn().mockResolvedValue(executionOf(blocks));
    render(<Harness onItemAction={onItemAction} initial="j1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open journey' })).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByText(/Opening this journey/)).toBeNull();
  });

  it('a failed read falls back to the list with a plain message and never shows a stale journey', async () => {
    const onItemAction = jest.fn().mockRejectedValue(new Error('network'));
    render(<Harness onItemAction={onItemAction} initial="j1" />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('could not be opened right now'));
    expect(screen.getByRole('button', { name: 'Open journey' })).toBeInTheDocument();
  });

  it('does not read again just because the parent re-rendered with a new handler', async () => {
    const onItemAction = jest.fn().mockResolvedValue(executionOf([workspaceBlock]));
    const { rerender } = render(<Harness onItemAction={onItemAction} initial="j1" freshHandler />);
    await screen.findByText('Water heater: Aging System');
    await act(async () => { rerender(<Harness onItemAction={onItemAction} initial="j1" freshHandler />); });
    expect(onItemAction).toHaveBeenCalledTimes(1);
  });

  it('reads the open journey again when the list is refreshed (a step was recorded)', async () => {
    const onItemAction = jest.fn().mockResolvedValue(executionOf([workspaceBlock]));
    const { rerender } = render(<Harness onItemAction={onItemAction} initial="j1" />);
    await screen.findByText('Water heater: Aging System');
    await act(async () => { rerender(<Harness onItemAction={onItemAction} initial="j1" rerenderKey={1} />); });
    await waitFor(() => expect(onItemAction).toHaveBeenCalledTimes(2));
  });
});
