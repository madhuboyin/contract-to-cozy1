import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Home Actions (FRD 1.398-1.400): the ranked list, the focused accepted-work Manage region and its evidence row. Fixture-backed: the focused blocks come from the
// real producer, the list block is schema-shaped; this proves browser behavior of the real app, not a live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const ask = async (page: Page, question: string) => { await page.goto(`/acceptance/ask?propertyId=${propertyId}`); await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('the ranked list: one Start here row, compact rows, whole-feed filter counts, rating in the overflow, and a filter chip asks the server', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture all');
  const list = page.locator('[data-calm-home-actions]');
  await expect(list.getByText('Start here')).toHaveCount(1);
  await expect(list.locator('[data-home-action-row]')).toHaveCount(6);
  for (const name of ['All · 9', 'Now · 1', 'Soon · 2', 'Plan · 3', 'Consider · 3']) await expect(list.getByRole('button', { name })).toBeVisible();
  await expect(list.getByRole('button', { name: 'All · 9' })).toHaveAttribute('aria-pressed', 'true');
  // The badge follows the feed bucket, so a Consider item is never labelled "Plan soon".
  await expect(list.locator('[data-home-action-row]').filter({ hasText: 'Consider replacing the water heater' }).getByText('Consider', { exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Mark useful' }).first()).toBeHidden();
  await list.getByRole('button', { name: 'More options' }).first().click();
  await expect(list.getByRole('button', { name: 'Mark useful' }).first()).toBeVisible();
  await noSidewaysScroll(page);
  await list.getByRole('button', { name: 'Consider · 3' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'What home actions are worth a look to consider?')).toBe(true);
  await expect(page.locator('[data-calm-home-actions]').last().getByRole('button', { name: 'Consider · 3' })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile: the list has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await installAskApi(page);
  await ask(page, 'home actions fixture all');
  await expect(page.locator('[data-calm-home-actions]')).toBeVisible();
  await noSidewaysScroll(page);
});

test('a contributor sees Mark complete, Snooze and Change due date, the evidence already on the work, and the upload that still goes through review', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture contributor');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-contributor"]');
  for (const name of ['Mark complete', 'Snooze reminders', 'Change due date']) await expect(answer.getByRole('button', { name })).toBeVisible();
  await expect(answer.getByText('Chimney sweep invoice.pdf')).toBeVisible();
  await expect(answer.getByText('Awaiting review')).toBeVisible();
  await expect(answer.getByText('Verified', { exact: true })).toBeVisible();
  await answer.getByRole('button', { name: 'Change due date' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Change the due date of this work item.'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'HOME_WORK_ITEM_COMMAND')).toBe(true);
});

test('evidence upload: the file goes up first, then a review-and-confirm card names the work; nothing is attached before consent', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture contributor');
  const attach = page.getByRole('button', { name: /Add a photo or document/ });
  await expect(attach).toBeVisible();
  await page.getByLabel('Attach evidence file for this work').last().setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture receipt bytes') });
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Attach this document as evidence for this work.'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'WORK_ITEM'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'work-1'
    && (body.launchContext as { documentId?: string } | undefined)?.documentId === 'document-evidence-fixture')).toBe(true);
  await expect(page.getByText('Attach this document as evidence?')).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('a viewer sees the evidence read-only: no upload, no changing actions', async ({ page }) => {
  await installAskApi(page);
  await ask(page, 'home actions fixture viewer');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-viewer"]');
  await expect(answer.getByText('Chimney sweep invoice.pdf')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a photo or document/ })).toHaveCount(0);
  for (const name of ['Mark complete', 'Snooze reminders', 'Change due date']) await expect(answer.getByRole('button', { name })).toHaveCount(0);
});

test('regulated work: no Mark complete, plain wording that a photo does not close it, and an upload row', async ({ page }) => {
  await installAskApi(page);
  await ask(page, 'home actions fixture regulated');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-regulated"]');
  await expect(answer.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
  await expect(answer.getByRole('button', { name: 'Change due date' })).toBeVisible();
  await expect(answer.getByText(/does not close it/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a photo or document/ })).toBeVisible();
});
