import { fireEvent, render, screen } from '@testing-library/react';
import { ConversationHistoryNav, draftStorageKey } from '../AskWorkspace';
import type { AskRecentSessionSummary } from '@/features/ask/types';

const recent: AskRecentSessionSummary = {
  sessionId: 'conversation-one',
  title: 'Roof repair options',
  property: { id: 'home-one', label: 'Main home' },
  latestStatus: 'ANSWERED',
  latestExecutionId: 'execution-one',
  executionCount: 2,
  lastActiveAt: new Date().toISOString(),
};

test('composer drafts are isolated by conversation and property', () => {
  const first = draftStorageKey('home-one', 'conversation-one');
  const second = draftStorageKey('home-one', 'conversation-two');
  const otherHome = draftStorageKey('home-two', 'conversation-one');
  expect(new Set([first, second, otherHome]).size).toBe(3);
  window.localStorage.setItem(first, 'Inspect the roof');
  window.localStorage.setItem(second, 'Compare quotes');
  expect(window.localStorage.getItem(first)).toBe('Inspect the roof');
  expect(window.localStorage.getItem(second)).toBe('Compare quotes');
  window.localStorage.removeItem(first);
  window.localStorage.removeItem(second);
});

test('a failed history refresh keeps loaded conversations visible with an explicit warning', () => {
  render(<ConversationHistoryNav
    items={[recent]}
    activeSessionId={recent.sessionId}
    loading={false}
    loadingMore={false}
    hasMore={false}
    issue="Could not refresh conversations. Previously loaded conversations remain visible; try again later."
    openingId={null}
    onOpen={() => {}}
    onNew={() => {}}
    onLoadMore={() => {}}
  />);
  expect(screen.getByRole('status')).toHaveTextContent('Could not refresh conversations');
  expect(screen.getByRole('button', { name: /Roof repair options/ })).toHaveAttribute('aria-current', 'page');
});

test('older conversation pages are loaded by an explicit accessible control', () => {
  const onLoadMore = jest.fn();
  render(<ConversationHistoryNav
    items={[recent]}
    activeSessionId={recent.sessionId}
    loading={false}
    loadingMore={false}
    hasMore
    issue={null}
    openingId={null}
    onOpen={() => {}}
    onNew={() => {}}
    onLoadMore={onLoadMore}
  />);
  fireEvent.click(screen.getByRole('button', { name: 'Load older conversations' }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  expect(screen.getByPlaceholderText('Filter loaded conversations')).toBeInTheDocument();
});
