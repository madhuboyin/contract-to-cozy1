import { expect, test } from '@playwright/test';
import { contract, installAskContext, propertyId, stripUpgradeInsecure } from './fixtures';
import { installConversations, openAndAsk, type Body } from './conversationFixtures';

// Work, Saved and Notifications are answers in the conversation now (FRD v1.1 §1.2), so they are certified as conversations: the old addresses ask the
// question, the server answers, and the card shows it. The answers here are NOT hand-written and NOT captured from a live backend: they are produced by
// apps/backend/scripts/certification/deriveConversationContracts.js, which runs the REAL pure answer builders (workOverviewFromPage, savedResultsFromPage,
// notificationsFromPage) and the REAL mapPersistedExecution over the REAL captured destination pages. `--check` fails when a contract here is out of date.
// Nothing here ran against a live backend, database or worker.
const home = `propertyId=${propertyId}`;

test.beforeEach(async ({ context, page }) => { await installAskContext(context); await stripUpgradeInsecure(page); });

test.describe('Work, Saved and Notifications are conversations', () => {
  test('Work: the old address asks "What needs me?" and the answer lists each piece of work with its next step', async ({ page }) => {
    const api = await installConversations(page);
    await openAndAsk(page, `/dashboard/ask/work?${home}`, 'What needs me?');
    await expect(page.getByText('2 things need you').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Clean the gutters').first()).toBeVisible();
    await expect(page.getByText('Replace furnace filter').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start or schedule this' })).toHaveCount(2);
    expect(api.bodies[0]).toMatchObject({ message: 'What needs me?', propertyId });
  });

  test('Saved: the answer lists each saved result with Open and Archive, and says some kinds could not be read', async ({ page }) => {
    await installConversations(page);
    await openAndAsk(page, `/dashboard/ask/saved?${home}`, 'Show my saved results');
    await expect(page.getByText('Winter 2026 checklist').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Home reference brief').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive' }).first()).toBeVisible();
    await expect(page.getByText(/some kinds could not be read/i).first()).toBeVisible();
  });

  test('Saved: an out-of-date comparison says so, gives the reason, and offers to open and review it', async ({ page }) => {
    await installConversations(page, { saved: 'conversationSavedStale' });
    await openAndAsk(page, `/dashboard/ask/saved?${home}`, 'Show my saved results');
    await expect(page.getByText('HVAC quote comparison').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Out of date').first()).toBeVisible();
    await expect(page.getByText('A quote changed after this was compared.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open and review' }).first()).toBeVisible();
  });

  test('Notifications: each notice offers only what is real, and a lost home is never named', async ({ page }) => {
    await installConversations(page);
    await openAndAsk(page, `/dashboard/ask/notifications?${home}`, "What's new?");
    await expect(page.getByText('4 notifications, 4 unread').first()).toBeVisible({ timeout: 20000 });
    const row = (title: string) => page.getByRole('listitem').filter({ hasText: title });
    await expect(row('Your winter checklist is ready').getByRole('button', { name: 'Open' })).toBeVisible();
    await expect(row('Your claim was submitted').getByRole('button', { name: 'Open' })).toBeVisible();
    // A general update has nothing to open, so it has no dead button; a notice about a home the person lost shows no address.
    await expect(row('General update').getByRole('button', { name: 'Open' })).toHaveCount(0);
    const lost = row('A claim on a former home');
    await expect(lost).toContainText('You no longer have access to this home');
    await expect(lost).not.toContainText('Testville');
    await expect(lost.getByRole('button', { name: 'Open' })).toHaveCount(0);
  });

  test('Notifications: Open continues in the conversation, and Dismiss asks for exactly that notification', async ({ page }) => {
    const api = await installConversations(page);
    await openAndAsk(page, `/dashboard/ask/notifications?${home}`, "What's new?");
    const row = (title: string) => page.getByRole('listitem').filter({ hasText: title });
    await expect(row('General update')).toBeVisible({ timeout: 20000 });
    const general = contract('conversationNotifications').blocks.find((block: { type: string }) => block.type === 'GROUPED_LIST').sections[0].items.find((item: { title: string }) => item.title === 'General update');
    await row('General update').getByRole('button', { name: 'Dismiss' }).click();
    await expect.poll(() => api.bodies.length, { timeout: 15000 }).toBeGreaterThan(1);
    const dismiss = api.bodies.at(-1) as Body;
    expect(dismiss.message).toBe('Dismiss this notification: General update');
    expect(JSON.stringify(dismiss)).toContain(general.id);
    expect(JSON.stringify(dismiss)).toContain('NOTIFICATION_COMMAND');

    await row('Your winter checklist is ready').getByRole('button', { name: 'Open' }).click();
    await expect.poll(() => api.bodies.at(-1)?.message, { timeout: 15000 }).toBe('Show my saved results');
    await expect(page.getByText('Winter 2026 checklist').first()).toBeVisible({ timeout: 15000 });
  });

  test('Notifications: the dismissed view offers to bring each one back', async ({ page }) => {
    await installConversations(page);
    await openAndAsk(page, `/dashboard/ask?${home}&question=${encodeURIComponent('Show dismissed notifications')}`, 'Show dismissed notifications');
    await expect(page.getByText('An old notice').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Bring back' })).toHaveCount(1);
  });
});

test.describe('FR-PERF-001: the conversation chrome does not wait for a slow answer', () => {
  for (const destination of ['work', 'saved', 'record', 'notifications']) {
    test(`${destination}: the header and composer appear at once while the answer takes 3 seconds`, async ({ page }) => {
      await installConversations(page, { slowMs: 3000 });
      const started = Date.now();
      await page.goto(`/dashboard/ask/${destination}?${home}`);
      await expect(page.getByRole('link', { name: 'Ask Cozy Home' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder(/^Ask anything about /).first()).toBeVisible();
      const chromeMs = Date.now() - started;
      expect(chromeMs, `the chrome took ${chromeMs}ms`).toBeLessThan(3000);
    });
  }
});
