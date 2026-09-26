import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { BlockView } from '../blocks/registry';
import { CalmChromeContext } from '../blocks/calmContext';
import { recentSessionStatus } from '../workspace/ConversationHistoryNav';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice B (IW-CALM-002/003/004/005/008/009, FRD v1.111): the calm shell applies to every
// answer while the setting is on, whichever domain produced it.
const limitation = { type: 'LIMITATION', id: 'limit', title: 'Required home context is temporarily unavailable', body: 'Ask could not load a required source. No home record was changed; try again shortly.' } as AskPresentationBlock;
const infoBoundary = { type: 'BOUNDARY', id: 'boundary', title: 'Based on recorded items', body: 'Unrecorded items are outside this result.', severity: 'INFO', suggestions: [] } as AskPresentationBlock;
const execution = (overrides: Partial<AskExecutionResponse> = {}) => ({
  sessionId: 'session', executionId: 'execution', question: 'Which home actions should I plan for next?', status: 'UNAVAILABLE', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-25T19:30:21.000Z', updatedAt: '2026-09-25T19:30:21.000Z', viewState: null, blocks: [limitation, infoBoundary],
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: true, intent: false, entity: false, homeRecord: false },
  ...overrides,
} as unknown as AskExecutionResponse);

const card = (value: AskExecutionResponse, suggestions: string[] = [], isSuperseded = false) => render(
  <ExecutionCard execution={value} isSuperseded={isSuperseded} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={suggestions} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} onToggleFold={jest.fn()} onTogglePin={jest.fn()} />,
);

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('calm shell, any domain', () => {
  it('shows a failed answer as plain text with one retry, no tinted card and no repeated "Try again"', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution(), ['Try again', 'What maintenance tasks are coming due?']);
    expect(await screen.findByText('Required home context is temporarily unavailable')).toBeInTheDocument();
    expect(container.querySelector('[data-calm-state="limitation"]')).not.toBeNull();
    expect(container.querySelector('section.bg-amber-50')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Try again/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Try again with current records' })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-footnote]')).toHaveTextContent('Based on recorded items. Unrecorded items are outside this result.');
  });

  it('puts Refresh, Pin and Collapse behind one menu and removes the per-answer frame', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution());
    expect(container.querySelector('article > div.rounded-3xl')).toBeNull();
    expect(screen.queryByRole('button', { name: /Refresh this result/ })).toBeNull();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Response options' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Refresh/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Pin/ })).toBeInTheDocument();
  });

  it('keeps the current shell, state cards and wording when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card(execution(), ['Try again']);
    expect(await screen.findByRole('button', { name: /Refresh this result/ })).toBeInTheDocument();
    expect(container.querySelector('[data-calm-state]')).toBeNull();
    expect(container.querySelector('section.bg-amber-50')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /^Try again/ })).toHaveLength(2);
  });

  it('shows a superseded answer as a one-line stub that opens the calm presentation, not the old frame', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution(), [], true);
    const stub = await screen.findByText('Earlier version of this answer · show');
    expect(screen.queryByText(/Superseded/)).toBeNull();
    expect(container.querySelector('details')?.className ?? '').not.toContain('border');
    fireEvent.click(stub);
    expect(container.querySelector('[data-calm-state]')).not.toBeNull();
    expect(container.querySelector('section.bg-amber-50')).toBeNull();
  });

  it('renders an error state with its actions and a red rule, not a card', () => {
    const error = { type: 'ERROR_STATE', id: 'err', title: 'Could not load', body: 'Try again in a moment.', actions: [{ id: 'retry', label: 'Retry', message: 'again', interactionType: 'START_WORKFLOW', operationId: 'X', style: 'PRIMARY' }] } as unknown as AskPresentationBlock;
    const { container } = render(<CalmChromeContext.Provider value><BlockView block={error} executionId="e" propertyId="home" itemActionsDisabled={false} onItemAction={() => undefined} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} /></CalmChromeContext.Provider>);
    const section = container.querySelector('[data-calm-state="error_state"]');
    expect(section).not.toBeNull();
    expect(section?.className).toContain('border-red-300');
    expect(section?.className).not.toContain('rounded-2xl');
  });
});

describe('calm sources and corrections', () => {
  const evidence = { type: 'EVIDENCE', id: 'evidence', title: 'Sources', items: [
    { label: 'Maintenance record', source: 'Home Record', observedAt: null }, { label: 'Warranty', source: 'Home Record', observedAt: null },
  ] } as AskPresentationBlock;
  const plain = { type: 'SUMMARY', id: 'plain', title: 'Here is the answer', body: 'Details.', tone: 'DEFAULT', actions: [] } as AskPresentationBlock;

  it('draws the sources as one small chip that opens the same context, not a boxed card', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card(execution({ blocks: [plain, evidence] } as Partial<AskExecutionResponse>));
    const chip = await screen.findByRole('button', { name: 'View sources' });
    expect(chip).toHaveTextContent('2 sources');
    expect(container.querySelector('[data-calm-sources]')).not.toBeNull();
    expect(screen.queryByText('Sources for this response')).toBeNull();
  });

  it('keeps the previous boxed sources card when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    card(execution({ blocks: [plain, evidence] } as Partial<AskExecutionResponse>));
    expect(await screen.findByText('Sources for this response')).toBeInTheDocument();
  });

  it('puts the correction links in one menu next to the ratings', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card(execution({ correctionCapabilities: { retryResponse: false, intent: true, entity: true, homeRecord: true } } as Partial<AskExecutionResponse>));
    expect(screen.queryByRole('button', { name: 'That’s not what I meant' })).toBeNull();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Something wrong with this answer?' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'That’s not what I meant' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Wrong item' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Correct home information' })).toBeInTheDocument();
  });
});

describe('session status wording (IW-CALM-008/009)', () => {
  it('never shows a raw status name', () => {
    expect(recentSessionStatus('UNAVAILABLE')).toBe('Needs a retry');
    expect(recentSessionStatus('FAILED_RETRYABLE')).toBe('Needs a retry');
    expect(recentSessionStatus('FAILED_TERMINAL')).toBe('Could not finish');
    expect(recentSessionStatus('BLOCKED')).toBe('Could not finish');
    expect(recentSessionStatus('OUT_OF_SCOPE')).toBe('Not available');
    expect(recentSessionStatus('NOT_APPLICABLE')).toBe('Not available');
    expect(recentSessionStatus('RECEIVED')).toBe('In progress');
    expect(recentSessionStatus('CANCELLED')).toBe('Cancelled');
    expect(recentSessionStatus('EXPIRED')).toBe('Expired');
    expect(recentSessionStatus('COMPLETED')).toBe('Completed');
    expect(recentSessionStatus('RUNNING')).toBe('In progress');
    expect(recentSessionStatus('NEEDS_CONFIRMATION')).toBe('Awaiting confirmation');
  });
});
