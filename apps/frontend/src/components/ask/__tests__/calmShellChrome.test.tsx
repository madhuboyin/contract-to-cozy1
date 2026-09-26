import { fireEvent, render, screen } from '@testing-library/react';
import { CalmLanding } from '../calm/CalmLanding';
import { FollowUpRow } from '../calm/FollowUpRow';
import { ConversationHistoryNav } from '../workspace/ConversationHistoryNav';
import { IntelligenceRefreshStatus } from '../../intelligence/IntelligenceRefreshStatus';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { ConciergeHomeView } from '@/features/ask/types';
import { api } from '@/lib/api/client';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice C and D (IW-CALM-006/007/008, FRD v1.111).
const view = (overrides: Partial<ConciergeHomeView> = {}): ConciergeHomeView => ({
  propertyId: 'home', generatedAt: '2026-09-25T00:00:00.000Z',
  journeyContext: { state: 'AVAILABLE', ownershipState: 'ESTABLISHED_OWNER', operatingMode: 'OWNING', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
  priorityList: { state: 'AVAILABLE', rankingPolicyVersion: 'v1', generatedAt: null, href: '/dashboard', truncated: false, items: [
    { homeActionId: 'washer', title: 'Consider replacing your Washer Dryer.', askQuestion: 'Should I replace my washer dryer?', askCategoryId: 'PLAN_MONITOR', askCategoryLabel: 'Plan', subject: null, consumerPriority: 'PLAN_SOON', comparativeReasonCodes: [], confidenceLabel: 'HIGH', deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false },
    { homeActionId: 'heat', title: 'Heating system inspection', askQuestion: 'Tell me about the heating inspection', askCategoryId: 'MAINTAIN', askCategoryLabel: 'Maintain', subject: null, consumerPriority: 'DO_NOW', comparativeReasonCodes: [], confidenceLabel: 'HIGH', deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false },
  ] },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' },
  decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  landingSpotlight: { kind: 'ATTENTION', entityId: 'heat' }, capabilityGroups: [], featuredPrompts: [], suggestedQuestions: [], ...overrides,
});
const starters = ['Maintain', 'Protect', 'Save', 'Plan', 'Extra'].map((label, index) => ({ id: `s${index}`, categoryId: 'MAINTAIN' as const, categoryLabel: label, question: `${label} question?`, source: 'DISCOVERY' as const }));

describe('CalmLanding', () => {
  it('shows count chips instead of repeating them as a sentence, opens the matching answer from each, and offers no duplicate starters', () => {
    const onAsk = jest.fn();
    const starterList = [{ ...starters[0], id: 'decision-dup', question: 'Help me continue this decision: X' }, ...starters];
    render(<CalmLanding view={view()} loading={false} failed={false} starters={starterList} usingFallbackStarters={false} onAsk={onAsk}><span>explorer</span></CalmLanding>);
    // Chips carry the counts; the sentence is only for when there are no chips.
    expect(screen.queryByText('1 thing needs attention now, and 1 more to plan soon.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^1 to do now/ }));
    expect(onAsk).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'What needs my attention right now?' }), 'ATTENTION');
    // Two "needs attention" lines, then a short row of starters (the duplicate is dropped) and the explorer entry.
    expect(screen.queryByText('Top priority')).toBeNull();
    expect(screen.getByRole('list', { name: 'Needs your attention' }).querySelectorAll('button')).toHaveLength(2);
    const row = screen.getByRole('list', { name: 'Suggestions' });
    expect(row.querySelectorAll('button')).toHaveLength(3);
    expect(row).toHaveTextContent('explorer');
    expect(screen.queryByText('Help me continue this decision: X')).not.toBeNull();
  });

  it('drops a starter that repeats a strip chip or the top priority', () => {
    const repeated = [
      { ...starters[0], id: 'a', question: 'Which home actions should I plan for next?' },
      { ...starters[1], id: 'attention-heat', question: 'Something else?' },
      { ...starters[2], id: 'c', question: 'what needs my attention right now?' },
      { ...starters[3], id: 'd', question: 'A genuinely different question?' },
    ];
    render(<CalmLanding view={view()} loading={false} failed={false} starters={repeated} usingFallbackStarters={false} onAsk={jest.fn()} />);
    const buttons = screen.getByRole('list', { name: 'Suggestions' }).querySelectorAll('button');
    expect(Array.from(buttons).map((button) => button.textContent)).toEqual(['A genuinely different question?']);
    expect(screen.getByRole('list', { name: 'Needs your attention' }).querySelectorAll('button')).toHaveLength(2);
  });

  it('falls back to a sentence when there are no chips', () => {
    const quiet = view({ priorityList: { ...view().priorityList, items: [] }, landingSpotlight: null });
    render(<CalmLanding view={quiet} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    expect(screen.getByText('Nothing needs your attention right now.')).toBeInTheDocument();
  });

  it('is honest while loading and when the overview is unavailable, and never claims the home is fine', () => {
    const { rerender } = render(<CalmLanding view={null} loading failed={false} starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your home…');
    rerender(<CalmLanding view={null} loading={false} failed starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing needs your attention/)).toBeNull();
    rerender(<CalmLanding view={view({ priorityList: { ...view().priorityList, state: 'UNAVAILABLE' } })} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    expect(screen.getByText('Your priorities are temporarily unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing needs your attention/)).toBeNull();
  });
});

describe('FollowUpRow', () => {
  it('asks the chosen follow-up, and is empty while an answer is pending', () => {
    const onPick = jest.fn();
    const { rerender, container } = render(<FollowUpRow suggestions={['Only show overdue tasks', 'Compare the quotes']} disabled={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare the quotes' }));
    expect(onPick).toHaveBeenCalledWith('Compare the quotes');
    rerender(<FollowUpRow suggestions={['Only show overdue tasks']} disabled onPick={onPick} />);
    expect(container.querySelector('[data-follow-up-row]')).toBeNull();
    rerender(<FollowUpRow suggestions={[]} disabled={false} onPick={onPick} />);
    expect(container.querySelector('[data-follow-up-row]')).toBeNull();
  });
});

const nav = () => render(<ConversationHistoryNav items={[]} activeSessionId="s" loading={false} loadingMore={false} hasMore={false} issue={null} openingId={null} query="" scope="THIS_HOME" selectedHomeAvailable
  onQueryChange={jest.fn()} onScopeChange={jest.fn()} onOpen={jest.fn()} onNew={jest.fn()} onLoadMore={jest.fn()} backHref="/dashboard" backLabel="Back to Home" />);

describe('ConversationHistoryNav in the calm shell', () => {
  beforeEach(() => window.localStorage.clear());
  it('drops the brand block and the explanatory footer, and keeps the controls', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    nav();
    expect(await screen.findByRole('button', { name: 'New Ask Cozy session' })).toBeInTheDocument();
    expect(screen.queryByText('Your home assistant')).toBeNull();
    expect(screen.queryByText(/navigation remains available above/)).toBeNull();
    expect(screen.getByPlaceholderText('Search conversations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Home/ })).toBeInTheDocument();
  });
  it('keeps the current copy when the setting is off', () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    nav();
    expect(screen.getByText('Your home assistant')).toBeInTheDocument();
    expect(screen.getByText(/navigation remains available above/)).toBeInTheDocument();
  });
});

describe('IntelligenceRefreshStatus compact', () => {
  it('shows a dot with the state label beside it on wide screens instead of the badge', async () => {
    jest.spyOn(api, 'getPropertyIntelligenceRefreshDetails').mockResolvedValue({ state: 'PARTIALLY_REFRESHED', capabilities: [] } as unknown as Awaited<ReturnType<typeof api.getPropertyIntelligenceRefreshDetails>>);
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { container } = render(<QueryClientProvider client={new QueryClient()}><IntelligenceRefreshStatus propertyId="home" compact /></QueryClientProvider>);
    const summary = await screen.findByLabelText(/Partially refreshed/);
    expect(summary).toHaveAttribute('title', 'Partially refreshed');
    expect(container.querySelector('span.rounded-full.bg-amber-500')).not.toBeNull();
    // The plain label shows beside the dot on wide screens (IW-CONV-009/014); it is hidden from assistive tech because the summary already carries it.
    const label = screen.getByText('Partially refreshed');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(label.className).toContain('md:inline');
  });
});
