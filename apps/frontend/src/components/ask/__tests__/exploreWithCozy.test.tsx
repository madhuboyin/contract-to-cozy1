import React, { useRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExploreDisclosure, ExploreFocusedView, ExploreRailGroup, indicatorText, useExploreFocus, type ExploreState } from '../workspace/ExploreWithCozy';
import { CollapsedConversationRail } from '../workspace/CollapsedConversationRail';
import { ConversationHistoryNav } from '../workspace/ConversationHistoryNav';
import type { AskDiscoveryStarter, AskDiscoveryTopic } from '@/features/ask/types';

// Explore with Cozy, Phase 2 (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md). The real components and hook run;
// the harness stands in for AskWorkspace's wiring (a hidden-not-unmounted conversation, one `send` per starter).
const starter = (id: string, operationId: string, overrides: Partial<AskDiscoveryStarter> = {}): AskDiscoveryStarter => ({
  id, label: `Label ${id}`, message: `Message ${id}`, operationId, interactionType: 'CONVERSATION_CONTINUE', availability: 'AVAILABLE', reasonCodes: [], entityContext: { propertyId: 'home-1' }, ...overrides,
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
  const start = (s: AskDiscoveryStarter) => { explore.close(); send({ message: s.message, operationId: s.operationId, propertyId: s.entityContext?.propertyId }); };
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
});

describe('Explore with Cozy indicators', () => {
  const indicator = (value: number | string, label: string, freshness: 'CURRENT' | 'STALE' | 'UNAVAILABLE' = 'CURRENT') => ({ label, value, sourceVersion: 'v1', freshness });

  it('formats the three approved indicators and leaves out zero, stale, unavailable and absent ones', () => {
    expect(indicatorText(indicator(3, 'need attention'))).toBe('3 need attention');
    expect(indicatorText(indicator(2, 'active'))).toBe('2 active');
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
