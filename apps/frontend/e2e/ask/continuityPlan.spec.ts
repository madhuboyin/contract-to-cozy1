import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Home Continuity Plan (FRD v1.391-1.393): the producer's real answer for an empty plan and an established one, in the calm shell. Fixture-backed:
// it proves browser behavior of the real app against the producer's shape, not a live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const ask = async (page: Page, question: string) => { await page.goto(`/acceptance/ask?propertyId=${propertyId}`); await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('an empty plan: the plan header, a guided starter with Add entry on each essential, a compact readiness checklist and the plan toolbar', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'Show my continuity journey');
  const answer = page.locator('#ask-execution-execution-continuity-starter');
  await expect(answer.getByRole('heading', { name: 'Home Continuity Plan' })).toBeVisible();
  // The saved legacy title is a label; the stored percentage is gone; the handoff readiness is the one figure.
  await expect(answer).toContainText('Home Digital Will');
  await expect(answer).not.toContainText(/% complete/);
  await expect(answer.getByRole('list', { name: 'At a glance' })).toContainText('Not reviewed yet');
  await expect(answer.getByRole('list', { name: 'At a glance' })).toContainText('0 of 3 handoff requirements met');
  // Plan toolbar: the plan-level actions are present again, and "Add trusted contact" is owned by the checklist.
  await expect(answer.getByRole('button', { name: 'Emergency view' })).toBeVisible();
  await expect(answer.getByRole('button', { name: 'Edit details' })).toBeVisible();
  await expect(answer.getByRole('button', { name: 'Add trusted contact' })).toHaveCount(1);
  const checklist = answer.locator('[data-continuity-checklist]');
  await expect(checklist.getByRole('listitem')).toHaveCount(3);
  await expect(checklist).toContainText('Waiting for a primary trusted contact');
  await expect(checklist.getByRole('button')).toHaveCount(2);
  // Guided starter.
  const starter = answer.locator('[data-continuity-starter]');
  await expect(starter).toContainText('Start your plan');
  for (const name of ['Add entry to Emergency Instructions', 'Add entry to Utilities', 'Add entry to Preferred Contractors']) await expect(starter.getByRole('button', { name }).first()).toBeVisible();
  await expect(starter).toContainText('Start with a primary contact in the checklist above.');
  await expect(starter.locator('details > summary')).toContainText('All plan sections (8)');
  await expect(answer.getByText('Nothing recorded in this section.')).toHaveCount(0);
  // Add entry dispatches the exact declared action for that section.
  await starter.getByRole('button', { name: 'Add entry to Emergency Instructions' }).first().click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Add an entry to this home continuity plan section'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'HOME_DIGITAL_WILL_CREATE')).toBe(true);
});

test('the privacy boundary is one short line with the longer explanation behind a disclosure, and the emergency packet downloads with the person\'s own session', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'Show my continuity journey');
  const answer = page.locator('#ask-execution-execution-continuity-starter');
  await expect(answer.locator('[data-calm-footnote]')).toContainText('Not a legal will or estate document. Sensitive entry and contact details are not repeated in the conversation.');
  await expect(answer.getByText(/gate codes and key locations/)).toBeHidden();
  await answer.getByText('More about this').click();
  await expect(answer.getByText(/gate codes and key locations/)).toBeVisible();
  const download = page.waitForEvent('download');
  await answer.getByRole('button', { name: 'Download emergency packet' }).click();
  expect((await download).suggestedFilename()).toBe('emergency-packet.pdf');
  expect(api.packetDownloads).toHaveLength(1);
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('an established plan: compact section rows with Add entry on the row, one primary toolbar action, and Add trusted contact back on the toolbar', async ({ page }) => {
  await installAskApi(page);
  await ask(page, 'Show my established continuity journey');
  const answer = page.locator('#ask-execution-execution-continuity-established');
  await expect(answer.getByRole('heading', { name: 'Home Continuity Plan' })).toBeVisible();
  await expect(answer.getByRole('list', { name: 'At a glance' })).toContainText('Draft · ready to publish');
  await expect(answer.getByRole('list', { name: 'At a glance' })).toContainText('3 of 3 handoff requirements met');
  await expect(answer.locator('[data-continuity-starter]')).toHaveCount(0);
  await expect(answer.locator('[data-continuity-checklist]')).toHaveCount(0);
  await expect(answer.getByRole('button', { name: 'Mark plan ready' })).toBeVisible();
  await expect(answer.getByRole('button', { name: 'Add trusted contact' })).toHaveCount(1);
  await expect(answer.getByText('1 entry', { exact: true })).toBeVisible();
  await expect(answer.getByRole('button', { name: 'Add entry to Utilities' })).toBeVisible();
  await expect(answer.getByRole('button', { name: 'Add entry to Trusted contacts' })).toHaveCount(0);
  await answer.getByRole('button', { name: /^Emergency Instructions/ }).click();
  await expect(answer.getByText('Water shutoff')).toBeVisible();
  await noSidewaysScroll(page);
});
