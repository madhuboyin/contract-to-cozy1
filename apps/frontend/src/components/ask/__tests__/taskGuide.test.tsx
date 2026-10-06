import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// TASK_GUIDE: one task or habit as a single card. It renders only what the producer recorded.
const guide = (overrides: Record<string, unknown> = {}) => ({
  type: 'TASK_GUIDE', id: 'seasonal-task-guide', title: 'Replace furnace filters monthly', summary: 'Dirty filters reduce efficiency and can cause furnace failure in extreme cold.',
  eyebrow: ['Winter prep', 'Task 1 of 4'], icon: 'HVAC',
  chips: [{ label: 'High priority', kind: 'PRIORITY_HIGH' }, { label: '~15 minutes', kind: 'TIME' }, { label: '$15–$40', kind: 'COST' }, { label: 'DIY', kind: 'DIY' }],
  main: { title: 'What to do', body: 'Check and replace HVAC filters every month during peak heating season', facts: [{ label: 'When', value: 'Best done about 2 weeks before winter starts' }] },
  history: [],
  notes: [
    { id: 'why', title: 'Why this is on your list', body: 'Winter is the next season for your area.' },
    { id: 'personalized', title: 'How personalized is this?', body: 'This is general guidance for your climate.', actionId: 'seasonal-update-home-details' },
  ],
  actions: [
    { id: 'seasonal-next-task', label: 'Next winter task', interactionType: 'START_WORKFLOW', message: 'Walk me through "Test GFCI outlets".', operationId: 'SEASONAL_HOME_CARE', entityType: 'SEASONAL_TASK', entityId: 'NEXT_SEASON:WINTER_GFCI_OUTLET_TEST', style: 'PRIMARY' },
    { id: 'seasonal-back-to-plan', label: 'Back to the winter tasks', interactionType: 'START_WORKFLOW', message: 'What should I do to get ready for next season?', operationId: 'SEASONAL_HOME_CARE', style: 'SECONDARY' },
    { id: 'seasonal-update-home-details', label: 'Update home details', interactionType: 'START_WORKFLOW', message: 'How complete is my home record?', operationId: 'PROPERTY_SUMMARY', style: 'SECONDARY' },
  ],
  ...overrides,
} as unknown as AskPresentationBlock);

