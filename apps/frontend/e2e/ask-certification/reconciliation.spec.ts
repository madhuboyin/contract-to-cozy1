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

// Journey 6: the Saved rows below are derived from the captured Saved contract.
function savedRows(afterRefresh: boolean) {
  const base = contract('savedPage').rows[1];
  const oldKey = 'quote-comparison:thread-hvac-v1';
  const newKey = 'quote-comparison:thread-hvac-v2';
  const row = (key: string, label: string, state: 'CURRENT' | 'STALE' | 'SUPERSEDED', reason: string | null, version: Record<string, unknown>) => ({
    ...base, artifactKey: key, artifactType: 'QUOTE_COMPARISON', category: 'COMPARISON', title: 'HVAC quote comparison', summary: '3 quotes compared',
    freshness: { state, reason }, version: { behavior: 'NEW_VERSION', label, ...version },
    entity: { type: 'DECISION_THREAD', id: 'thread-hvac' }, reopen: { operationId: 'QUOTE_COMPARISON', entityType: 'DECISION_THREAD', entityId: 'thread-hvac', decisionThreadId: 'thread-hvac', contextVersion: label },
  });
  return afterRefresh
    ? [row(newKey, 'Version 2', 'CURRENT', null, { superseded: false, supersededBy: null, supersedes: oldKey }), row(oldKey, 'Version 1', 'SUPERSEDED', 'A newer version replaced this one.', { superseded: true, supersededBy: newKey, supersedes: null })]
    : [row(oldKey, 'Version 1', 'STALE', 'A quote changed after this was compared.', { superseded: false, supersededBy: null, supersedes: null })];
}

test.describe('journey 6: a saved comparison is found, shown out of date, refreshed, and the earlier version is kept', () => {
  test('stale is stated in words with its reason, the refreshed list holds both versions, and the earlier one still opens', async ({ page }) => {
    await installDestinationApi(page);
    let refreshed = false;
    const resolved: string[] = [];
    await page.route(`${apiOrigin}/api/ask/saved?**`, (route) => {
      const rows = savedRows(refreshed);
      return json(route, { success: true, data: { ...contract('savedPage'), rows, delivered: rows.length, counts: { active: rows.length, archived: 0 } } });
    });
    await page.route(`${apiOrigin}/api/ask/saved/resolve**`, (route) => {
      const key = new URL(route.request().url()).searchParams.get('artifactKey') ?? '';
      resolved.push(key);
      const artifact = savedRows(true).find((row) => row.artifactKey === key) ?? savedRows(false)[0];
      return json(route, { success: true, data: { contractVersion: 'ask-saved-v1', propertyId, artifactKey: key, artifact, outcome: 'AVAILABLE', message: 'Ready to open.' } });
    });
    await page.goto(`/dashboard/ask/saved?${home}`);
    const row = page.locator('[data-artifact-key="quote-comparison:thread-hvac-v1"]');
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText('Out of date');
    await expect(row).toContainText('A quote changed after this was compared.');
    await expect(row.getByRole('button', { name: 'See the newer version' })).toHaveCount(0);
    // Refreshing happens by reopening it in Ask; the new version then exists next to the old one.
    await expect(row.getByRole('button', { name: 'Open' })).toBeVisible();
    refreshed = true;
    await page.reload();
    const newer = page.locator('[data-artifact-key="quote-comparison:thread-hvac-v2"]');
    const older = page.locator('[data-artifact-key="quote-comparison:thread-hvac-v1"]');
    await expect(newer).toContainText('Current', { timeout: 20000 });
    await expect(newer).toContainText('Version 2');
    await expect(older).toContainText('Replaced by a newer version');
    await expect(older).toContainText('Version 1');
    // Both versions are findable; the older one points at the newer and the newer one points back.
    await newer.getByRole('button', { name: 'Details' }).click();
    await expect(newer.getByRole('button', { name: 'See the earlier version' })).toBeVisible();
    await older.getByRole('button', { name: 'See the newer version' }).click();
    await expect.poll(() => resolved).toContain('quote-comparison:thread-hvac-v2');
  });
});

