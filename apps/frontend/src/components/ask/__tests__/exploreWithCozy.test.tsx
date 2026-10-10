import React, { useRef } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ExploreDisclosure, ExploreFocusedView, ExploreRailGroup, ExploreTargetPicker, indicatorText, useExploreFocus, type ExploreState } from '../workspace/ExploreWithCozy';
import { CollapsedConversationRail } from '../workspace/CollapsedConversationRail';
import { ConversationHistoryNav } from '../workspace/ConversationHistoryNav';
import type { AskDiscoveryStarter, AskDiscoveryTopic, AskTargetOption, AskTargetSelection } from '@/features/ask/types';

// Explore with Cozy, Phase 2 (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md). The real components and hook run;
// the harness stands in for AskWorkspace's wiring (a hidden-not-unmounted conversation, one `send` per starter).
const starter = (id: string, operationId: string, overrides: Partial<AskDiscoveryStarter> = {}): AskDiscoveryStarter => ({
  id, entryId: `entry-${id}`, capabilityId: `cap-${id}`, selectorId: null, label: `Label ${id}`, message: `Message ${id}`, operationId, interactionType: 'CONVERSATION_CONTINUE', availability: 'AVAILABLE', reasonCodes: [], entityContext: { propertyId: 'home-1' }, ...overrides,
});
const topics: AskDiscoveryTopic[] = [
  { id: 'DIY_PROJECTS', label: 'DIY & Projects', order: 2, indicator: null, starters: [starter('diy-active', 'DIY_PROJECTS')] },
  { id: 'HOME_CARE', label: 'Home care', order: 1, indicator: null, starters: [starter('care-a', 'HOME_ACTIONS'), starter('care-b', 'SEASONAL_HOME_CARE', { interactionType: 'START_WORKFLOW' }), starter('care-locked', 'MAINTENANCE_STATUS', { availability: 'UNAVAILABLE', reasonCodes: ['ASK_PERMISSION_REQUIRED'] })] },
  { id: 'HOME_RECORD', label: 'My Home Record', order: 3, indicator: null, starters: [] },
];
const loaded: ExploreState = { topics, loading: false, failed: false };

