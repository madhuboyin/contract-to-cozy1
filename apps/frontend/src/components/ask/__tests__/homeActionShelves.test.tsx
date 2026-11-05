import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { CalmAnswerContext, CalmChromeContext } from '../blocks/calmContext';
import { api } from '@/lib/api/client';

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
    expect(card).toHaveTextContent('OPEN');
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
        homeActionId: 'a1', title: 'Fall checklist: Chimney cleaning and inspection', consumerPriority: 'DO_NOW', comparativeReasonCodes: ['HIGHER_URGENCY', 'HIGHER_CONFIDENCE'], whyThisAppeared: 'This is a fall checklist task. Can help prevent chimney fires and carbon monoxide hazards.', confidenceLabel: 'LOW', deadlineAt: '2026-10-31T00:00:00.000Z', dependencyRefs: [],
        cta: { id: 'a1', label: 'Open Maintenance', href: '/dashboard/maintenance?propertyId=home', style: 'PRIMARY' },
        inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_ACTIONS', message: 'What should I do next for “Replace the HVAC filter”?', label: 'Review checklist' },
        presentation: { kind: 'SEASONAL', variant: 'SEASONAL_CHECKLIST', eyebrow: 'Fall checklist', summary: 'This is a critical fall task.', whyItMatters: 'Can help prevent chimney fires and carbon monoxide hazards.', recommendedAction: 'Schedule chimney cleaning and inspection.', expectedOutcome: 'A safer chimney before heating season.', detailLabel: 'Review checklist', timing: { windowStart: null, windowEnd: null, rationale: 'Complete before heating season.' }, keyFacts: [{ label: 'Season', value: 'Fall' }, { label: 'Progress', value: '3 of 8 complete' }], source: { label: 'Seasonal checklist', observedAt: '2026-09-27T12:00:00.000Z', freshness: 'CURRENT' }, controls: [] },
        watchState: null, suppressed: false, completed: false, unavailable: true, stale: true,
      }],
    };
    render(<CalmChromeContext.Provider value><CalmAnswerContext.Provider value>
      <BlockView block={priority} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </CalmAnswerContext.Provider></CalmChromeContext.Provider>);
    expect(screen.queryByRole('link', { name: 'Open Maintenance' })).toBeNull();
    expect(screen.queryByText('Needs attention sooner')).toBeNull();
    expect(screen.getByText(/Start with Fall checklist: Chimney cleaning and inspection/).closest('[data-home-actions-intro]')).toHaveTextContent('Can help prevent chimney fires and carbon monoxide hazards.');
    const details = screen.getByText('Details & source').closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Details & source'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('This is a fall checklist task. Can help prevent chimney fires and carbon monoxide hazards.')).toBeInTheDocument();
    expect(screen.queryByText(/Needs attention sooner|Supported more strongly by your home record/)).toBeNull();
    expect(screen.getByText(/Due 10\/31\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Ranked here because|stable tie break/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Details temporarily unavailable · May need refresh · Confirm home details/)).toBeInTheDocument();
    expect(screen.queryByText(/low confidence|high confidence/i)).toBeNull();
    expect(screen.getByText('This is a critical fall task.')).toBeInTheDocument();
    expect(screen.getByText('3 of 8 complete')).toBeInTheDocument();
    const review = screen.getByRole('button', { name: 'Review checklist' });
    expect(review).toHaveClass('border-emerald-700', 'bg-emerald-700', 'text-white');
    const overflow = screen.getByRole('button', { name: 'More options' }).closest('details');
    expect(overflow).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(overflow).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Mark useful' })).toBeInTheDocument();
    fireEvent.click(review);
    expect(onItemAction).toHaveBeenCalledWith('HOME_ACTION', 'a1', 'What should I do next for “Replace the HVAC filter”?', 'HOME_ACTIONS', 'CONVERSATION_CONTINUE', undefined, 'a1');
  });

  test('opening another rating closes the previous one, and saved feedback closes its rating', async () => {
    const onItemAction = jest.fn();
    const submitFeedback = jest.spyOn(api, 'submitHomeActionUsefulnessFeedback').mockResolvedValue({ success: true, data: { id: 'feedback-1', rating: 'USEFUL' } });
    const item = (id: string) => ({
      homeActionId: id, title: `Action ${id}`, rawPriority: 'SOON' as const, consumerPriority: 'PLAN_SOON' as const, comparativeReasonCodes: [], confidenceLabel: 'HIGH' as const, deadlineAt: null, dependencyRefs: [],
      cta: null, inlineLaunch: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false,
    });
    const priority: AskPresentationBlock = {
      type: 'PRIORITY_LIST', id: 'home-actions-priority-list', title: 'What matters now', propertyId: 'home',
      rankingPolicyVersion: 'priority-list-policy-v1', generatedAt: '2026-09-27T12:00:00.000Z', sourceFreshnessAt: null, truncated: false,
      items: [item('a1'), item('a2')],
    };
    render(<CalmChromeContext.Provider value><CalmAnswerContext.Provider value>
      <BlockView block={priority} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </CalmAnswerContext.Provider></CalmChromeContext.Provider>);

    const overflows = screen.getAllByRole('button', { name: 'More options' });
    fireEvent.click(overflows[0]);
    expect(overflows[0]).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(overflows[1]);
    fireEvent.click(overflows[1]);
    expect(overflows[0]).toHaveAttribute('aria-expanded', 'false');
    expect(overflows[1]).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(within(overflows[1].closest('details')!).getByRole('button', { name: 'Mark useful' }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith('e', 'a2', { rating: 'USEFUL' }));
    await waitFor(() => expect(overflows[1]).toHaveAttribute('aria-expanded', 'false'));
    submitFeedback.mockRestore();
  });

  test('weather parity keeps impact, preparation, source, reversible controls, and progressive disclosure in Ask', async () => {
    const onItemAction = jest.fn();
    const executeCommand = jest.spyOn(api, 'executeHomeActionCommand').mockResolvedValue({
      success: true,
      data: { actionId: 'rain', command: 'SNOOZE', state: 'SNOOZED', recordedAt: '2026-11-04T12:00:00.000Z' },
    });
    const compactItem = (id: string) => ({
      homeActionId: id, title: `Action ${id}`, rawPriority: 'SOON' as const, consumerPriority: 'PLAN_SOON' as const,
      comparativeReasonCodes: [], confidenceLabel: 'HIGH' as const, deadlineAt: null, dependencyRefs: [], cta: null,
      inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'HOME_ACTIONS' as const, message: `Review ${id}`, label: 'Review details' },
      presentation: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false,
    });
    const priority: AskPresentationBlock = {
      type: 'PRIORITY_LIST', id: 'home-actions-priority-list', title: 'What matters now', propertyId: 'home',
      rankingPolicyVersion: 'priority-list-policy-v2', generatedAt: '2026-11-04T12:00:00.000Z', sourceFreshnessAt: '2026-11-04T12:00:00.000Z', truncated: false,
      items: [{
        ...compactItem('rain'), homeActionId: 'rain', title: 'Heavy rain expected Friday, Nov 6', rawPriority: 'NOW', consumerPriority: 'DO_NOW', deadlineAt: '2026-11-06T00:00:00.000Z',
        inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_ACTIONS', message: 'How should I prepare?', label: 'View preparation steps' },
        presentation: {
          kind: 'WEATHER', variant: 'ENVIRONMENT_PREPARATION', eyebrow: 'Environment action recommended',
          summary: 'About 2.3 inches of rain is forecast for this area.', whyItMatters: 'Heavy rain may cause water intrusion around the foundation.',
          recommendedAction: 'Clear gutters and exterior drains before rain begins.', expectedOutcome: 'Reduce avoidable water intrusion.', detailLabel: 'Preparation steps',
          timing: { windowStart: '2026-11-05T00:00:00.000Z', windowEnd: '2026-11-06T23:59:59.999Z', rationale: 'Prepare before rain begins.' },
          keyFacts: [{ label: 'Forecast window', value: 'Nov 5–Nov 6' }],
          source: { label: 'Open-Meteo forecast and property profile', observedAt: '2026-11-04T12:00:00.000Z', freshness: 'CURRENT' },
          controls: [{ command: 'ACKNOWLEDGE', label: 'Acknowledge' }, { command: 'SNOOZE', label: 'Remind tomorrow' }],
        },
      }, compactItem('seasonal'), compactItem('dishwasher'), compactItem('refrigerator')],
    };
    const { container } = render(<CalmChromeContext.Provider value><CalmAnswerContext.Provider value>
      <BlockView block={priority} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </CalmAnswerContext.Provider></CalmChromeContext.Provider>);

    expect(screen.getByText('About 2.3 inches of rain is forecast for this area.')).toBeInTheDocument();
    expect(screen.getByText(/Start with Heavy rain expected Friday, Nov 6/).closest('[data-home-actions-intro]')).toHaveTextContent('Heavy rain may cause water intrusion around the foundation.');
    expect(screen.getByText('Clear gutters and exterior drains before rain begins.')).toBeInTheDocument();
    const details = screen.getByText('Details & source').closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Details & source'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Nov 5–Nov 6')).toBeInTheDocument();
    expect(screen.getByText('Source: Open-Meteo forecast and property profile')).toBeInTheDocument();
    expect(screen.getByText('Also worth planning')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ask about this' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /not relevant/i })).toBeNull();
    expect(container.querySelectorAll('[data-home-action-row]')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more action' }));
    expect(container.querySelectorAll('[data-home-action-row]')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Remind tomorrow' }));
    await waitFor(() => expect(executeCommand).toHaveBeenCalledWith('home', 'rain', expect.objectContaining({ command: 'SNOOZE', nextTriggerAt: expect.any(String) })));
    expect(await screen.findByText('Reminder updated.')).toBeInTheDocument();
    executeCommand.mockRestore();
  });

  test('the calm ranked view has timing filters with full-feed counts, one Start here row, and no horizontal overflow classes', () => {
    const onItemAction = jest.fn();
    const item = (id: string, rawPriority: 'NOW' | 'CONSIDER') => ({
      homeActionId: id, title: `Action ${id}`, rawPriority, consumerPriority: 'PLAN_SOON' as const, comparativeReasonCodes: [], confidenceLabel: 'MEDIUM' as const, deadlineAt: null, dependencyRefs: [],
      cta: null, inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'HOME_ACTIONS' as const, message: `What should I do next for “Action ${id}”?` },
      watchState: null, suppressed: false, completed: false, unavailable: false, stale: false,
    });
    const priority: AskPresentationBlock = {
      type: 'PRIORITY_LIST', id: 'home-actions-priority-list', title: 'What matters now', propertyId: 'home',
      rankingPolicyVersion: 'priority-list-policy-v1', generatedAt: '2026-09-27T12:00:00.000Z', sourceFreshnessAt: null, truncated: false,
      filters: [
        { id: 'all', label: 'All', count: 9, message: 'What needs my attention around the home?', active: true },
        { id: 'now', label: 'Now', count: 1, message: 'What needs my attention right now?', active: false },
        { id: 'consider', label: 'Consider', count: 6, message: 'What home actions are worth a look to consider?', active: false },
      ],
      items: [item('a1', 'NOW'), item('a2', 'CONSIDER')],
    };
    const { container } = render(<CalmChromeContext.Provider value><CalmAnswerContext.Provider value>
      <BlockView block={priority} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
    </CalmAnswerContext.Provider></CalmChromeContext.Provider>);
    expect(screen.getAllByText('Start here')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'All · 9' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Consider · 6' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('[data-home-action-row]')).toHaveLength(2);
    expect(container.querySelector('[data-calm-home-actions]')).toHaveClass('max-w-[960px]');
    expect(screen.getByText('Consider', { selector: 'span' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consider · 6' }));
    expect(onItemAction).toHaveBeenCalledWith('HOME_ACTION_FILTER', '', 'What home actions are worth a look to consider?', 'HOME_ACTIONS', 'CONVERSATION_CONTINUE');
    expect(container.querySelector('.overflow-x-auto, .min-w-\\[')).toBeNull();
  });
});
