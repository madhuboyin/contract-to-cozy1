import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { SeasonalPlanResultList } from '../SeasonalPlanResultList';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// The seasonal home-care answer: "Do these soon" / "Can wait" as numbered cards that open to a how-to, and next steps that stay in Ask.
type PlanBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const item = (id: string, title: string, number: number, urgent: boolean, diy = true) => ({
  id, title, description: `Why ${title} matters.`, condition: null, entityType: 'SEASONAL_TASK', meta: [urgent ? 'High priority' : 'Recommended', diy ? 'DIY' : 'Usually a pro'],
  detail: ['What to do: Check and replace the filter every month', 'Time it takes: About 15 minutes', 'Typical cost: $15–$40', 'Who does it: You can usually do this yourself'].join('\n'),
  tone: urgent ? 'CAUTION' : 'DEFAULT', status: null, href: null, countLabel: String(number),
});

const plan = (): PlanBlock => ({
  type: 'GROUPED_LIST', id: 'seasonal-home-care-tasks', title: 'Winter tasks', actions: [], filters: [],
  sections: [
    { id: 'seasonal-soon', title: 'Do these soon', caption: 'Helps prevent costly issues and keeps your home safe and efficient.', count: 2, items: [item('FILTER', 'Replace furnace filters monthly', 1, true), item('GFCI', 'Test GFCI outlets', 2, true)] },
    { id: 'seasonal-wait', title: 'Can wait', caption: 'Useful checks to keep your home in good shape.', count: 1, items: [item('HUMIDITY', 'Check and adjust humidity levels', 3, false, false)] },
  ],
} as unknown as PlanBlock);

