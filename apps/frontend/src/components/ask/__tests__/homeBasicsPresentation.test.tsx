import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// Home safety basics (conversational presentation Phase 1): the real builder's block shapes, rendered through the registered block renderers.
const blocks = [
  { type: 'SUMMARY', id: 'home-basics-summary', title: 'Home safety basics', body: 'Three things matter most if something goes wrong.', tone: 'DEFAULT', actions: [] },
  {
    type: 'GROUPED_LIST', id: 'home-basics-items', title: 'Home safety basics', actions: [], filters: [],
    sections: [{
      id: 'home-basics-safety_basics', title: 'Most important first', count: 6, initialVisibleCount: 3,
      items: ['Smoke and carbon monoxide alarms', 'Find your main water shutoff', 'Know your electrical panel', 'Know whether you have gas, and where it shuts off', 'Keep a fire extinguisher where you can reach it', 'Keep emergency numbers handy']
        .map((title, index) => ({ id: `item-${index + 1}`, title, description: 'Why it matters.', condition: null, meta: [], status: null, href: null, countLabel: String(index + 1) })),
    }],
  },
  { type: 'BOUNDARY', id: 'home-basics-gas-emergency', title: 'If you smell gas', body: 'Leave the home right away. Call your gas utility or the emergency number from outside.', severity: 'EMERGENCY', suggestions: [] },
  {
    type: 'SUMMARY', id: 'home-basics-next', title: 'What would you like to do next?', body: 'Both are general guides. Nothing here changes your home record.', tone: 'DEFAULT',
    actions: [
      { id: 'home-basics-monthly-routine', label: 'A simple monthly routine', interactionType: 'START_WORKFLOW', message: 'What should I check around my home each month?', operationId: 'HOME_BASICS_GUIDE', style: 'SECONDARY' },
      { id: 'home-basics-seasonal-plan', label: 'Home care for this season', interactionType: 'START_WORKFLOW', message: 'What home care should I do this season?', operationId: 'SEASONAL_HOME_CARE', style: 'SECONDARY' },
    ],
  },
  { type: 'BOUNDARY', id: 'home-basics-boundary', title: 'General guidance', body: 'This is general guidance, not an assessment of your home.', severity: 'INFO', suggestions: [] },
] as unknown as AskPresentationBlock[];

const execution = (): AskExecutionResponse => ({
  sessionId: 'session', executionId: 'exec-basics', question: 'What home safety basics should I know?', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-06T19:30:21.000Z', updatedAt: '2026-10-06T19:30:21.000Z', viewState: null, blocks,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

const renderCard = (ask = jest.fn()) => ({
  ask,
  view: render(
    <ExecutionCard execution={execution()} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={ask} selectedPropertyId="home"
      setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
      contextOpen={false} onOpenContext={jest.fn()} />,
  ),
});

describe('home safety basics presentation', () => {
  it('shows the three most important items first and reveals the other three on request', () => {
    const { view } = renderCard();
    expect(view.container.querySelectorAll('[data-seasonal-task]')).toHaveLength(3);
    expect(screen.queryByText('Keep emergency numbers handy')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getByText('Keep emergency numbers handy')).toBeInTheDocument();
  });

  it('states the gas emergency in words (heading and instruction), before the next steps, and as its own block', () => {
    const { view } = renderCard();
    const heading = screen.getByRole('heading', { name: 'If you smell gas' });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText(/Leave the home right away/)).toBeInTheDocument();
    const next = view.container.querySelector('[data-seasonal-next-steps]') as HTMLElement;
    expect(section.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.querySelector('[data-seasonal-plan]')?.contains(section)).toBe(false);
  });

  it('offers the other guide and the seasonal plan as in-conversation continuations that ask, never navigate', () => {
    const { ask, view } = renderCard();
    const next = view.container.querySelector('[data-seasonal-next-steps]') as HTMLElement;
    expect(within(next).getAllByRole('button').map((button) => button.textContent)).toEqual(['A simple monthly routine', 'Home care for this season']);
    expect(next.querySelectorAll('a')).toHaveLength(0);
    fireEvent.click(within(next).getByRole('button', { name: 'Home care for this season' }));
    expect(ask).toHaveBeenLastCalledWith('What home care should I do this season?', undefined, expect.objectContaining({ operationId: 'SEASONAL_HOME_CARE' }));
  });
});
