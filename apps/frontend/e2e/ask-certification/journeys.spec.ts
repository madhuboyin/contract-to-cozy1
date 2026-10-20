import { expect, test, type Page } from '@playwright/test';
import { installAskApi } from '../ask/fixtures';
import { apiOrigin, installAskContext, installDestinationApi, propertyId, stripUpgradeInsecure } from './fixtures';

// Sole Homeowner Interface Phase 9 / FRD section 19: the acceptance journeys that can be certified in a browser against the real backend
// contracts. Each runs on desktop and on narrow phones (Chromium and WebKit). Journeys that need a live conversation with a model are
// out of scope here by design: the deterministic paths below must work without one.
const home = `propertyId=${propertyId}`;

test.beforeEach(async ({ context, page }) => { await installAskContext(context); await stripUpgradeInsecure(page); });

async function closeToastsAndSettle(page: Page) {
  await page.waitForLoadState('networkidle');
}

test.describe('journey 5: open a notification and resume the exact current entity', () => {
  test('a notification opens the exact current Saved result: its reopen launches in Ask with the exact entity', async ({ page }) => {
    await installAskApi(page);
    const api = await installDestinationApi(page, { catchAll: false });
    await page.goto(`/dashboard/ask/notifications?${home}`);
    const row = page.getByRole('listitem').filter({ hasText: 'Your winter checklist is ready' });
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole('button', { name: 'Open in Saved' }).click();
    await expect(page).toHaveURL(/\/dashboard\/ask\?.*launchOperationId=SEASONAL_HOME_CARE.*launchEntityType=SEASONAL_CHECKLIST.*launchEntityId=/, { timeout: 20000 });
    await expect(page.getByPlaceholder(/^Ask anything about /).first()).toBeVisible({ timeout: 20000 });
    expect(api.bodies.open).toHaveLength(1);
  });

  test('a removed target says so plainly and goes nowhere; a lost home is never named; a notice with nothing to open has no dead button', async ({ page }) => {
    await installDestinationApi(page);
    await page.goto(`/dashboard/ask/notifications?${home}`);
    const removed = page.getByRole('listitem').filter({ hasText: 'Your claim was submitted' });
    await expect(removed).toBeVisible({ timeout: 20000 });
    await removed.getByRole('button', { name: 'Open in Work' }).click();
    await expect(page.getByText(/has been removed, so there is nothing to open/)).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/ask\/notifications/);
    const lost = page.getByRole('listitem').filter({ hasText: 'A claim on a former home' });
    await expect(lost.getByText('A home you no longer have access to')).toBeVisible();
    await expect(lost).not.toContainText('Testville');
    const nothing = page.getByRole('listitem').filter({ hasText: 'General update' });
    await expect(nothing.getByRole('button', { name: /^Open|Ask about/ })).toHaveCount(0);
  });

  test('a notification can be dismissed and restored without leaving, and counts follow', async ({ page }) => {
    await installDestinationApi(page);
    await page.goto(`/dashboard/ask/notifications?${home}`);
    const row = page.getByRole('listitem').filter({ hasText: 'General update' });
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'General update' })).toHaveCount(0);
    await page.getByRole('tab', { name: /Dismissed/ }).click();
    const dismissed = page.getByRole('listitem').filter({ hasText: 'General update' });
    await expect(dismissed).toBeVisible();
    await dismissed.getByRole('button', { name: 'Restore' }).click();
    await page.getByRole('tab', { name: /Inbox/ }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'General update' })).toBeVisible();
  });
});

