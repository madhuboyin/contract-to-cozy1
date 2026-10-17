import { render, screen } from '@testing-library/react';
import { ConversationHistoryNav } from '../AskWorkspace';
import type { AskRecentSessionSummary } from '@/features/ask/types';

// Live review finding 5 (2026-10-16): at 1658x749 the fixed rail controls left the conversation list a 34px-tall scroller,
// so NEEDS YOU pushed every conversation out of view. The controls and the list now share one scroll region and the
// Account footer stays outside it. jsdom has no layout, so this asserts the structure that prevents the squeeze.

const session: AskRecentSessionSummary = {
  sessionId: 'conversation-one', title: 'Roof repair options', property: { id: 'home-one', label: 'Main home' }, latestStatus: 'ANSWERED',
  latestExecutionId: 'execution-one', executionCount: 2, lastActiveAt: new Date().toISOString(), pinned: false, archived: false, titleSetByUser: false,
};

function renderNav() {
  render(<ConversationHistoryNav
    items={[session]} activeSessionId="" loading={false} loadingMore={false} hasMore={false} issue={null} openingId={null} query="" scope="THIS_HOME"
    selectedHomeAvailable onQueryChange={() => {}} onScopeChange={() => {}} onNew={() => {}} onLoadMore={() => {}} onOpen={() => {}}
    accountName="Sarah" onLogout={() => {}}
  />);
}

test('the new-conversation control, the search box and the conversation list share one scroll region', () => {
  renderNav();
  const region = document.querySelector('[data-history-rail-scroll]') as HTMLElement;
  expect(region).not.toBeNull();
  expect(region.className).toContain('overflow-y-auto');
  expect(region).toContainElement(screen.getByRole('button', { name: 'New Ask Cozy session' }));
  expect(region).toContainElement(screen.getByPlaceholderText('Search conversations'));
  expect(region).toContainElement(screen.getByText('Roof repair options'));
});

test('the account footer stays outside the scroll region so it is always reachable', () => {
  renderNav();
  const region = document.querySelector('[data-history-rail-scroll]') as HTMLElement;
  expect(region).not.toContainElement(screen.getByText('Sarah'));
});

test('no nested scroller inside the region can shrink the list again', () => {
  renderNav();
  const region = document.querySelector('[data-history-rail-scroll]') as HTMLElement;
  expect(region.querySelectorAll('.overflow-y-auto').length).toBe(0);
});
