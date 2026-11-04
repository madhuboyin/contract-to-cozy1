import { expect, test, type Page, type Route } from '@playwright/test';
import { installAskApi, installAskContext as installCalmContext } from '../ask/fixtures';
import { apiOrigin, contract, installDestinationApi, propertyId, stripUpgradeInsecure } from './fixtures';

// Sole Homeowner Interface Phase 9 / FRD section 19, the journeys the first certification pass could not reach in a browser:
// journey 1 (confirm a change, dependent views reconcile) with the Phase 8 stale banner, journey 6 (a stale saved comparison is refreshed and the prior
// version is kept), the missing halves of journeys 2 and 8, and journey 9 (the model path is down, everything deterministic still works).
// Fixtures: the claims journey and the confirm/refresh routes are the shared Ask acceptance fixtures; the stale Saved rows are DERIVED from the captured
// Saved contract (a freshness/version change), not captured from a backend. Nothing here ran against a real backend.
const home = `propertyId=${propertyId}`;
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:3123', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });
const refused = (route: Route, message: string) => json(route, { success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message } }, 403);

test.beforeEach(async ({ context, page }) => {
  await installCalmContext(context, { calm: 'default' });
  await context.addInitScript(() => { try { window.localStorage.setItem('c2c_consent_v1', JSON.stringify({ decided: true, analytics: false })); } catch { /* storage unavailable */ } });
  await stripUpgradeInsecure(page);
});

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
async function startClaims(page: Page) {
  await page.goto(`/acceptance/ask?${home}`);
  await composer(page).fill('Show my claims journey');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-calm-summary]').first()).toBeVisible({ timeout: 20000 });
}
async function confirmClaimChange(page: Page) {
  const list = page.locator('#ask-execution-execution-claims-journey-1');
  await list.getByRole('button', { name: 'Kitchen leak' }).click();
  await list.getByRole('button', { name: 'Mark submitted' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Change status' }).click();
  await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Claim status updated');
  return list;
}

test.describe('journey 1 and the stale banner: a confirmed change leaves earlier answers marked until they are refreshed', () => {
  test('the change succeeds, the earlier claims answer says it may be out of date, and Refresh brings it current', async ({ page }) => {
    const api = await installAskApi(page, { claimStaleAfterConfirm: 'REFRESH_OK' });
    await startClaims(page);
    const list = page.locator('#ask-execution-execution-claims-journey-1');
    await expect(page.locator('[data-ask-stale]')).toHaveCount(0);
    await confirmClaimChange(page);
    // The banner is rendered just above the answer it describes, not inside it.
    const banner = page.locator('[data-ask-stale]');
    await expect(banner).toContainText('Something changed after this was shown, so it may be out of date.');
    await expect(banner).toHaveAttribute('role', 'status');
    // The write itself is not undone or hidden by the stale marking.
    await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Claim status updated');
    await banner.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('[data-ask-stale]')).toHaveCount(0, { timeout: 15000 });
    await expect(list).toContainText('Refreshed after the claim status change.');
    expect(api.staleRefreshCalls()).toBe(1);
  });

  test('a refresh that fails says so and keeps the last view and the change stays confirmed', async ({ page }) => {
    const api = await installAskApi(page, { claimStaleAfterConfirm: 'REFRESH_FAILS' });
    await startClaims(page);
    const list = await confirmClaimChange(page);
    await page.locator('[data-ask-stale]').getByRole('button', { name: 'Refresh' }).click();
    const failed = page.getByRole('alert').filter({ hasText: /Could not refresh this result/ });
    await expect(failed).toBeVisible({ timeout: 15000 });
    await expect(failed).toContainText('Showing the last known view.');
    await expect(list.getByRole('heading', { name: '1 active incident and 2 open claims.' })).toBeVisible();
    await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Claim status updated');
    expect(api.staleRefreshCalls()).toBe(1);
  });

  test('a write that marks nothing stale shows no banner', async ({ page }) => {
    await installAskApi(page);
    await startClaims(page);
    await confirmClaimChange(page);
    await expect(page.locator('[data-ask-stale]')).toHaveCount(0);
  });
});

// Journey 6 (a saved comparison shown out of date) and journey 2 (record provenance, correction and export) exercised destination pages that were retired
// when Record and Saved became conversations. The out-of-date Saved answer is certified in conversations.spec.ts; provenance, corrections and the export are
// enforced and tested server-side (askRecordDetail*.test.js, askRecordExportReview.test.js) and in exportDownloadStrip.test.tsx.

test.describe('journey 8: a viewer can read, and every write is refused in words with nothing changed', () => {
  test('a viewer who adds a file is refused in words and nothing is read or created', async ({ page }) => {
    await installAskApi(page);
    const api = await installDestinationApi(page, { catchAll: false, viewer: true });
    await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/files$`), (route) => refused(route, 'Adding a file needs the CONTRIBUTOR role.'));
    await page.goto(`/acceptance/ask?${home}`);
    await page.getByRole('button', { name: 'Add a file to your home' }).first().click();
    const dialog = page.getByRole('dialog', { name: /Add a file/ });
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 viewer') });
    await expect(dialog.getByText('Adding a file needs the CONTRIBUTOR role.')).toBeVisible({ timeout: 15000 });
    expect(api.calls).not.toContain('intake-promote');
    expect(api.bodies.analyze ?? []).toHaveLength(0);
  });
});

test.describe('journey 9: the model path is down, and everything deterministic still works', () => {
  test('asking fails in words and keeps the question, while the old destination addresses still route into Ask and home search still works', async ({ page }) => {
    await installAskApi(page);
    const api = await installDestinationApi(page, { catchAll: false });
    const modelCalls: string[] = [];
    // Every call that could need a model is refused as unavailable.
    await page.route(`${apiOrigin}/api/ask/executions`, (route) => { modelCalls.push(route.request().url()); return json(route, { success: false, error: { code: 'ASK_MODEL_UNAVAILABLE', message: 'Ask could not answer just now. Your question is kept.' } }, 503); });
    await page.goto(`/acceptance/ask?${home}`);
    const box = composer(page).first();
    await expect(box).toBeVisible({ timeout: 20000 });
    await box.fill('What needs my attention this week?');
    await box.press('Enter');
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15000 });
    await expect(box).toHaveValue('What needs my attention this week?');
    expect(modelCalls.length).toBeGreaterThan(0);

    // Record, Work, Saved and Notifications are answers in the conversation now, so their old addresses are redirects that ask a question in Ask.
    // Each old address lands in Ask for the same home with that question already asked (the model refusal then shows in the conversation, as above).
    const redirects = [
      ['record', 'Browse my home record'], ['work', 'What needs me?'], ['saved', 'Show my saved results'], ['notifications', "What's new?"],
    ] as const;
    for (const [view, question] of redirects) {
      await page.goto(`/dashboard/ask/${view}?${home}`);
      await page.waitForURL(/\/dashboard\/ask\?/, { timeout: 20000 });
      const location = new URL(page.url());
      expect(location.pathname).toBe('/dashboard/ask');
      expect(location.searchParams.get('propertyId')).toBe(propertyId);
      expect(location.searchParams.get('question')).toBe(question);
    }

    // Home search is deterministic: with the model path refused it still finds the record, and opening the search asks the model for nothing.
    await page.goto(`/dashboard/ask?${home}`);
    await expect(page.getByRole('button', { name: /Search your home/ }).first()).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');
    const before = modelCalls.length;
    await page.getByRole('button', { name: /Search your home/ }).first().click();
    await page.getByRole('dialog').getByRole('combobox').fill('furnace');
    await expect(page.getByRole('dialog').getByText('Furnace manual').first()).toBeVisible({ timeout: 20000 });
    expect(api.calls).toContain('search');
    expect(modelCalls.length).toBe(before);
  });
});