function Harness({ state = loaded, send, navigate }: { state?: ExploreState; send: (request: unknown) => void; navigate: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const explore = useExploreFocus(scrollRef, 'home-1');
  const start = (s: AskDiscoveryStarter) => { explore.close({ launched: true }); send({ message: s.message, operationId: s.operationId, propertyId: s.entityContext?.propertyId }); };
  return (
    <div>
      <nav aria-label="rail"><ExploreRailGroup state={state} activeTopicId={explore.focus} onOpen={explore.open} moreIdeas={<button type="button">More ideas</button>} /></nav>
      <ExploreDisclosure state={state} activeTopicId={explore.focus} onOpen={explore.open} />
      <div ref={scrollRef} data-testid="scroll" style={{ overflow: 'auto' }}>
        {explore.focus && <ExploreFocusedView topics={state.topics} topicId={explore.focus} busy={false} onSelectTopic={(id) => explore.open(id)} onStart={start} onClose={explore.close} />}
        <div className={explore.focus ? 'hidden' : 'contents'} data-testid="conversation"><textarea aria-label="draft" defaultValue="" /><p>Pending confirmation</p><a href="/elsewhere" onClick={navigate}>elsewhere</a></div>
      </div>
    </div>
  );
}

describe('Explore with Cozy', () => {
  it('lists the topics in server order, and a topic click sends nothing and navigates nowhere', () => {
    const send = jest.fn(); const navigate = jest.fn();
    render(<Harness send={send} navigate={navigate} />);
    const rail = screen.getByRole('region', { name: 'Explore with Cozy' });
    expect(within(rail).getAllByRole('button').map((b) => b.textContent)).toEqual(['Home care', 'DIY & Projects', 'My Home Record', 'More ideas']);
    fireEvent.click(within(rail).getByRole('button', { name: 'Home care' }));
    expect(screen.getByRole('heading', { name: 'Home care' })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[href]')).toHaveLength(1);
  });

  it('a starter click sends exactly one request with its operation, message and property, then returns to Ask home', () => {
    const send = jest.fn();
    render(<Harness send={send} navigate={jest.fn()} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Explore with Cozy' })).getByRole('button', { name: 'Home care' }));
    fireEvent.click(screen.getByRole('button', { name: 'Label care-b' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ message: 'Message care-b', operationId: 'SEASONAL_HOME_CARE', propertyId: 'home-1' });
    expect(screen.queryByRole('heading', { name: 'Home care' })).toBeNull();
  });

  it('"Not now" restores Ask home with the draft, pending workflow and scroll position intact, and returns focus to the trigger', () => {
    render(<Harness send={jest.fn()} navigate={jest.fn()} />);
    const scroll = screen.getByTestId('scroll');
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'half-typed question' } });
    scroll.scrollTop = 240;
    const trigger = within(screen.getByRole('region', { name: 'Explore with Cozy' })).getByRole('button', { name: 'DIY & Projects' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId('conversation')).toHaveClass('hidden');
    scroll.scrollTop = 0; // the hidden conversation collapses the container
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByTestId('conversation')).not.toHaveClass('hidden');
    expect(screen.getByLabelText('draft')).toHaveValue('half-typed question');
    expect(screen.getByText('Pending confirmation')).toBeInTheDocument();
    expect(scroll.scrollTop).toBe(240);
    expect(trigger).toHaveFocus();
  });

  it('switching topics inside the focused view sends nothing', () => {
    const send = jest.fn();
    render(<Harness send={send} navigate={jest.fn()} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Explore with Cozy' })).getByRole('button', { name: 'Home care' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Topics' })).getByRole('button', { name: 'DIY & Projects' }));
    expect(screen.getByRole('heading', { name: 'DIY & Projects' })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('degrades honestly: an unavailable starter is disabled with a reason, an empty topic says so, and failure keeps a quiet notice', () => {
    const send = jest.fn();
    const { rerender } = render(<Harness send={send} navigate={jest.fn()} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Explore with Cozy' })).getByRole('button', { name: 'Home care' }));
    const locked = screen.getByRole('button', { name: /Label care-locked/ });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleDescription('Needs more access to this home.');
    fireEvent.click(locked);
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Topics' })).getByRole('button', { name: 'My Home Record' }));
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to suggest here right now');
    rerender(<Harness state={{ topics: [], loading: false, failed: true }} send={send} navigate={jest.fn()} />);
    expect(screen.getAllByText(/Ideas are unavailable right now/).length).toBeGreaterThan(0);
  });

  it('the narrow-screen disclosure is one collapsed-by-default toggle, not a dialog, and opens the same focused view', () => {
    const send = jest.fn();
    render(<Harness send={send} navigate={jest.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Explore with Cozy' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById('ask-explore-disclosure-panel') as HTMLElement;
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Home care' }));
    expect(screen.getByRole('heading', { name: 'Home care' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(send).not.toHaveBeenCalled();
  });

  it('the collapsed rail still exposes discovery', () => {
    const onExplore = jest.fn();
    render(<CollapsedConversationRail loggingOut={false} onNew={jest.fn()} onExpand={jest.fn()} onExplore={onExplore} onLogout={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore with Cozy' }));
    expect(onExplore).toHaveBeenCalledTimes(1);
  });

  it('the expanded history rail renders the discovery slot apart from New conversation and search', () => {
    render(<ConversationHistoryNav items={[]} activeSessionId="" loading={false} loadingMore={false} hasMore={false} issue={null} openingId={null} query="" scope="THIS_HOME" selectedHomeAvailable
      onQueryChange={jest.fn()} onScopeChange={jest.fn()} onOpen={jest.fn()} onNew={jest.fn()} onLoadMore={jest.fn()} discoverySlot={<p>discovery group</p>} />);
    const nav = screen.getByRole('navigation', { name: 'Ask Cozy conversations' });
    const children = Array.from(nav.children);
    const slot = children.findIndex((child) => child.textContent === 'discovery group');
    expect(slot).toBeGreaterThan(0);
    expect(children[slot - 1]).toContainElement(screen.getByRole('button', { name: 'New Ask Cozy session' }));
  });

  describe('browser history', () => {
    const rail = () => within(screen.getByRole('region', { name: 'Explore with Cozy' }));
    const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    beforeEach(() => { window.history.replaceState(null, '', '/dashboard/ask'); });

    it('opening a topic adds one history entry, and Back closes the view without leaving the page', async () => {
      render(<Harness send={jest.fn()} navigate={jest.fn()} />);
      const before = window.history.length;
      fireEvent.click(rail().getByRole('button', { name: 'Home care' }));
      expect(window.history.length).toBe(before + 1);
      act(() => { window.history.back(); });
      await settle();
      expect(screen.queryByRole('heading', { name: 'Home care' })).toBeNull();
      expect(window.location.pathname).toBe('/dashboard/ask');
    });

    it('Forward reopens the topic that Back closed', async () => {
      render(<Harness send={jest.fn()} navigate={jest.fn()} />);
      fireEvent.click(rail().getByRole('button', { name: 'DIY & Projects' }));
      act(() => { window.history.back(); });
      await settle();
      act(() => { window.history.forward(); });
      await settle();
      expect(screen.getByRole('heading', { name: 'DIY & Projects' })).toBeInTheDocument();
    });

    it('switching topics inside the view replaces the entry, so one Back closes the view', async () => {
      render(<Harness send={jest.fn()} navigate={jest.fn()} />);
      fireEvent.click(rail().getByRole('button', { name: 'Home care' }));
      const afterOpen = window.history.length;
      fireEvent.click(rail().getByRole('button', { name: 'DIY & Projects' }));
      expect(window.history.length).toBe(afterOpen);
      act(() => { window.history.back(); });
      await settle();
      expect(screen.queryByRole('heading', { name: 'DIY & Projects' })).toBeNull();
    });

    it('"Not now" pops the entry it pushed, leaving no closed-view entry behind', async () => {
      render(<Harness send={jest.fn()} navigate={jest.fn()} />);
      fireEvent.click(rail().getByRole('button', { name: 'Home care' }));
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      await settle();
      expect(screen.queryByRole('heading', { name: 'Home care' })).toBeNull();
      expect(window.history.state?.askExploreFocus).toBeUndefined();
    });

    it('a starter launch never calls history.back (the launch writes its own URL) and strips the topic from the entry in place', async () => {
      const back = jest.spyOn(window.history, 'back');
      render(<Harness send={jest.fn()} navigate={jest.fn()} />);
      fireEvent.click(rail().getByRole('button', { name: 'Home care' }));
      fireEvent.click(screen.getByRole('button', { name: 'Label care-a' }));
      await settle();
      expect(back).not.toHaveBeenCalled();
      expect(window.history.state?.askExploreFocus).toBeUndefined();
      back.mockRestore();
    });

    it('does not reopen a topic from an entry that belongs to a different home', () => {
      render(<Harness send={jest.fn()} navigate={jest.fn()} />);
      act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { askExploreFocus: { topicId: 'HOME_CARE', homeKey: 'home-2' } } })); });
      expect(screen.queryByRole('heading', { name: 'Home care' })).toBeNull();
    });
  });
});

describe('Explore with Cozy indicators', () => {
  const indicator = (value: number | string, label: string, freshness: 'CURRENT' | 'STALE' | 'UNAVAILABLE' = 'CURRENT') => ({ label, value, sourceVersion: 'v1', freshness });

  it('formats the three approved indicators and leaves out zero, stale, unavailable and absent ones', () => {
    expect(indicatorText(indicator(3, 'need attention'))).toBe('3 need attention');
    expect(indicatorText(indicator(2, 'active'))).toBe('2 active');
    expect(indicatorText(indicator(1, 'need attention'))).toBe('1 needs attention');
    expect(indicatorText(indicator(1, 'active'))).toBe('1 active');
    expect(indicatorText(indicator('72%', 'complete'))).toBe('72% complete');
    expect(indicatorText(indicator('0%', 'complete'))).toBe('0% complete');
    expect(indicatorText(indicator(0, 'need attention'))).toBeNull();
    expect(indicatorText(indicator(3, 'need attention', 'STALE'))).toBeNull();
    expect(indicatorText(indicator(3, 'need attention', 'UNAVAILABLE'))).toBeNull();
    expect(indicatorText(null)).toBeNull();
  });

  it('shows an indicator beside its topic in the rail and under its heading, and an omitted one never removes the topic or its starters', () => {
    const withIndicators: ExploreState = { ...loaded, topics: [
      { ...topics[1], indicator: indicator(3, 'need attention') },
      { ...topics[0], indicator: indicator(2, 'active') },
      { ...topics[2], indicator: null },
    ] };
    render(<Harness state={withIndicators} send={jest.fn()} navigate={jest.fn()} />);
    const rail = screen.getByRole('region', { name: 'Explore with Cozy' });
    expect(within(rail).getByRole('button', { name: /^Home care/ })).toHaveTextContent('Home care3 need attention');
    expect(within(rail).getByRole('button', { name: /^DIY & Projects/ })).toHaveTextContent('DIY & Projects2 active');
    expect(within(rail).getByRole('button', { name: /^My Home Record/ })).not.toHaveTextContent(/complete|active|attention/);
    fireEvent.click(within(rail).getByRole('button', { name: /^Home care/ }));
    expect(document.querySelector('[data-ask-explore="focused"] p[data-explore-indicator]')).toHaveTextContent('3 need attention');
    expect(screen.getByRole('button', { name: 'Label care-a' })).toBeEnabled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Topics' })).getByRole('button', { name: 'My Home Record' }));
    expect(screen.getByRole('heading', { name: 'My Home Record' })).toBeInTheDocument();
    expect(document.querySelector('[data-ask-explore="focused"] p[data-explore-indicator]')).toBeNull();
  });
});

describe('Explore with Cozy visibility', () => {
  const originalObserver = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  afterEach(() => { (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = originalObserver; });

  function installObserver() {
    const observers: Array<{ callback: (entries: Array<{ isIntersecting: boolean }>) => void; disconnected: boolean }> = [];
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      record: { callback: (entries: Array<{ isIntersecting: boolean }>) => void; disconnected: boolean };
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { this.record = { callback, disconnected: false }; observers.push(this.record); }
      observe() {}
      disconnect() { this.record.disconnected = true; }
    };
    return { observers, show: () => observers.filter((o) => !o.disconnected).forEach((o) => o.callback([{ isIntersecting: true }])), hide: () => observers.filter((o) => !o.disconnected).forEach((o) => o.callback([{ isIntersecting: false }])) };
  }

  it('reports the rail topics only once they are on screen, and only once', () => {
    const io = installObserver();
    const onVisible = jest.fn();
    const { rerender } = render(<ExploreRailGroup state={loaded} activeTopicId={null} onOpen={jest.fn()} onVisible={onVisible} />);
    expect(onVisible).not.toHaveBeenCalled();
    io.hide();
    expect(onVisible).not.toHaveBeenCalled();
    io.show();
    expect(onVisible).toHaveBeenCalledTimes(1);
    rerender(<ExploreRailGroup state={{ ...loaded }} activeTopicId={null} onOpen={jest.fn()} onVisible={onVisible} />);
    io.show();
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('never reports topics that were not returned (loading or failed) or a collapsed disclosure', () => {
    installObserver();
    const onVisible = jest.fn();
    render(<ExploreRailGroup state={{ topics: [], loading: true, failed: false }} activeTopicId={null} onOpen={jest.fn()} onVisible={onVisible} />);
    const onPanelVisible = jest.fn();
    render(<ExploreDisclosure state={loaded} activeTopicId={null} onOpen={jest.fn()} onPanelVisible={onPanelVisible} />);
    expect(onVisible).not.toHaveBeenCalled();
    expect(onPanelVisible).not.toHaveBeenCalled();
  });

  it('reports the disclosure topics only after it is expanded and on screen', () => {
    const io = installObserver();
    const onPanelVisible = jest.fn();
    render(<ExploreDisclosure state={loaded} activeTopicId={null} onOpen={jest.fn()} onPanelVisible={onPanelVisible} />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore with Cozy' }));
    expect(onPanelVisible).not.toHaveBeenCalled();
    io.show();
    expect(onPanelVisible).toHaveBeenCalledTimes(1);
  });

  it('reports a topic\'s starters once they are on screen, per topic', () => {
    const io = installObserver();
    const onStartersVisible = jest.fn();
    const { rerender } = render(<ExploreFocusedView topics={topics} topicId="HOME_CARE" busy={false} onSelectTopic={jest.fn()} onStart={jest.fn()} onClose={jest.fn()} onStartersVisible={onStartersVisible} />);
    expect(onStartersVisible).not.toHaveBeenCalled();
    io.show();
    expect(onStartersVisible).toHaveBeenCalledTimes(1);
    expect(onStartersVisible).toHaveBeenCalledWith('HOME_CARE', topics.find((t) => t.id === 'HOME_CARE')!.starters);
    rerender(<ExploreFocusedView topics={topics} topicId="DIY_PROJECTS" busy={false} onSelectTopic={jest.fn()} onStart={jest.fn()} onClose={jest.fn()} onStartersVisible={onStartersVisible} />);
    io.show();
    expect(onStartersVisible).toHaveBeenLastCalledWith('DIY_PROJECTS', topics.find((t) => t.id === 'DIY_PROJECTS')!.starters);
    expect(onStartersVisible).toHaveBeenCalledTimes(2);
  });
});

describe('ExploreTargetPicker (IW-SHELL-022)', () => {
  const starterForPicker = starter('add-detail', 'PROPERTY_CONTEXT_AREA_CAPTURE', { interactionType: 'SELECT_TARGET', selectorId: 'PROPERTY_AREA' });
  const option = (targetId: string, over: Partial<AskTargetOption> = {}): AskTargetOption => ({
    targetId, label: `Area ${targetId}`, summary: '2 details to add', availability: 'AVAILABLE', reasonCodes: [],
    launch: { operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', message: `Fill in ${targetId}.`, entityType: 'PROPERTY_CONTEXT_AREA', entityId: targetId }, ...over,
  });
  const selection = (over: Partial<AskTargetSelection> = {}): AskTargetSelection => ({
    selectorId: 'PROPERTY_AREA', propertyId: 'home-1', state: 'OPTIONS', title: 'Which part of your home record?', options: [option('SYSTEMS')], explanation: null, truncated: false, generatedAt: '2026-10-10T00:00:00.000Z', ...over,
  });
  const mount = (selector: Parameters<typeof ExploreTargetPicker>[0]['selector'], busy = false) => {
    const handlers = { onChoose: jest.fn(), onCancel: jest.fn(), onRetry: jest.fn() };
    render(<ExploreTargetPicker selector={selector} topicLabel="My Home Record" busy={busy} {...handlers} />);
    return handlers;
  };

  it('a single option is still an explicit choice: showing it launches nothing, and clicking it launches that option once', () => {
    const handlers = mount({ starter: starterForPicker, status: 'ready', selection: selection() });
    expect(screen.getByRole('heading', { name: 'Which part of your home record?' })).toBeInTheDocument();
    expect(handlers.onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Area SYSTEMS/ }));
    expect(handlers.onChoose).toHaveBeenCalledTimes(1);
    expect(handlers.onChoose).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'SYSTEMS' }));
  });

  it('an unavailable option is disabled and says why; an available one beside it still works', () => {
    const handlers = mount({ starter: starterForPicker, status: 'ready', selection: selection({ options: [option('SAFETY', { availability: 'UNAVAILABLE', reasonCodes: ['ASK_PERMISSION_REQUIRED'] }), option('CORE')] }) });
    const locked = screen.getByRole('button', { name: /Area SAFETY/ });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleDescription('Needs more access to this home.');
    fireEvent.click(locked);
    expect(handlers.onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Area CORE/ }));
    expect(handlers.onChoose).toHaveBeenCalledTimes(1);
  });

  it('options are disabled while a request is in flight', () => {
    mount({ starter: starterForPicker, status: 'ready', selection: selection() }, true);
    expect(screen.getByRole('button', { name: /Area SYSTEMS/ })).toBeDisabled();
  });

  it('nothing eligible is an honest explanation with a way back, not a failure', () => {
    const handlers = mount({ starter: starterForPicker, status: 'ready', selection: selection({ state: 'NONE_ELIGIBLE', options: [], explanation: 'Nothing is missing in any area right now, so there is nothing to add.' }) });
    expect(document.querySelector('[data-explore-picker-state="none"]')).toHaveTextContent('nothing to add');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to My Home Record' }));
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it('a source that could not be read, and a request that failed, are each shown as unavailable with a retry, never as "nothing to choose"', () => {
    for (const selector of [
      { starter: starterForPicker, status: 'ready' as const, selection: selection({ state: 'UNAVAILABLE', options: [], explanation: 'Your home record could not be checked right now. Nothing has changed. Try again in a moment.' }) },
      { starter: starterForPicker, status: 'failed' as const },
    ]) {
      const { unmount } = render(<ExploreTargetPicker selector={selector} topicLabel="My Home Record" busy={false} onChoose={jest.fn()} onCancel={jest.fn()} onRetry={jest.fn()} />);
      expect(document.querySelector('[data-explore-picker-state="unavailable"]')).not.toBeNull();
      expect(document.querySelector('[data-explore-picker-state="none"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      unmount();
    }
  });

  it('loading is announced, offers no options, and still allows going back; a truncated list says so', () => {
    const handlers = mount({ starter: starterForPicker, status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Checking your home');
    expect(screen.queryAllByRole('button').map((button) => button.textContent)).toEqual(['Back to My Home Record']);
    fireEvent.click(screen.getByRole('button', { name: 'Back to My Home Record' }));
    expect(handlers.onCancel).toHaveBeenCalled();
    render(<ExploreTargetPicker selector={{ starter: starterForPicker, status: 'ready', selection: selection({ truncated: true }) }} topicLabel="X" busy={false} onChoose={jest.fn()} onCancel={jest.fn()} onRetry={jest.fn()} />);
    expect(screen.getByText('Showing the most recent ones.')).toBeInTheDocument();
  });

  it('the focused view shows the picker in place of the starters while a selector is open, and Not now still closes everything', () => {
    const onClose = jest.fn();
    const withSelector: AskDiscoveryTopic[] = [{ ...topics[2], starters: [starterForPicker] }];
    render(<ExploreFocusedView topics={withSelector} topicId="HOME_RECORD" busy={false} onSelectTopic={jest.fn()} onStart={jest.fn()} onClose={onClose}
      selector={{ starter: starterForPicker, status: 'ready', selection: selection() }} onChooseTarget={jest.fn()} onCancelSelector={jest.fn()} onRetrySelector={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Label add-detail' })).toBeNull();
    expect(screen.getByRole('button', { name: /Area SYSTEMS/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
