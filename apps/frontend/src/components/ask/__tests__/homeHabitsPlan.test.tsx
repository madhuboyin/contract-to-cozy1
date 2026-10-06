import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { FactSheetResultList, SeasonalPlanResultList } from '../SeasonalPlanResultList';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// The Home Habit Coach answers in the plan layout: numbered cards with their own Review button beside an expand toggle, and next steps
// that ask inside the conversation.
type ListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const habit = (id: string, title: string, number: number, urgent: boolean) => ({
  id, title, description: `Why ${title}.`, condition: null, entityType: 'HOME_HABIT', countLabel: String(number), tone: urgent ? 'CAUTION' : 'DEFAULT',
  meta: ['Monthly', 'easy', 'About 10 min', 'Suggested for Sep 20, 2026'], status: 'ACTIVE',
  detail: ['How often: Monthly', 'Time it takes: About 10 minutes', 'Tip: Press and hold the test button.'].join('\n'),
  actions: [{ id: `habit-review-${id}`, label: 'Review', message: `Review the home habit "${title}".`, style: 'SECONDARY', interactionType: 'CONVERSATION_CONTINUE', operationId: 'HOME_HABITS' }],
});

const list = (): ListBlock => ({
  type: 'GROUPED_LIST', id: 'home-habits-items', title: 'Your home habits', actions: [], filters: [],
  sections: [
    { id: 'home-habits-start', title: 'Start with these', caption: 'Their suggested date has already passed.', count: 1, items: [habit('h1', 'Test Smoke and CO Detectors', 1, true)] },
    { id: 'home-habits-up-next', title: 'Up next', caption: 'In the order the coach ranks them.', count: 1, items: [habit('h2', 'Check Under-Sink Connections', 2, false)] },
  ],
} as unknown as ListBlock);

