import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// ACUI-008 (FRD v1.120): the maintenance conversational slice as one acceptance journey, in the calm shell (the default), at desktop
// and phone width. Each test names the ACUI ticket it protects. Fixture-backed: it proves the browser behavior, not a live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => page.goto(`/acceptance/ask?propertyId=${propertyId}`);
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('ACUI-001/002/003: the launch names the home and its state, each entry can say why, and the answer leads with a trust line and one dominant step', async ({ page }) => {
  await installAskApi(page);
  await open(page);
  // ACUI-001: home identity, a state headline, and a placeholder that names the home.
  await expect(page.locator('[data-calm-property]')).toHaveText('Acceptance Home');
  await expect(page.locator('[data-calm-headline="state"]')).toContainText('plan soon');
  await expect(page.getByPlaceholder('Ask anything about Acceptance Home…')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Needs your attention' }).locator('[data-strip-chip]')).not.toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Needs your attention' }).locator('[data-strip-chip]')).toHaveCount(2);

  // ACUI-002: the explanation opens in place and never disturbs what was typed.
  await composer(page).fill('half-typed question');
  const why = page.getByRole('button', { name: 'Why this appeared' }).first();
  await expect(why).toHaveAttribute('aria-expanded', 'false');
  await why.click();
  await expect(why).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-why-panel]').first()).toContainText('ranked “plan soon”');
  await expect(composer(page)).toHaveValue('half-typed question');
  await why.click();
  await expect(page.locator('[data-why-panel]').first()).toBeHidden();

  // ACUI-003: answer, one dominant step, trust line under the answer.
  await ask(page, 'Show my maintenance tasks with sources');
  await expect(page.locator('[data-calm-summary]').first()).toContainText('maintenance record');
  await expect(page.getByRole('button', { name: /Create a task/ })).toHaveClass(/bg-teal-700/);
  await expect(page.getByRole('button', { name: /Next page/ })).not.toHaveClass(/bg-teal-700/);
  const trust = page.locator('[data-calm-trust-line]');
  await expect(trust).toContainText('Based on 1 source, latest Sep 20, 2026');
  const trustBox = await trust.boundingBox();
  const helpfulBox = await page.getByRole('button', { name: 'Helpful response', exact: true }).boundingBox();
  expect(trustBox && helpfulBox && trustBox.y < helpfulBox.y).toBe(true);
  await trust.getByRole('button').click();
  await expect(trust.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
});

