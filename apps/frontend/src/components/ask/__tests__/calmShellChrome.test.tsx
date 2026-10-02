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
    { homeActionId: 'washer', title: 'Consider replacing your Washer Dryer.', askQuestion: 'Should I replace my washer dryer?', askCategoryId: 'PLAN_MONITOR', askCategoryLabel: 'Plan', subject: null, rawPriority: 'SOON', consumerPriority: 'PLAN_SOON', comparativeReasonCodes: [], confidenceLabel: 'HIGH', deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false },
    { homeActionId: 'heat', title: 'Heating system inspection', askQuestion: 'Tell me about the heating inspection', askCategoryId: 'MAINTAIN', askCategoryLabel: 'Maintain', subject: null, rawPriority: 'NOW', consumerPriority: 'DO_NOW', comparativeReasonCodes: [], confidenceLabel: 'HIGH', deadlineAt: null, cta: null, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false },
  ] },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' },
  decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  homeContinuity: { state: 'AVAILABLE', decisions: [], activeMajorMoment: null },
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
    fireEvent.click(screen.getByRole('button', { name: /^What needs attention/ }));
    expect(onAsk).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'Show me what needs attention now or soon' }), 'ATTENTION');
    // Two "needs attention" lines, then a short row of starters (the duplicate is dropped) and the explorer entry.
    expect(screen.queryByText('Top priority')).toBeNull();
    expect(screen.getByRole('list', { name: 'Home priorities' }).querySelectorAll('[data-strip-chip]')).toHaveLength(2);
    const row = screen.getByRole('list', { name: 'Suggestions' });
    expect(row.querySelectorAll('button')).toHaveLength(3);
    expect(row).toHaveTextContent('explorer');
    expect(screen.queryByText('Help me continue this decision: X')).not.toBeNull();
  });

  it('drops a starter that repeats a strip chip or the top priority', () => {
    const repeated = [
      { ...starters[0], id: 'a', question: 'Show me what I should plan ahead for' },
      { ...starters[1], id: 'attention-heat', question: 'Something else?' },
      { ...starters[2], id: 'c', question: 'show me what needs attention now or soon' },
      { ...starters[3], id: 'd', question: 'A genuinely different question?' },
    ];
    render(<CalmLanding view={view()} loading={false} failed={false} starters={repeated} usingFallbackStarters={false} onAsk={jest.fn()} />);
    const buttons = screen.getByRole('list', { name: 'Suggestions' }).querySelectorAll('button');
    expect(Array.from(buttons).map((button) => button.textContent)).toEqual(['A genuinely different question?']);
    expect(screen.getByRole('list', { name: 'Home priorities' }).querySelectorAll('[data-strip-chip]')).toHaveLength(2);
  });

  it('keeps both quiet dashboard sections when there are no priority items', () => {
    const quiet = view({ priorityList: { ...view().priorityList, items: [] }, landingSpotlight: null });
    render(<CalmLanding view={quiet} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    expect(screen.getByText('Nothing needs attention right now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /What needs attention/ })).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /Plan ahead/ })).toHaveTextContent('0');
    expect(screen.getByRole('heading', { name: 'Decisions to make' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Active major moment' })).toBeInTheDocument();
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

  it('shows dashboard-parity decisions and active major moment below the Ask entry point', () => {
    const onAsk = jest.fn();
    render(<CalmLanding view={view({
      homeContinuity: {
        state: 'AVAILABLE',
        decisions: [{
          id: 'decision-1',
          title: 'Choose furnace repair or replacement',
          summary: 'Compare the long-term cost.',
          href: '/dashboard/properties/home/home-operations?action=decision-1',
          askQuestion: 'What should I do next for “Choose furnace repair or replacement”?',
          askCategoryId: 'MAINTAIN',
          askCategoryLabel: 'Maintain',
        }],
        activeMajorMoment: { kind: 'PROJECT', id: 'project-1', title: 'Roof repair', stage: 'IN_PROGRESS', context: null, blocker: 'Waiting for provider selection', nextMilestone: 'Select a contractor', href: '/dashboard/properties/home/projects/project-1' },
      },
    })} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={onAsk} />);
    const continuity = screen.getByRole('region', { name: 'Decisions and active work' });
    expect(continuity).toHaveTextContent('Decisions to make');
    expect(continuity).toHaveTextContent('Choose furnace repair or replacement');
    fireEvent.click(screen.getByRole('button', { name: /Choose furnace repair or replacement/ }));
    expect(onAsk).toHaveBeenCalledWith(expect.objectContaining({
      question: 'What should I do next for “Choose furnace repair or replacement”?',
      context: { propertyId: 'home', actionId: 'decision-1' },
    }), 'DECISION');
    expect(screen.queryByRole('link', { name: /Choose furnace repair or replacement/ })).toBeNull();
    expect(continuity).toHaveTextContent('Active major moment');
    expect(continuity).toHaveTextContent('Roof repair');
    expect(continuity).toHaveTextContent('Waiting for provider selection');
    expect(screen.getByRole('link', { name: /^Continue/ })).toHaveAttribute('href', '/dashboard/properties/home/projects/project-1');
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

const nav = (overrides: Record<string, unknown> = {}) => render(<ConversationHistoryNav items={[]} activeSessionId="s" loading={false} loadingMore={false} hasMore={false} issue={null} openingId={null} query="" scope="THIS_HOME" selectedHomeAvailable
  onQueryChange={jest.fn()} onScopeChange={jest.fn()} onOpen={jest.fn()} onNew={jest.fn()} onLoadMore={jest.fn()} backHref="/dashboard" backLabel="Back to Home" accountName="Ada Homeowner" accountEmail="ada@example.com" onLogout={jest.fn()} {...overrides} />);

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
    expect(screen.getByText('Ada Homeowner')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
  it('keeps the current copy when the setting is off', () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    nav();
    expect(screen.getByText('Your home assistant')).toBeInTheDocument();
    expect(screen.getByText(/navigation remains available above/)).toBeInTheDocument();
  });
  it('shows at most two actionable conversations under Needs you and removes their duplicate history rows', () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const onResumePending = jest.fn();
    const recent = (sessionId: string, title: string) => ({ sessionId, title, property: { id: 'home', label: 'Home' }, latestStatus: 'NEEDS_CONFIRMATION', latestExecutionId: `e-${sessionId}`, executionCount: 1, lastActiveAt: new Date().toISOString(), pinned: false, archived: false, titleSetByUser: false });
    const pending = (sessionId: string, question: string) => ({ pendingKind: 'CONFIRMATION', actionLabel: 'Review and confirm', execution: { executionId: `e-${sessionId}`, sessionId, question } });
    nav({ items: [recent('s1', 'Finish task setup'), recent('s4', 'Ordinary recent chat')], pendingWork: [pending('s1', 'Finish task setup'), pending('s2', 'Add the purchase date'), pending('s3', 'Third pending item')], onResumePending });
    expect(screen.getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
    expect(screen.getAllByText('Finish task setup')).toHaveLength(1);
    expect(screen.getByText('Add the purchase date')).toBeInTheDocument();
    expect(screen.queryByText('Third pending item')).toBeNull();
    expect(screen.getByText('Ordinary recent chat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Finish task setup/ }));
    expect(onResumePending).toHaveBeenCalledWith(expect.objectContaining({ execution: expect.objectContaining({ sessionId: 's1' }) }));
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

// ACUI-002: "Why this appeared" comes only from governed fields, opens in place, and never touches the launch or the composer.
describe('CalmLanding "Why this appeared"', () => {
  const withDeadline = () => view({ priorityList: { ...view().priorityList, items: view().priorityList.items.map((entry) => entry.homeActionId === 'heat' ? { ...entry, deadlineAt: '2026-10-03T00:00:00.000Z', comparativeReasonCodes: ['HIGHER_URGENCY', 'STABLE_TIE_BREAK'] } : entry) } });

  it('is closed by default, opens and closes per entry, and lists the governed reasons', () => {
    const onAsk = jest.fn();
    render(<><textarea aria-label="composer" defaultValue="half-typed" /><CalmLanding view={withDeadline()} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={onAsk} /></>);
    const toggles = screen.getAllByRole('button', { name: 'Why this appeared' });
    expect(toggles.length).toBeGreaterThan(0);
    const panel = () => document.querySelector('[data-why-panel]') as HTMLElement;
    expect(panel()).not.toBeVisible();
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
    fireEvent.change(screen.getByLabelText('composer'), { target: { value: 'half-typed question' } });
    fireEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(onAsk).not.toHaveBeenCalled();
    expect(screen.getByLabelText('composer')).toHaveValue('half-typed question');
    fireEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('cites the due date and ranking reasons, and drops codes a homeowner cannot use', () => {
    render(<CalmLanding view={withDeadline()} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    const text = Array.from(document.querySelectorAll('[data-why-panel]')).map((node) => node.textContent).join(' | ');
    expect(text).toContain('is due Oct 3.');
    expect(text).toContain('It is more urgent than the next item.');
    expect(text).not.toMatch(/tie.?break/i);
  });

  it('shows no toggle when no explanation can be derived', () => {
    const bare = view({ priorityList: { ...view().priorityList, items: [] }, changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' } });
    render(<CalmLanding view={bare} loading={false} failed={false} starters={[]} usingFallbackStarters onAsk={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Why this appeared' })).toBeNull();
  });
});