describe('habits plan cards', () => {
  it('shows each habit with its own Review button and a separate toggle for the facts', () => {
    const onItemAction = jest.fn();
    const { container } = render(<SeasonalPlanResultList block={list()} onItemAction={onItemAction} />);
    expect(container.querySelector('[data-seasonal-section="home-habits-start"]')).toHaveTextContent('Start with these');
    const first = container.querySelector('[data-seasonal-task="h1"]') as HTMLElement;
    expect(first).toHaveTextContent('Test Smoke and CO Detectors');
    expect(first).toHaveTextContent('Suggested for Sep 20, 2026');
    fireEvent.click(within(first).getByRole('button', { name: 'Review' }));
    expect(onItemAction).toHaveBeenCalledWith('HOME_HABIT', 'h1', 'Review the home habit "Test Smoke and CO Detectors".', 'HOME_HABITS', 'CONVERSATION_CONTINUE');
    const toggle = within(first).getByRole('button', { name: 'Show details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const detail = container.querySelector('[data-seasonal-task-detail="h1"]') as HTMLElement;
    expect(detail).toHaveTextContent('How often');
    expect(detail).toHaveTextContent('Press and hold the test button.');
    expect(within(first).getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

const answer = (blocks: AskPresentationBlock[], executionId: string): AskExecutionResponse => ({
  sessionId: 'session', executionId, question: 'Show my home habits', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-05T19:30:21.000Z', updatedAt: '2026-10-05T19:30:21.000Z', viewState: null, blocks,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

const card = (execution: AskExecutionResponse, ask = jest.fn()) => ({
  ask,
  view: render(
    <ExecutionCard execution={execution} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={ask} selectedPropertyId="home"
      setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
      contextOpen={false} onOpenContext={jest.fn()} />,
  ),
});

describe('habits answers in the workspace', () => {
  it('the list asks for a review inside the conversation, with its entity, and offers the next steps', () => {
    const blocks = [
      { type: 'SUMMARY', id: 'home-habits-summary', title: '2 habits to work on, 1 past their suggested date', body: 'Ranked by the Home Habit Coach for this home.', tone: 'DEFAULT', actions: [] },
      list(),
      { type: 'BOUNDARY', id: 'home-habits-boundary', title: 'About these habits', body: 'Habits are suggested from what is recorded about this home.', severity: 'INFO', suggestions: [] },
      { type: 'SUMMARY', id: 'home-habits-next', title: 'What would you like to do next?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [
        { id: 'habits-review-first', label: 'Review the first habit', interactionType: 'START_WORKFLOW', message: 'Review the home habit "Test Smoke and CO Detectors".', operationId: 'HOME_HABITS', entityType: 'HOME_HABIT', entityId: 'h1', style: 'PRIMARY' },
        { id: 'habits-show-maintenance', label: 'Show my maintenance tasks', interactionType: 'START_WORKFLOW', message: 'What maintenance tasks are coming due?', operationId: 'MAINTENANCE_STATUS', style: 'SECONDARY' },
      ] },
    ] as unknown as AskPresentationBlock[];
    const { ask, view } = card(answer(blocks, 'exec-habits'));
    expect(view.container.querySelector('[data-seasonal-intro] svg')).not.toBeNull();
    expect(view.container.querySelector('[data-seasonal-about]')).toHaveTextContent('About these habits');
    fireEvent.click(screen.getAllByRole('button', { name: 'Review' })[1]);
    const lastCall = ask.mock.calls[ask.mock.calls.length - 1];
    expect(lastCall[0]).toBe('Review the home habit "Check Under-Sink Connections".');
    expect(lastCall[2]).toEqual(expect.objectContaining({ entityType: 'HOME_HABIT', entityId: 'h2', operationId: 'HOME_HABITS' }));
    expect(view.container.querySelectorAll('[data-seasonal-next-steps] button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Review the first habit/ }));
    expect(ask).toHaveBeenLastCalledWith('Review the home habit "Test Smoke and CO Detectors".', undefined, expect.objectContaining({ entityId: 'h1', sourceExecutionId: 'exec-habits' }));
  });

  it('a habit review is one guide card; each action opens its confirmation', () => {
    const action = (id: string, label: string, message: string) => ({ id, label, interactionType: 'START_WORKFLOW', message, operationId: 'HOME_HABIT_UPDATE', entityType: 'HOME_HABIT', entityId: 'h1', style: 'SECONDARY' });
    const blocks = [{
      type: 'TASK_GUIDE', id: 'home-habit-review-h1', title: 'Test Smoke and CO Detectors', summary: 'Smoke detectors need a monthly test.', eyebrow: ['Home habits', 'Suggested'], icon: 'SAFETY',
      chips: [{ label: 'Monthly', kind: 'TAG' }, { label: '~10 minutes', kind: 'TIME' }], tip: { title: 'Before you start', body: 'Press and hold the test button.' },
      main: { title: 'What it involves', body: 'Test each detector.', facts: [{ label: 'Status', value: 'Suggested' }] }, history: [],
      notes: [{ id: 'about', title: 'About these habits', body: 'Nothing changes until you confirm.' }],
      actions: [
        action('habit-adopt', 'Add to my routine', 'Add this habit to my maintenance routine.'), action('habit-complete', 'Mark done', 'Mark this habit done.'), action('habit-snooze', 'Snooze for a week', 'Snooze this habit for a week.'),
        action('habit-skip', 'Skip for now', 'Skip this habit for now.'), action('habit-dismiss', 'Stop suggesting', 'Stop suggesting this habit.'),
        { id: 'habits-back-to-list', label: 'Back to my habits', interactionType: 'START_WORKFLOW', message: 'Show my home habits', operationId: 'HOME_HABITS', style: 'SECONDARY' },
      ],
    }] as unknown as AskPresentationBlock[];
    const { ask, view } = card(answer(blocks, 'exec-review'));
    expect(view.container.querySelectorAll('[data-task-guide]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-task-guide-actions] button')).toHaveLength(6);
    expect(view.container.querySelector('[data-task-guide-tip]')).toHaveTextContent('Press and hold the test button.');
    fireEvent.click(screen.getByRole('button', { name: /Add to my routine/ }));
    expect(ask).toHaveBeenLastCalledWith('Add this habit to my maintenance routine.', undefined, expect.objectContaining({ operationId: 'HOME_HABIT_UPDATE', entityType: 'HOME_HABIT', entityId: 'h1', sourceExecutionId: 'exec-review' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to my habits/ }));
    expect(ask).toHaveBeenLastCalledWith('Show my home habits', undefined, expect.objectContaining({ operationId: 'HOME_HABITS' }));
  });
});

describe('fact sheet', () => {
  it('lists label/value facts compactly, with the date beside an activity entry', () => {
    const block = { type: 'GROUPED_LIST', id: 'home-habit-review-facts', title: 'About this habit', actions: [], filters: [], sections: [{ id: 's', title: 'Details', count: 2, items: [
      { id: 'a', title: 'How often', description: 'monthly', condition: null, meta: [], status: null, href: null },
      { id: 'b', title: 'snoozed', description: null, condition: null, meta: ['Aug 30, 2026'], status: null, href: null },
    ] }] } as unknown as ListBlock;
    const { container } = render(<FactSheetResultList block={block} />);
    expect(container.querySelectorAll('dt')).toHaveLength(2);
    expect(container.querySelector('[data-fact-sheet]')).toHaveTextContent('How often');
    expect(container.querySelector('[data-fact-sheet]')).toHaveTextContent('Aug 30, 2026');
  });
});
