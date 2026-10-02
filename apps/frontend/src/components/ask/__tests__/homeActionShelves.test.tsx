import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { CalmAnswerContext, CalmChromeContext } from '../blocks/calmContext';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014, FRD v1.82): Home Actions as read-only shelves.

const block: AskPresentationBlock = {
  type: 'GROUPED_LIST', id: 'home-actions-list', title: 'Prioritized actions', filters: [], actions: [],
  presentation: { pattern: 'SHELVES' },
  sections: [
    { id: 'now', title: 'Now', count: 1, items: [{
      id: 'a1', title: 'Replace the HVAC filter', description: 'A clogged filter strains the system.', meta: ['due Oct 3, 2026', 'high confidence'],
      status: 'OPEN', href: '/dashboard/maintenance?propertyId=home', tone: 'CAUTION', timingLabel: 'Due Oct 3, 2026',
    }] },
    { id: 'plan', title: 'Plan', count: 1, items: [{ id: 'a2', title: 'Budget for a new roof', meta: [], status: 'OPEN', timingLabel: 'Within five years' }] },
  ],
};

function Harness({ onItemAction }: { onItemAction: jest.Mock }) {
  const response = useMemo(() => ({
    sessionId: 's', executionId: 'e', property: { id: 'home', label: 'Home' }, viewState: { resultId: 'r', revision: 1 }, blocks: [block],
  } as AskExecutionResponse), []);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={block} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

describe('Home Action shelves', () => {
  test('each priority is a shelf whose cards show the timing, and a card opens a read-only detail with its page link', async () => {
    const onItemAction = jest.fn();
    const { container } = render(<Harness onItemAction={onItemAction} />);
    await waitFor(() => expect(container.querySelector('[data-display-pattern="shelves"]')).toBeInTheDocument());
    expect(screen.getByRole('list', { name: 'Now, 1 item' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Plan, 1 item' })).toBeInTheDocument();
    const card = screen.getByRole('button', { name: /Replace the HVAC filter/ });
    expect(card).toHaveTextContent('Due Oct 3, 2026');
    fireEvent.click(card);
    const sheet = await screen.findByRole('dialog', { name: 'Replace the HVAC filter' });
    expect(within(sheet).getByText('A clogged filter strains the system.')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open record' })).toHaveAttribute('href', expect.stringContaining('/dashboard/maintenance'));
    expect(within(sheet).queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Close details']);
    expect(onItemAction).not.toHaveBeenCalled();
  });

  test('the calm ranked view stays in Ask instead of navigating to the traditional page', () => {
    const onItemAction = jest.fn();
    const priority: AskPresentationBlock = {
      type: 'PRIORITY_LIST', id: 'home-actions-priority-list', title: 'What matters now', propertyId: 'home',
      rankingPolicyVersion: 'priority-list-policy-v1', generatedAt: '2026-09-27T12:00:00.000Z', sourceFreshnessAt: '2026-09-27T12:00:00.000Z', truncated: false,
      items: [{
        homeActionId: 'a1', title: 'Replace the HVAC filter', consumerPriority: 'DO_NOW', comparativeReasonCodes: ['HIGHER_URGENCY'], confidenceLabel: 'HIGH', deadlineAt: null, dependencyRefs: [],
        cta: { id: 'a1', label: 'Open Maintenance', href: '/dashboard/maintenance?propertyId=home', style: 'PRIMARY' },
        inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_ACTIONS', message: 'What should I do next for “Replace the HVAC filter”?' },
        watchState: null, suppressed: false, completed: false, unavailable: false, stale: false,
      }],
    };
    render(<CalmChromeContext.Provider value><CalmAnswerContext.Provider value>
      <BlockView block={priority} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </CalmAnswerContext.Provider></CalmChromeContext.Provider>);
    expect(screen.queryByRole('link', { name: 'Open Maintenance' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review in Ask' }));
    expect(onItemAction).toHaveBeenCalledWith('HOME_ACTION', 'a1', 'What should I do next for “Replace the HVAC filter”?', 'HOME_ACTIONS', 'CONVERSATION_CONTINUE', undefined, 'a1');
  });
});