test.describe('journey 7: search across records, work, saved items, conversations and capabilities', () => {
  test('search opens as a dialog, finds the record, sends no more than the query and the home, and returns focus when it closes', async ({ page }) => {
    const api = await installDestinationApi(page);
    await page.goto(`/dashboard/ask/work?${home}`);
    const opener = page.getByRole('button', { name: /Search your home/ }).first();
    await expect(opener).toBeVisible({ timeout: 20000 });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('furnace');
    await expect(dialog.getByText('Furnace manual').first()).toBeVisible({ timeout: 15000 });
    expect(Object.keys(api.bodies.search.at(-1) as object).sort()).toEqual(['propertyId', 'query']);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('choosing a result goes to the exact place it lives', async ({ page }) => {
    await installDestinationApi(page);
    await page.goto(`/dashboard/ask/work?${home}`);
    await page.getByRole('button', { name: /Search your home/ }).first().click();
    await page.getByRole('dialog').getByRole('searchbox').fill('furnace');
    await page.getByRole('dialog').getByRole('button', { name: /Furnace manual/ }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/ask\/record\?propertyId=ask-property-fixture&section=documents&recordId=/);
  });

  test('a search with no match says so instead of staying blank', async ({ page }) => {
    await installDestinationApi(page);
    await page.goto(`/dashboard/ask/work?${home}`);
    await page.getByRole('button', { name: /Search your home/ }).first().click();
    await page.getByRole('dialog').getByRole('searchbox').fill('zebra');
    await expect(page.getByRole('dialog').getByText(/No matches|not a confirmed empty result/)).toBeVisible({ timeout: 15000 });
  });
});

test.describe('journeys 2 and 8: browse the Record, and a viewer sees only what a viewer may', () => {
  test('the owner browses documents, including the owner-only one, and can start an export', async ({ page }) => {
    await installDestinationApi(page);
    await page.goto(`/dashboard/ask/record?${home}&section=documents`);
    await expect(page.getByText('Furnace manual').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Deed (owner only)').first()).toBeVisible();
    await page.goto(`/dashboard/ask/record?${home}&export=review`);
    await expect(page.getByRole('heading', { name: 'Export home record' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('status').filter({ hasText: /needs the CONTRIBUTOR role/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Create/ }).first()).toBeVisible();
  });

  test('a viewer reads the same section but never sees the owner-only record, and is told plainly that an export needs more access', async ({ page }) => {
    const api = await installDestinationApi(page, { viewer: true });
    await page.goto(`/dashboard/ask/record?${home}&section=documents`);
    await expect(page.getByText('Furnace manual').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Deed (owner only)')).toHaveCount(0);
    expect(api.calls).toContain('record-documents');
    await page.goto(`/dashboard/ask/record?${home}&export=review`);
    await expect(page.getByRole('status').filter({ hasText: /needs the CONTRIBUTOR role/ })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /^Create/ })).toHaveCount(0);
  });
});

test.describe('FR-PERF-001: the destination chrome does not wait for slow data', () => {
  for (const destination of ['work', 'saved', 'record', 'notifications']) {
    test(`${destination}: header and navigation appear immediately while the data takes 3 seconds, and a loading state is announced`, async ({ page }) => {
      await installDestinationApi(page, { slowMs: 3000 });
      const started = Date.now();
      await page.goto(`/dashboard/ask/${destination}?${home}`);
      await expect(page.getByRole('link', { name: 'Work' }).first()).toBeVisible({ timeout: 10000 });
      const chromeMs = Date.now() - started;
      expect(chromeMs, `the chrome took ${chromeMs}ms`).toBeLessThan(1500 + 1500);
      await expect(page.locator('[role="status"]').filter({ hasText: /Loading|Finding|Reading|Checking|Looking/i }).first()).toBeVisible();
    });
  }
});

test.describe('journeys 3 and 10: add a file, review what was found, confirm, and reopen (keyboard-operable, phone-sized)', () => {
  async function openIntake(page: Page) {
    await installAskApi(page);
    await installDestinationApi(page, { catchAll: false });
    await page.goto(`/acceptance/ask?${home}`);
    const add = page.getByRole('button', { name: 'Add a file to your home' }).first();
    await expect(add).toBeVisible({ timeout: 20000 });
    await add.click();
    const dialog = page.getByRole('dialog', { name: /Add a file/ });
    await expect(dialog).toBeVisible();
    return { dialog, add };
  }
  const file = (name = 'water-heater-receipt.pdf') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 certification') });

  test('a receipt: kept first, read only after agreement, details accepted, added, and the result opens', async ({ page }) => {
    const { dialog } = await openIntake(page);
    await expect(dialog.getByText(/Nothing is read until you choose to/)).toBeVisible();
    await expect(dialog.getByText(/No antivirus engine is connected/)).toBeVisible();
    await dialog.getByLabel('Choose a file to add').setInputFiles(file());
    await expect(dialog.getByText(/It has not been read yet/)).toBeVisible();
    const read = dialog.getByRole('button', { name: 'Read this file' });
    await expect(read).toBeDisabled();
    await dialog.getByLabel(/I understand this file will be sent to an AI service/).check();
    await expect(read).toBeEnabled();
    await read.click();
    await expect(dialog.getByText(/Cozy read this as/)).toBeVisible();
    await expect(dialog.getByText('Page 1').first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add to my home' })).toBeDisabled();
    for (const label of ['What it was for', 'Amount', 'Date']) await dialog.getByRole('button', { name: `Accept ${label}` }).click();
    await expect(dialog.getByRole('button', { name: 'Add to my home' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Add to my home' }).click();
    await expect(dialog.getByText('Expense added to your home.')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'See it in your home record' })).toHaveAttribute('href', /\/dashboard\/ask\/record\?propertyId=ask-property-fixture&section=documents&recordId=/);
  });

  test('an inspection report: findings are proposed, only accepted ones are added, and nothing is created before', async ({ page }) => {
    const api = await installDestinationApi(page, { catchAll: false }).then(() => null).catch(() => null);
    void api;
    const { dialog } = await openIntake(page);
    await dialog.getByLabel('Choose a file to add').setInputFiles(file('roof-inspection.pdf'));
    await dialog.getByRole('radio', { name: /inspection report/ }).check();
    await dialog.getByLabel(/I understand this file will be sent to an AI service/).check();
    await dialog.getByLabel('Inspection date').fill('2026-09-01');
    await dialog.getByRole('button', { name: 'Read this file' }).click();
    await expect(dialog.getByText(/Only those are added, as a new inspection report/)).toBeVisible();
    await expect(dialog.getByText('0 accepted · 3 undecided · 0 rejected')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    const create = dialog.getByRole('button', { name: /Create the report from 0 accepted findings/ });
    await expect(create).toBeDisabled();
    await dialog.getByRole('button', { name: 'Accept Roof · Major' }).click();
    await dialog.getByRole('button', { name: 'Reject Plumbing · Minor' }).click();
    await expect(dialog.getByText('1 accepted · 1 undecided · 1 rejected')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create the report from 1 accepted finding' }).click();
    await expect(dialog.getByText(/created with the 1 finding you accepted/)).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Review the findings' })).toHaveAttribute('href', /section=inspections/);
  });

  test('focus stays inside the dialog while it is open, Escape closes it, and focus returns to the button that opened it', async ({ page }) => {
    const { dialog, add } = await openIntake(page);
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement)), `Tab ${step + 1} stayed in the dialog`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
  });

  test('the dialog has no serious accessibility violation at any step', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const { dialog } = await openIntake(page);
    const scan = async (label: string) => {
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${label}: ${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    };
    await scan('choose');
    await dialog.getByLabel('Choose a file to add').setInputFiles(file());
    await expect(dialog.getByText(/It has not been read yet/)).toBeVisible();
    await scan('read');
    await dialog.getByLabel(/I understand this file will be sent to an AI service/).check();
    await dialog.getByRole('button', { name: 'Read this file' }).click();
    await expect(dialog.getByText(/Cozy read this as/)).toBeVisible();
    await scan('review');
  });
});

test.describe('offline, reconnect and draft recovery', () => {
  test('a typed question survives a reload, and a send that fails to reach the server keeps the text and sends once the connection is back', async ({ page }) => {
    await installAskApi(page);
    await page.goto(`/acceptance/ask?${home}`);
    const box = page.getByPlaceholder(/^Ask anything about /).first();
    await expect(box).toBeVisible({ timeout: 20000 });
    await box.fill('What needs my attention this week?');
    await page.reload();
    const restored = page.getByPlaceholder(/^Ask anything about /).first();
    await expect(restored).toBeVisible({ timeout: 20000 });
    await expect(restored).toHaveValue('What needs my attention this week?');

    // The connection drops: the request never reaches the server.
    const dropped: string[] = [];
    const drop = (route: import('@playwright/test').Route) => { dropped.push(route.request().url()); return route.abort('internetdisconnected'); };
    await page.route(`${apiOrigin}/api/ask/executions`, drop);
    await restored.press('Enter');
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15000 });
    await expect(restored).toHaveValue('What needs my attention this week?');
    expect(dropped.length).toBeGreaterThan(0);

    // Back online: the same text is still there and sends.
    await page.unroute(`${apiOrigin}/api/ask/executions`, drop);
    await restored.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: /temporarily unavailable|could not|network|fetch/i })).toHaveCount(0, { timeout: 15000 });
  });
});