test.describe('journey 2: evidence, correction and export', () => {
  test('a record opens its provenance and history, offers a correction that carries the exact record, and the export is requested once with the chosen sections', async ({ page }) => {
    const api = await installDestinationApi(page);
    const created: unknown[] = [];
    await page.route(`${apiOrigin}/api/properties/${propertyId}/reports/exports`, (route) => {
      if (route.request().method() !== 'POST') return json(route, { success: true, data: { exports: [] } });
      created.push(route.request().postDataJSON());
      const included = contract('exportReviewOwner').included as string[];
      return json(route, { success: true, data: { exportId: 'export-1', status: 'PENDING', selection: { requested: included, included, unavailable: [] } } }, 201);
    });
    await page.goto(`/dashboard/ask/record?${home}&section=documents`);
    await expect(page.getByText('Furnace manual').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /Details and history/ }).first().click();
    const detail = page.locator('[data-record-detail-for]').first();
    await expect(detail.locator('[data-provenance="history"]')).toContainText('Version 1 added', { timeout: 15000 });
    await expect(detail.locator('[data-provenance="source"]')).toContainText('Added by you');
    const correction = detail.locator('[data-correction="document-verification"] a');
    await expect(correction).toBeVisible();
    const href = new URL((await correction.getAttribute('href')) ?? '', 'http://localhost:3123');
    expect(href.searchParams.get('launchOperationId')).toBe('HOME_RECORD_STATE_COMMAND');
    expect(href.searchParams.get('launchEntityId')).toBe(contract('recordDetailManual').recordId);
    expect(api.calls).toContain('record-documents');

    await page.goto(`/dashboard/ask/record?${home}&export=review`);
    await expect(page.getByRole('heading', { name: 'Export home record' })).toBeVisible({ timeout: 20000 });
    const create = page.getByRole('button', { name: 'Create export' });
    await expect(create).toBeDisabled();
    await page.getByRole('checkbox', { name: /I understand my copy includes/ }).check();
    await create.click();
    const receipt = page.locator('[data-export-receipt]');
    await expect(receipt).toContainText('Export requested');
    await expect(receipt).toContainText('No share link has been created.');
    expect(created).toHaveLength(1);
    // The receipt replaces the form, so a second click cannot create a second export.
    await expect(page.getByRole('button', { name: 'Create export' })).toHaveCount(0);
  });
});

test.describe('journey 8: a viewer can read, and every write is refused in words with nothing changed', () => {
  test('a viewer sees record corrections as unavailable with the reason, not as links', async ({ page }) => {
    await installDestinationApi(page, { viewer: true });
    const detail = contract('recordDetailManual');
    const viewerDetail = { ...detail, corrections: detail.corrections.map((route: Record<string, unknown>) => ({ ...route, state: 'UNAVAILABLE', launch: null, reason: 'Needs the CONTRIBUTOR role.' })) };
    await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/record-sections/documents/records/.*`), (route) => json(route, { success: true, data: viewerDetail }));
    await page.goto(`/dashboard/ask/record?${home}&section=documents`);
    await expect(page.getByText('Furnace manual').first()).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /Details and history/ }).first().click();
    const detailPanel = page.locator('[data-record-detail-for]').first();
    await expect(detailPanel.locator('[data-correction-state="unavailable"]').first()).toContainText('Needs the CONTRIBUTOR role.', { timeout: 15000 });
    await expect(detailPanel.locator('[data-correction] a')).toHaveCount(0);
  });

  test('a viewer cannot archive a saved result: the refusal is shown and the row stays', async ({ page }) => {
    await installDestinationApi(page, { viewer: true });
    await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/saved/archive.*`), (route) => refused(route, 'Your role cannot change saved results.'));
    await page.route(`${apiOrigin}/api/ask/saved/**`, (route) => route.request().method() === 'GET' ? route.fallback() : refused(route, 'Your role cannot change saved results.'));
    await page.goto(`/dashboard/ask/saved?${home}`);
    const row = page.locator('[data-artifact-type="PROPERTY_BRIEF"]').first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Your role cannot change saved results.').first()).toBeVisible({ timeout: 15000 });
    await expect(row).toBeVisible();
  });

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
  test('asking fails in words and keeps the question, while Record, Work, Saved, Search and Notifications all still load', async ({ page }) => {
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

    const before = modelCalls.length;
    await page.goto(`/dashboard/ask/record?${home}&section=documents`);
    await expect(page.getByText('Furnace manual').first()).toBeVisible({ timeout: 20000 });
    await page.goto(`/dashboard/ask/work?${home}`);
    await expect.poll(() => api.calls.includes('work'), { timeout: 20000 }).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto(`/dashboard/ask/saved?${home}`);
    await expect(page.getByText('Home reference brief').first()).toBeVisible({ timeout: 20000 });
    await page.goto(`/dashboard/ask/notifications?${home}`);
    await expect.poll(() => api.calls.includes('notifications'), { timeout: 20000 }).toBe(true);
    // None of those reads asked the model path for anything.
    expect(modelCalls.length).toBe(before);
  });
});
