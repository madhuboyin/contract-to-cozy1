import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationHistoryNav } from '../AskWorkspace';
import type { AskRecentSessionSummary } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD IW-HIST-003, IW-HIST-009..012, IW-HIST-014 (FRD v1.71): the history rail's session menu,
// the pinned group and the archived view.

const session = (overrides: Partial<AskRecentSessionSummary> = {}): AskRecentSessionSummary => ({
  sessionId: 'conversation-one',
  title: 'Roof repair options',
  property: { id: 'home-one', label: 'Main home' },
  latestStatus: 'ANSWERED',
  latestExecutionId: 'execution-one',
  executionCount: 2,
  lastActiveAt: new Date().toISOString(),
  pinned: false,
  archived: false,
  titleSetByUser: false,
  ...overrides,
});

function renderNav(props: Partial<Parameters<typeof ConversationHistoryNav>[0]> = {}) {
  const handlers = {
    onOpen: jest.fn(),
    onSessionChange: jest.fn(async () => true),
    onSessionDelete: jest.fn(async () => true),
    onViewChange: jest.fn(),
  };
  render(<ConversationHistoryNav
    items={[session()]}
    activeSessionId=""
    loading={false}
    loadingMore={false}
    hasMore={false}
    issue={null}
    openingId={null}
    query=""
    scope="THIS_HOME"
    selectedHomeAvailable
    onQueryChange={() => {}}
    onScopeChange={() => {}}
    onNew={() => {}}
    onLoadMore={() => {}}
    {...handlers}
    {...props}
  />);
  return handlers;
}

test('the session menu opens without opening the conversation and offers rename, pin, archive and delete', async () => {
  const user = userEvent.setup();
  const { onOpen } = renderNav();
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  expect(onOpen).not.toHaveBeenCalled();
  const menu = await screen.findByRole('menu');
  expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Rename', 'Pin', 'Archive', 'Delete…']);
});

test('rename saves the trimmed title; Escape cancels without saving', async () => {
  const user = userEvent.setup();
  const { onSessionChange } = renderNav();
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const input = screen.getByLabelText('Conversation title');
  await user.clear(input);
  await user.type(input, '  Roof plan  {Enter}');
  expect(onSessionChange).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'conversation-one' }), { title: 'Roof plan' });

  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  await user.type(screen.getByLabelText('Conversation title'), 'x{Escape}');
  expect(onSessionChange).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Conversation title')).not.toBeInTheDocument();
});

test('pin and archive send one change each; a blank title cannot be saved', async () => {
  const user = userEvent.setup();
  const { onSessionChange } = renderNav();
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Pin' }));
  expect(onSessionChange).toHaveBeenLastCalledWith(expect.anything(), { pinned: true });
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
  expect(onSessionChange).toHaveBeenLastCalledWith(expect.anything(), { archived: true });
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  await user.clear(screen.getByLabelText('Conversation title'));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('delete names the conversation and its home, says what stays, and only deletes on confirmation', async () => {
  const user = userEvent.setup();
  const { onSessionDelete } = renderNav();
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
  const confirm = screen.getByRole('group', { name: /^Delete “Roof repair options”/ });
  expect(confirm).toHaveTextContent('Delete “Roof repair options” for Main home? This removes the conversation and its feedback. Home records, tasks, documents and decisions created through Ask stay as they are.');
  expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(onSessionDelete).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
  await user.click(screen.getByRole('button', { name: 'Delete conversation' }));
  expect(onSessionDelete).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'conversation-one' }));
});

test('pinned conversations form their own group first; a pinned one offers Unpin', async () => {
  const user = userEvent.setup();
  renderNav({ pinnedItems: [session({ sessionId: 'pinned-one', title: 'Water heater plan', pinned: true })] });
  const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  expect(headings[0]).toBe('Pinned');
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Water heater plan' }));
  expect(await screen.findByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument();
});

test('the recent view opens the archived view from an explicit control', async () => {
  const user = userEvent.setup();
  const { onViewChange } = renderNav();
  await user.click(screen.getByRole('button', { name: 'Archived conversations' }));
  expect(onViewChange).toHaveBeenCalledWith('ARCHIVED');
});

test('in the archived view a conversation can be restored, and the empty state says so', async () => {
  const user = userEvent.setup();
  const { onViewChange, onSessionChange } = renderNav({ view: 'ARCHIVED', items: [session({ archived: true })] });
  expect(screen.queryByPlaceholderText('Search conversations')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Conversation actions for Roof repair options' }));
  const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
  expect(items).toEqual(['Rename', 'Restore', 'Delete…']);
  await user.click(screen.getByRole('menuitem', { name: 'Restore' }));
  expect(onSessionChange).toHaveBeenCalledWith(expect.anything(), { archived: false });
  await user.click(screen.getByRole('button', { name: 'Back to recent' }));
  expect(onViewChange).toHaveBeenCalledWith('RECENT');
});

test('an empty archived view says there is nothing archived', () => {
  renderNav({ view: 'ARCHIVED', items: [] });
  expect(screen.getByText('No archived conversations.')).toBeInTheDocument();
});