const execution = (block: AskPresentationBlock): AskExecutionResponse => ({
  sessionId: 'session', executionId: 'exec-guide', question: 'Walk me through "Replace furnace filters monthly".', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-05T19:30:21.000Z', updatedAt: '2026-10-05T19:30:21.000Z', viewState: null, blocks: [block],
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

const card = (block: AskPresentationBlock, ask = jest.fn()) => ({
  ask,
  view: render(
    <ExecutionCard execution={execution(block)} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={ask} selectedPropertyId="home"
      setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
      contextOpen={false} onOpenContext={jest.fn()} />,
  ),
});

describe('task guide card', () => {
  it('shows the breadcrumb, title, summary and every key fact as a chip, in one card', () => {
    const { view } = card(guide());
    const article = view.container.querySelector('[data-task-guide]') as HTMLElement;
    expect(article).not.toBeNull();
    expect(within(article).getByRole('navigation', { name: 'Where this is' })).toHaveTextContent('Winter prep');
    expect(within(article).getByRole('navigation', { name: 'Where this is' })).toHaveTextContent('Task 1 of 4');
    expect(within(article).getByRole('heading', { name: 'Replace furnace filters monthly' })).toBeInTheDocument();
    expect(article).toHaveTextContent('Dirty filters reduce efficiency');
    const chips = within(article).getByRole('list', { name: 'Key facts' });
    for (const label of ['High priority', '~15 minutes', '$15–$40', 'DIY']) expect(chips).toHaveTextContent(label);
    expect(article.querySelector('[data-task-guide-main]')).toHaveTextContent('Check and replace HVAC filters every month');
    expect(article.querySelector('[data-task-guide-main]')).toHaveTextContent('Best done about 2 weeks before winter starts');
    expect(article.querySelector('[data-task-guide-tip]')).toBeNull();
    expect(view.container.querySelectorAll('a')).toHaveLength(0);
  });

  it('puts a row\'s own action in the row, keeps the rest in the action row, and every button asks inside the conversation', () => {
    const { ask, view } = card(guide());
    const row = view.container.querySelector('[data-task-guide-note="personalized"]') as HTMLElement;
    expect(within(row).getByRole('button', { name: /Update home details/ })).toBeInTheDocument();
    const footer = view.container.querySelector('[data-task-guide-actions]') as HTMLElement;
    expect(within(footer).getAllByRole('button').map((button) => button.textContent)).toEqual(['Next winter task', 'Back to the winter tasks']);
    expect(footer.querySelectorAll('button.bg-teal-700')).toHaveLength(1);
    fireEvent.click(within(footer).getByRole('button', { name: /Next winter task/ }));
    expect(ask).toHaveBeenLastCalledWith('Walk me through "Test GFCI outlets".', undefined, expect.objectContaining({ operationId: 'SEASONAL_HOME_CARE', entityType: 'SEASONAL_TASK', entityId: 'NEXT_SEASON:WINTER_GFCI_OUTLET_TEST', sourceExecutionId: 'exec-guide' }));
    fireEvent.click(within(row).getByRole('button', { name: /Update home details/ }));
    expect(ask).toHaveBeenLastCalledWith('How complete is my home record?', undefined, expect.objectContaining({ operationId: 'PROPERTY_SUMMARY' }));
  });

  it('keeps each action\'s declared style: a guide with no PRIMARY action shows no filled button, and the first action is not promoted', () => {
    const calm = guide({
      eyebrow: ['Winter prep'],
      actions: [
        { id: 'seasonal-next-task', label: 'Another winter task', interactionType: 'START_WORKFLOW', message: 'Walk me through "Test GFCI outlets".', operationId: 'SEASONAL_HOME_CARE', style: 'SECONDARY' },
        { id: 'seasonal-back-to-plan', label: 'Back to the winter tasks', interactionType: 'START_WORKFLOW', message: 'What home care should I do this season?', operationId: 'SEASONAL_HOME_CARE', style: 'SECONDARY' },
      ],
    });
    const { view } = card(calm);
    const footer = view.container.querySelector('[data-task-guide-actions]') as HTMLElement;
    expect(within(footer).getAllByRole('button').map((button) => button.textContent)).toEqual(['Another winter task', 'Back to the winter tasks']);
    expect(footer.querySelectorAll('button.bg-teal-700')).toHaveLength(0);
    expect(within(view.container.querySelector('[data-task-guide]') as HTMLElement).getByRole('navigation', { name: 'Where this is' })).not.toHaveTextContent(/Task \d+ of \d+/);
  });

  it('a producer that declares a PRIMARY action still gets exactly one filled button, on that action', () => {
    const declared = guide({
      actions: [
        { id: 'habit-complete', label: 'Mark done', interactionType: 'START_WORKFLOW', message: 'Mark this habit done.', operationId: 'HOME_HABIT_UPDATE', style: 'SECONDARY' },
        { id: 'habit-adopt', label: 'Add to my routine', interactionType: 'START_WORKFLOW', message: 'Add this habit.', operationId: 'HOME_HABIT_UPDATE', style: 'PRIMARY' },
      ],
    });
    const { view } = card(declared);
    const footer = view.container.querySelector('[data-task-guide-actions]') as HTMLElement;
    const filled = footer.querySelectorAll('button.bg-teal-700');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveTextContent('Add to my routine');
  });

  it('shows a tip and recent activity only when the producer recorded them', () => {
    const { view } = card(guide({ tip: { title: 'Before you start', body: 'Press and hold the test button.' }, history: [{ label: 'Snoozed', value: 'Aug 30, 2026' }] }));
    expect(view.container.querySelector('[data-task-guide-tip]')).toHaveTextContent('Press and hold the test button.');
    expect(screen.getByRole('region', { name: 'Recent activity' })).toHaveTextContent('Aug 30, 2026');
  });
});