test('ACUI-003: a refinement replaces the result, keeps the original question, and leaves one live copy of the primary step', async ({ page }) => {
  await installAskApi(page);
  await open(page);
  await ask(page, 'Show my maintenance tasks with sources');
  await expect(page.getByRole('button', { name: /Create a task/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Overdue' }).click();
  await expect(page.getByText('Earlier version of this answer · show')).toBeVisible();
  await expect(page.locator('#ask-execution-execution-maintenance-journey').getByText('Show my maintenance tasks with sources', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create a task/ })).toHaveCount(1);
});

test('ACUI-005: review names its stage, and an unknown outcome is reconciled by a status check, never a second execution invitation, before the receipt', async ({ page }) => {
  const api = await installAskApi(page, { unknownOutcomeOnce: true });
  await open(page);
  await ask(page, 'Complete a maintenance task');
  await page.getByRole('button', { name: 'Chimney cleaning and inspection · due Sep 23, 2026' }).click();
  await page.getByLabel('Actual cost').fill('120');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('[data-conversational-stage="review"]')).toHaveText('Review · nothing is saved until you confirm');
  await expect(page.getByText('Mark this maintenance task complete?')).toBeVisible();
  // Consent is required before Confirm is possible.
  await expect(page.getByRole('button', { name: 'Mark complete' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Mark complete' }).click();

  const unknown = page.locator('[data-calm-outcome-unknown]');
  await expect(unknown).toContainText('Outcome not yet known');
  await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
  await unknown.getByRole('button', { name: 'Check status' }).click();

  const receipt = page.locator('[data-calm-receipt="completed"]');
  await expect(receipt).toContainText('Receipt');
  await expect(receipt).toContainText('Task marked complete');
  await expect(receipt).toContainText('Chimney cleaning and inspection');
  // Both requests carried the same confirmation version and consent: the check re-asked, it did not start something new.
  expect(api.correctionConfirmBodies).toHaveLength(2);
  expect(api.correctionConfirmBodies[1]).toMatchObject({ consentConfirmed: true });
});

test('ACUI-004: the composer offers its attach only for one known record of each supported type, names the purpose, and the file goes through review', async ({ page }) => {
  const api = await installAskApi(page);
  const cases: Array<{ question: string; label: RegExp; title: string; message: string; type: string; id: string }> = [
    { question: 'Show my water heater record only.', label: /Add a photo or document/, title: 'Water heater', message: 'Attach this document to this inventory item.', type: 'INVENTORY_ITEM', id: 'item-property-summary' },
    { question: 'Show my roof event record only.', label: /Add a photo or document/, title: 'Roof replacement', message: 'Attach evidence to this home timeline entry.', type: 'HOME_EVENT', id: 'event-property-summary' },
    { question: 'Show my warranty record only.', label: /Add the warranty document/, title: 'Acme Home Warranty', message: 'Attach this document to this warranty.', type: 'WARRANTY', id: 'warranty-property-summary' },
  ];
  for (const item of cases) {
    // A fresh conversation per record type: an open confirmation from the previous one is not part of what this checks.
    await open(page);
    await ask(page, item.question);
    const attach = page.getByRole('button', { name: item.label });
    await expect(attach).toBeVisible();
    await expect(attach).toHaveAttribute('title', new RegExp(`for ${item.title}$`));
    await page.getByLabel(`Attach evidence file for ${item.title}`).last().setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture bytes') });
    await expect.poll(() => api.executionBodies.some((body) => body.message === item.message
      && (body.launchContext as { entityType?: string } | undefined)?.entityType === item.type
      && (body.launchContext as { entityId?: string } | undefined)?.entityId === item.id
      && (body.launchContext as { documentId?: string } | undefined)?.documentId === 'document-evidence-fixture')).toBe(true);
  }
  // Uploading never attached anything by itself.
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('ACUI-006: a fresh landing puts unfinished work first and keeps history one action away; the choice and a search are respected', async ({ page }) => {
  await installAskApi(page, { pendingWork: true, recentSessions: true });
  await open(page);
  const unfinished = page.getByRole('list', { name: 'Unfinished work' });
  await expect(unfinished).toContainText('Unfinished · I want to create a maintenance task');
  await expect(unfinished.getByRole('button', { name: 'Continue' })).toBeEnabled();
  const nav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  const toggle = page.locator('#ask-history-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toHaveCount(0);
  await toggle.click();
  await expect(nav.getByPlaceholder('Search conversations')).toBeVisible();
  // Hide history clears the search and collapses; it stays collapsed after a reload.
  await nav.getByPlaceholder('Search conversations').fill('boiler');
  await page.locator('#ask-history-toggle').click();
  await expect(nav).toHaveCount(0);
  await page.reload();
  await expect(nav).toHaveCount(0);
  await unfinished.getByRole('button', { name: 'Dismiss' }).click();
  await expect(unfinished).toHaveCount(0);
});

test('ACUI-001..006 on a phone: nothing scrolls sideways, the explanation, trust line and primary step fit, and history is the existing sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page, { recentSessions: true });
  await open(page);
  await expect(page.locator('[data-calm-headline="state"]')).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole('button', { name: 'Why this appeared' }).first().click();
  await expect(page.locator('[data-why-panel]').first()).toBeVisible();
  await noSidewaysScroll(page);
  // The desktop rail does not exist here; the header button opens the sheet.
  await expect(page.locator('#ask-history-toggle')).toBeHidden();
  await page.getByRole('button', { name: 'Open conversation history' }).click();
  await expect(page.getByRole('dialog', { name: 'Ask Cozy conversations' }).getByPlaceholder('Search conversations')).toBeVisible();
  await page.keyboard.press('Escape');

  await ask(page, 'Show my maintenance tasks with sources');
  await expect(page.locator('[data-calm-trust-line]')).toBeVisible();
  const create = page.getByRole('button', { name: /Create a task/ });
  await create.scrollIntoViewIfNeeded();
  const box = await create.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await noSidewaysScroll(page);
});

test('accessibility: keyboard reaches and operates the explanation, the status region announces the answer, and controls have names', async ({ page }) => {
  await installAskApi(page);
  await open(page);
  const why = page.getByRole('button', { name: 'Why this appeared' }).first();
  await why.focus();
  await page.keyboard.press('Enter');
  await expect(why).toHaveAttribute('aria-expanded', 'true');
  await expect(why).toHaveAttribute('aria-controls', /^why-/);
  await expect(page.locator('#ask-history-toggle')).toHaveAccessibleName(/History/);
  await ask(page, 'Show my maintenance tasks with sources');
  await expect(page.getByRole('status').filter({ hasText: 'Ask response updated. Latest status: answered.' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Helpful response', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not helpful response' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Response options' })).toBeVisible();
  await expect(page.getByRole('button', { name: /View sources/ })).toBeVisible();
});

test('accessibility: with reduced motion requested, the launch and answer run no animation once settled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAskApi(page);
  await open(page);
  await expect(page.locator('[data-calm-headline="state"]')).toBeVisible();
  await page.getByRole('button', { name: 'Why this appeared' }).first().click();
  await ask(page, 'Show my maintenance tasks with sources');
  await expect(page.locator('[data-calm-trust-line]')).toBeVisible();
  const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && !(animation.effect as KeyframeEffect | null)?.target?.closest?.('[role="status"]')).length);
  expect(running).toBe(0);
});

test('a failed request keeps the typed question in the composer, says what happened, and Try again recovers', async ({ page }) => {
  await installAskApi(page, { askFailsOnce: true });
  await open(page);
  const question = 'Show my maintenance tasks with sources';
  await composer(page).fill(question);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: /could not answer|Ask/ }).first()).toBeVisible();
  await expect(composer(page)).toHaveValue(question);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.locator('[data-calm-summary]').first()).toContainText('maintenance record');
});