describe('SeasonalPlanResultList', () => {
  it('shows what to do soon and what can wait, numbered across both groups, with chips and the group captions', () => {
    const { container } = render(<SeasonalPlanResultList block={plan()} />);
    const soon = container.querySelector('[data-seasonal-section="seasonal-soon"]') as HTMLElement;
    const wait = container.querySelector('[data-seasonal-section="seasonal-wait"]') as HTMLElement;
    expect(within(soon).getByRole('heading', { name: /Do these soon/ })).toHaveTextContent('(2)');
    expect(soon).toHaveTextContent('Helps prevent costly issues and keeps your home safe and efficient.');
    expect(wait).toHaveTextContent('Can wait');
    expect(wait).toHaveTextContent('(1)');
    expect(Array.from(container.querySelectorAll('[data-seasonal-task]')).map((row) => row.getAttribute('data-seasonal-task'))).toEqual(['FILTER', 'GFCI', 'HUMIDITY']);
    expect(Array.from(container.querySelectorAll('li[data-seasonal-task] > div > span')).map((badge) => badge.textContent)).toEqual(['1', '2', '3']);
    expect(soon).toHaveTextContent('High priority');
    expect(soon).toHaveTextContent('DIY');
    expect(wait).toHaveTextContent('Recommended');
    expect(wait).toHaveTextContent('Usually a pro');
  });

  it('opens one task at a time to its how-to and closes it again; the label follows who does the work', () => {
    const { container } = render(<SeasonalPlanResultList block={plan()} />);
    expect(container.querySelector('[data-seasonal-task-detail]')).toBeNull();
    const [first] = screen.getAllByRole('button', { name: 'How to do it' });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(first);
    const detail = container.querySelector('[data-seasonal-task-detail="FILTER"]') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail).toHaveTextContent('What to do');
    expect(detail).toHaveTextContent('Check and replace the filter every month');
    expect(detail).toHaveTextContent('About 15 minutes');
    expect(detail).toHaveTextContent('$15–$40');
    expect(container.querySelector('[data-seasonal-task-detail="GFCI"]')).toBeNull();
    const hide = screen.getByRole('button', { name: 'Hide details' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('aria-controls', detail.id);
    fireEvent.click(hide);
    expect(container.querySelector('[data-seasonal-task-detail]')).toBeNull();
    expect(screen.getByRole('button', { name: 'What to know' })).toBeInTheDocument();
  });

  it('never navigates: no links at all', () => {
    const { container } = render(<SeasonalPlanResultList block={plan()} />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

const answer = (): AskExecutionResponse => ({
  sessionId: 'session', executionId: 'exec-plan', question: 'What should I do to get ready for next season?', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-05T19:30:21.000Z', updatedAt: '2026-10-05T19:30:21.000Z', viewState: null,
  blocks: [
    { type: 'SUMMARY', id: 'seasonal-home-care-summary', title: 'Getting ready for winter', body: 'Winter is the next season for your area. Here are 3 things to focus on.', tone: 'DEFAULT', actions: [] },
    plan(),
    { type: 'BOUNDARY', id: 'seasonal-home-care-boundary', title: 'About this recommendation', body: 'These are general seasonal tasks for the climate region, not an assessment of this home.', severity: 'INFO', suggestions: [] },
    {
      type: 'SUMMARY', id: 'seasonal-home-care-next', title: 'What would you like to do next?', body: 'Adding tasks sets up your winter checklist for this home.', tone: 'DEFAULT',
      actions: [
        { id: 'seasonal-add-tasks', label: 'Add these to my tasks', interactionType: 'START_WORKFLOW', message: 'Set up my winter checklist.', operationId: 'SEASONAL_CHECKLIST_SETUP', entityType: 'SEASONAL_PLAN', entityId: 'WINTER:2026', style: 'PRIMARY' },
        { id: 'seasonal-walkthrough', label: 'Walk me through the first task', interactionType: 'START_WORKFLOW', message: 'Walk me through "Replace furnace filters monthly".', operationId: 'SEASONAL_HOME_CARE', entityType: 'SEASONAL_TASK', entityId: 'NEXT_SEASON:WINTER_FURNACE_FILTER_CHANGE', style: 'SECONDARY' },
        { id: 'seasonal-update-home-details', label: 'Update home details', interactionType: 'START_WORKFLOW', message: 'How complete is my home record?', operationId: 'PROPERTY_SUMMARY', style: 'SECONDARY' },
      ],
    },
  ],
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

describe('seasonal answer in the workspace', () => {
  const card = (ask = jest.fn()) => ({
    ask,
    view: render(
      <ExecutionCard execution={answer()} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={ask} selectedPropertyId="home"
        setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
        contextOpen={false} onOpenContext={jest.fn()} />,
    ),
  });

  it('renders the plan component for the seasonal block and leaves no link to the desktop checklist', () => {
    const { view } = card();
    expect(view.container.querySelector('[data-seasonal-plan]')).not.toBeNull();
    expect(view.container.querySelectorAll('a[href*="/dashboard/seasonal"]')).toHaveLength(0);
    expect(screen.getByText('What would you like to do next?')).toBeInTheDocument();
    // The intro carries a season icon and every next step is offered, not only the first.
    const intro = view.container.querySelector('[data-seasonal-intro]') as HTMLElement;
    expect(intro).toHaveTextContent('Getting ready for winter');
    expect(intro.querySelector('svg')).not.toBeNull();
    expect(view.container.querySelectorAll('[data-seasonal-next-steps] button')).toHaveLength(3);
    expect(view.container.querySelector('[data-seasonal-about]')).toHaveTextContent('not an assessment of this home');
  });

  it('each next step asks inside the conversation with its own operation and entity', () => {
    const { ask } = card();
    fireEvent.click(screen.getByRole('button', { name: /Add these to my tasks/ }));
    expect(ask).toHaveBeenLastCalledWith('Set up my winter checklist.', undefined, expect.objectContaining({ operationId: 'SEASONAL_CHECKLIST_SETUP', entityType: 'SEASONAL_PLAN', entityId: 'WINTER:2026', sourceExecutionId: 'exec-plan' }));
    fireEvent.click(screen.getByRole('button', { name: /Walk me through the first task/ }));
    expect(ask).toHaveBeenLastCalledWith('Walk me through "Replace furnace filters monthly".', undefined, expect.objectContaining({ operationId: 'SEASONAL_HOME_CARE', entityType: 'SEASONAL_TASK', entityId: 'NEXT_SEASON:WINTER_FURNACE_FILTER_CHANGE' }));
    fireEvent.click(screen.getByRole('button', { name: /Update home details/ }));
    expect(ask).toHaveBeenLastCalledWith('How complete is my home record?', undefined, expect.objectContaining({ operationId: 'PROPERTY_SUMMARY' }));
  });
});
