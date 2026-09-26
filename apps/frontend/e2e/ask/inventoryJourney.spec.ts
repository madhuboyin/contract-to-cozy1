import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// ACUI I-3 (FRD v1.123): Inventory certified as the second calm domain, as one acceptance journey in the calm shell at desktop and phone
// width. Fixture-backed: it proves browser behavior of the real app against the producer's shape, not a live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => page.goto(`/acceptance/ask?propertyId=${propertyId}`);
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const live = (page: Page, executionRevision: number) => page.locator(`#ask-execution-execution-inventory-journey-${executionRevision}`);
const startInventory = async (page: Page) => { await open(page); await ask(page, 'Show my inventory journey'); await expect(page.locator('[data-calm-summary]').first()).toBeVisible(); };

test('direct answer, concise hierarchy, one dominant step, quiet page link, and a trust line under the answer', async ({ page }) => {
  await installAskApi(page);
  await startInventory(page);
  await expect(page.getByRole('heading', { name: '4 items recorded, 2 with missing details.' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('2 missing details');
  await expect(page.getByRole('button', { name: /Add an item/ })).toHaveClass(/bg-teal-700/);
  // The full inventory page is a quiet secondary link, drawn once.
  const pageLink = page.getByRole('link', { name: /Open home inventory/ });
  await expect(pageLink).toHaveCount(1);
  await expect(pageLink).not.toHaveClass(/bg-teal-700/);
  await expect(pageLink).toHaveAttribute('href', new RegExp(`/dashboard/properties/${propertyId}/inventory\\?tab=items`));
  const trust = page.locator('[data-calm-trust-line]');
  await expect(trust).toContainText('Based on 4 sources, latest Sep 1, 2026');
  const trustBox = await trust.boundingBox();
  const helpfulBox = await page.getByRole('button', { name: 'Helpful response', exact: true }).boundingBox();
  expect(trustBox && helpfulBox && trustBox.y < helpfulBox.y).toBe(true);
});

test('filters replace the result: each chip continues the source, replaces one dimension, keeps the question, and can be cleared', async ({ page }) => {
  const api = await installAskApi(page);
  await startInventory(page);
  const status = page.getByRole('group', { name: 'Inventory status filters' });
  const category = page.getByRole('group', { name: 'Inventory category filters' });
  await expect(status.getByRole('button', { name: 'All items' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

  // Status dimension.
  await status.getByRole('button', { name: 'Missing details' }).click();
  await expect(page.getByRole('heading', { name: '2 records are missing details.' })).toBeVisible();
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show items with missing details', launchContext: { sourceExecutionId: 'execution-inventory-journey-1' } });
  // The earlier answer is one quiet stub, its question kept, and there is one live copy of the primary step.
  await expect(page.getByText('Earlier version of this answer · show')).toBeVisible();
  await expect(page.getByText('Show my inventory journey', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add an item/ })).toHaveCount(1);
  const applied = page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' });
  await expect(applied).toHaveAttribute('aria-pressed', 'true');
  await expect(applied).toBeDisabled();

  // Category dimension replaces only itself: the status focus stays.
  await page.getByRole('group', { name: 'Inventory category filters' }).getByRole('button', { name: 'HVAC' }).click();
  await expect(page.getByRole('heading', { name: '1 HVAC record is missing details.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show HVAC items', launchContext: { sourceExecutionId: 'execution-inventory-journey-2' } });
  // One row is still a list with its chips: the way back never disappears.
  await expect(live(page, 3).getByRole('button', { name: 'Water heater' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

  // Explicit clear resets both dimensions.
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: '4 items recorded, 2 with missing details.' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'All items' })).toHaveAttribute('aria-pressed', 'true');
});

test('item detail opens inline without navigating, and a correction goes through edit, consent, confirmation and a receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await startInventory(page);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Water heater' }).click();
  await expect(response.getByText('Tank-style, in basement utility closet.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await response.getByText('Correct a detail').click();
  await response.getByRole('button', { name: /^Correct install date/ }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Correct the install date of this inventory item.'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'item-property-summary')).toBe(true);
  await expect(page.locator('[data-conversational-stage="review"]')).toContainText('Review · nothing is saved until you confirm');
  await expect(page.getByText('Correct installed date for Water heater?')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Corrected installed date').fill('2021-03-15');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api.correctionEditBodies).toEqual([{ confirmationVersion: 1, edits: { value: '2021-03-15' } }]);
  // Editing returned the proposal to review: consent is required again.
  await expect(page.getByRole('button', { name: 'Save installed date' })).toBeDisabled();
  await page.getByLabel(/I authorize this correction to the shared home inventory record/).check();
  await page.getByRole('button', { name: 'Save installed date' }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 2, consentConfirmed: true })]);
  const receipt = page.locator('[data-calm-receipt="completed"]');
  await expect(receipt).toContainText('Receipt');
  await expect(receipt).toContainText('Inventory record updated');
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('contextual evidence: offered only when the result holds one record, purpose-named, and the file still goes through review', async ({ page }) => {
  const api = await installAskApi(page);
  await startInventory(page);
  // Four records: no target is guessed.
  await expect(page.getByRole('button', { name: /Add a photo or document/ })).toHaveCount(0);
  await page.getByRole('group', { name: 'Inventory category filters' }).getByRole('button', { name: 'HVAC' }).click();
  await page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' }).click();
  await expect(page.getByRole('heading', { name: '1 HVAC record is missing details.' })).toBeVisible();
  const attach = page.getByRole('button', { name: /Add a photo or document/ });
  await expect(attach).toBeVisible();
  await expect(attach).toHaveAttribute('title', 'Add a photo or document for Water heater');
  await page.getByLabel('Attach evidence file for Water heater').last().setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture receipt bytes') });
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Attach this document to this inventory item.'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'item-property-summary'
    && (body.launchContext as { documentId?: string } | undefined)?.documentId === 'document-evidence-fixture')).toBe(true);
  await expect(page.getByText('Attach this document as evidence?')).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('on a phone: nothing scrolls sideways, chips and the primary step are reachable, and a refinement works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await startInventory(page);
  await noSidewaysScroll(page);
  const add = page.getByRole('button', { name: /Add an item/ });
  await add.scrollIntoViewIfNeeded();
  const box = await add.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  const chip = page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' });
  await chip.scrollIntoViewIfNeeded();
  const chipBox = await chip.boundingBox();
  // WCAG 2.2 AA target size (2.5.8) is 24px; the calm filter chips are 30px, the same as Maintenance's.
  expect(chipBox && chipBox.height >= 24 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 390).toBe(true);
  await chip.click();
  await expect(page.getByRole('heading', { name: '2 records are missing details.' })).toBeVisible();
  await noSidewaysScroll(page);
  await expect(page.locator('[data-calm-trust-line]').last()).toBeVisible();
});

test('accessibility: filters are named groups of toggle buttons operable from the keyboard, and the status region announces each result', async ({ page }) => {
  await installAskApi(page);
  await startInventory(page);
  await expect(page.getByRole('status').filter({ hasText: 'Ask response updated. Latest status: answered.' })).toBeAttached();
  const chip = page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '2 records are missing details.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' }).last()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Response options' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /View sources/ }).last()).toBeVisible();
});

test('accessibility: with reduced motion requested, the settled Inventory answer runs no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAskApi(page);
  await startInventory(page);
  await page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' }).click();
  await expect(page.getByRole('heading', { name: '2 records are missing details.' })).toBeVisible();
  const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && !(animation.effect as KeyframeEffect | null)?.target?.closest?.('[role="status"]')).length);
  expect(running).toBe(0);
});

test('recovery: a failed first request keeps the typed question in the composer, and Try again recovers', async ({ page }) => {
  await installAskApi(page, { askFailsOnce: true });
  await open(page);
  const question = 'Show my inventory journey';
  await composer(page).fill(question);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(composer(page)).toHaveValue(question);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByRole('heading', { name: '4 items recorded, 2 with missing details.' })).toBeVisible();
});

test('recovery: a refinement that fails keeps the answer on screen, says so, and the same chip works on retry', async ({ page }) => {
  await installAskApi(page, { refinementFailsOnce: true });
  await startInventory(page);
  const chip = () => page.getByRole('group', { name: 'Inventory status filters' }).getByRole('button', { name: 'Missing details' });
  await chip().click();
  await expect(page.getByRole('alert').filter({ hasText: /could not refine|Ask/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '4 items recorded, 2 with missing details.' })).toBeVisible();
  await expect(page.getByText('Earlier version of this answer · show')).toHaveCount(0);
  await expect(chip()).toBeEnabled();
  await chip().click();
  await expect(page.getByRole('heading', { name: '2 records are missing details.' })).toBeVisible();
});
