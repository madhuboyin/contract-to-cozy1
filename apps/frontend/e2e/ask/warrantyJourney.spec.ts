import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Warranties W-3 (FRD v1.126): Warranties certified as the third calm domain, as one acceptance journey in the calm shell at desktop and phone
// width. Fixture-backed: it proves browser behavior of the real app against the producer's shape, not a live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => page.goto(`/acceptance/ask?propertyId=${propertyId}`);
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const live = (page: Page, revision: number) => page.locator(`#ask-execution-execution-warranty-journey-${revision}`);
const HEADLINE = '4 warranties: 1 active, 1 expiring within 60 days, 1 expired, 1 with dates that need review.';
const startWarranties = async (page: Page) => { await open(page); await ask(page, 'Show my warranty journey'); await expect(page.locator('[data-calm-summary]').first()).toBeVisible(); };
const status = (page: Page) => page.getByRole('group', { name: 'Warranty status filters' });
const category = (page: Page) => page.getByRole('group', { name: 'Warranty category filters' });

test('a list question: exact counts, one dominant step, a quiet page link, recorded coverage text as written, the boundary, and a trust line under the answer', async ({ page }) => {
  await installAskApi(page);
  await startWarranties(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  // Never the bare word "soon": the number is always there.
  await expect(page.locator('#ask-execution-execution-warranty-journey-1')).not.toContainText(/expires? soon|expiring soon/i);
  await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('1 expire within 60 days');
  await expect(page.getByRole('button', { name: /Add a warranty/ })).toHaveClass(/bg-teal-700/);
  const pageLink = page.getByRole('link', { name: /Open Warranties/ });
  await expect(pageLink).toHaveCount(1);
  await expect(pageLink).not.toHaveClass(/bg-teal-700/);
  // The page link carries Ask's own return path, so it comes back to this conversation.
  await expect(pageLink).toHaveAttribute('href', /^\/dashboard\/warranties\?.*backTo=/);
  // Recorded coverage text exactly as recorded, a missing one said to be missing, and no coverage decision anywhere in the answer.
  const answer = page.locator('#ask-execution-execution-warranty-journey-1');
  await expect(answer.getByText('Compressor and parts for 5 years.')).toBeVisible();
  await expect(answer.getByText('No coverage details recorded.')).toBeVisible();
  await expect(answer).not.toContainText(/you are covered|is covered by|eligible|approved|will pay/i);
  await expect(answer.locator('[data-calm-footnote]')).toContainText('This reports the warranty information recorded in your Home Record. It does not determine whether a repair is covered or file a claim.');
  // Rows needing attention are marked, and the unreadable dates are said so instead of guessed.
  await expect(answer.getByText('EXPIRING', { exact: true })).toHaveClass(/text-amber-800/);
  await expect(answer.getByText('NEEDS REVIEW', { exact: true })).toHaveClass(/text-amber-800/);
  await expect(answer.getByText('Coverage dates need review')).toBeVisible();
  const trust = page.locator('[data-calm-trust-line]');
  await expect(trust).toContainText('Based on 4 sources, latest Sep 1, 2026');
  const trustBox = await trust.boundingBox();
  const helpfulBox = await page.getByRole('button', { name: 'Helpful response', exact: true }).boundingBox();
  expect(trustBox && helpfulBox && trustBox.y < helpfulBox.y).toBe(true);
});

test('filters replace the result: each chip continues the source, replaces one dimension, keeps the question, and can be cleared', async ({ page }) => {
  const api = await installAskApi(page);
  await startWarranties(page);
  await expect(status(page).getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

  await status(page).getByRole('button', { name: 'Expires within 60 days' }).click();
  await expect(page.getByRole('heading', { name: '1 warranty: 1 expiring within 60 days.' })).toBeVisible();
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show warranties expiring within 60 days', launchContext: { sourceExecutionId: 'execution-warranty-journey-1' } });
  await expect(page.getByText('Earlier version of this answer · show')).toBeVisible();
  await expect(page.getByText('Show my warranty journey', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a warranty/ })).toHaveCount(1);
  const applied = status(page).getByRole('button', { name: 'Expires within 60 days' });
  await expect(applied).toHaveAttribute('aria-pressed', 'true');
  await expect(applied).toBeDisabled();

  // The category replaces only itself: the status stays.
  await category(page).getByRole('button', { name: 'HVAC' }).click();
  await expect(page.getByRole('heading', { name: '1 HVAC warranty: 1 expiring within 60 days.' })).toBeVisible();
  await expect(status(page).getByRole('button', { name: 'Expires within 60 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show HVAC warranties', launchContext: { sourceExecutionId: 'execution-warranty-journey-2' } });
  await expect(live(page, 3).getByRole('button', { name: 'Cool Air' })).toBeVisible();

  // A filter that matches nothing keeps the way back.
  await category(page).getByRole('button', { name: 'Roofing' }).click();
  await expect(page.getByRole('heading', { name: 'No warranties match these filters.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: HEADLINE }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  await expect(status(page).getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('unreadable dates are said so, reachable by their own filter, and never guessed', async ({ page }) => {
  await installAskApi(page);
  await startWarranties(page);
  await status(page).getByRole('button', { name: 'Dates need review' }).click();
  await expect(page.getByRole('heading', { name: '1 warranty: 1 with dates that need review.' })).toBeVisible();
  const answer = page.locator('#ask-execution-execution-warranty-journey-2');
  await expect(answer.getByText('Coverage dates need review')).toBeVisible();
  await expect(answer.getByText('Dates Unknown Inc')).toBeVisible();
});

test('an exact-warranty question: one record, no filters, recorded text, and a purpose-named evidence attach whose file still goes through review', async ({ page }) => {
  const api = await installAskApi(page);
  await open(page);
  await ask(page, 'Show my Acme warranty journey');
  await expect(page.getByRole('heading', { name: '1 Acme warranty: 1 active.' })).toBeVisible();
  await expect(page.getByText('Covers HVAC and major appliances.').first()).toBeVisible();
  await expect(page.getByRole('group', { name: /Warranty .*filters/ })).toHaveCount(0);
  const attach = page.getByRole('button', { name: /Add the warranty document/ });
  await expect(attach).toBeVisible();
  await expect(attach).toHaveAttribute('title', 'Add the warranty document for Acme Home Warranty');
  await page.getByLabel('Attach evidence file for Acme Home Warranty').last().setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture contract bytes') });
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Attach this document to this warranty.'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'WARRANTY'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'warranty-property-summary'
    && (body.launchContext as { documentId?: string } | undefined)?.documentId === 'document-evidence-fixture')).toBe(true);
  await expect(page.getByText('Attach this document as evidence?')).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('inline detail opens without navigating; an owner corrects a warranty through edit, consent reset, confirmation and a receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await startWarranties(page);
  await expect(page.getByRole('button', { name: /Add the warranty document/ })).toHaveCount(0);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Acme Home Warranty' }).click();
  await expect(response.getByText('Current canonical warranty record.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  // Owner-authorised controls are present for the requester's own warranty.
  await expect(response.getByText('Correct a detail')).toBeVisible();
  await expect(response.locator('button', { hasText: 'Attach a document' })).toBeVisible();
  await response.getByText('Correct a detail').click();
  await response.getByRole('button', { name: /^Correct expiry date/ }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Correct the expiry date of this warranty.'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'warranty-property-summary')).toBe(true);
  await expect(page.locator('[data-conversational-stage="review"]')).toContainText('Review · nothing is saved until you confirm');
  await expect(page.getByText('Correct the expiry date of the Acme Home Warranty warranty?')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Corrected expiry date').fill('2028-06-30');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api.correctionEditBodies).toEqual([{ confirmationVersion: 1, edits: { value: '2028-06-30' } }]);
  await expect(page.getByRole('button', { name: 'Save expiry date' })).toBeDisabled();
  await page.getByLabel(/I authorize this correction to the warranty record/).check();
  await page.getByRole('button', { name: 'Save expiry date' }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 2, consentConfirmed: true })]);
  const receipt = page.locator('[data-calm-receipt="completed"]');
  await expect(receipt).toContainText('Receipt');
  await expect(receipt).toContainText('Warranty updated');
});

test('a viewer sees the same recorded answer with no write or correction control anywhere', async ({ page }) => {
  await installAskApi(page, { warrantyViewer: true });
  await startWarranties(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a warranty/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open Warranties/ })).toHaveCount(1);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Acme Home Warranty' }).click();
  await expect(response.getByText('Current canonical warranty record.')).toBeVisible();
  await expect(response.getByText('Correct a detail')).toHaveCount(0);
  await expect(response.locator('button', { hasText: 'Attach a document' })).toHaveCount(0);
  // No target for the composer either: a viewer cannot attach.
  await expect(page.getByRole('button', { name: /Add (?:a photo or document|the warranty document)/ })).toHaveCount(0);
});

test('a warranty removed after the answer says so in its detail and the conversation continues', async ({ page }) => {
  await installAskApi(page);
  await startWarranties(page);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Old Roofing Co' }).click();
  await expect(response.getByRole('alert')).toContainText('Warranty no longer exists');
  await expect(response.getByRole('alert')).toContainText('This warranty was removed after the Ask result was created.');
  await expect(response.getByText('Old Roofing Co').first()).toBeVisible();
  await expect(composer(page)).toBeEnabled();
});

test('losing access to the home redacts the whole result instead of leaving stale warranties on screen', async ({ page }) => {
  await installAskApi(page, { warrantyDetailAccessLost: true });
  await startWarranties(page);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Acme Home Warranty' }).click();
  await expect(response).toHaveAttribute('role', 'alert');
  await expect(response.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(response).toContainText('Access to this result is no longer available.');
  await expect(response.getByText('Compressor and parts for 5 years.')).toHaveCount(0);
});

test('an empty record is not read as "nothing is covered", and it still says what this reports', async ({ page }) => {
  await installAskApi(page, { warrantyEmpty: true });
  await open(page);
  await ask(page, 'Show my warranty journey');
  await expect(page.getByRole('heading', { name: 'No warranties are recorded for this home yet' })).toBeVisible();
  await expect(page.getByText(/does not mean nothing is covered/)).toBeVisible();
  await expect(page.getByText('This reports the warranty information recorded in your Home Record.')).toBeVisible();
  await expect(page.getByRole('group', { name: /Warranty .*filters/ })).toHaveCount(0);
});

test('on a phone: nothing scrolls sideways, chips and the primary step are reachable, and a refinement works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await startWarranties(page);
  await noSidewaysScroll(page);
  const add = page.getByRole('button', { name: /Add a warranty/ });
  await add.scrollIntoViewIfNeeded();
  const box = await add.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  const chip = status(page).getByRole('button', { name: 'Expires within 60 days' });
  await chip.scrollIntoViewIfNeeded();
  const chipBox = await chip.boundingBox();
  // WCAG 2.2 AA target size (2.5.8) is 24px; the calm filter chips are 30px, the same as Maintenance and Inventory.
  expect(chipBox && chipBox.height >= 24 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 390).toBe(true);
  await chip.click();
  await expect(page.getByRole('heading', { name: '1 warranty: 1 expiring within 60 days.' })).toBeVisible();
  await noSidewaysScroll(page);
  await expect(page.locator('[data-calm-trust-line]').last()).toBeVisible();
});

test('accessibility: filters are named groups of toggle buttons operable from the keyboard, and the status region announces each result', async ({ page }) => {
  await installAskApi(page);
  await startWarranties(page);
  await expect(page.getByRole('status').filter({ hasText: 'Ask response updated. Latest status: answered.' })).toBeAttached();
  const chip = status(page).getByRole('button', { name: 'Expires within 60 days' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '1 warranty: 1 expiring within 60 days.' })).toBeVisible();
  await expect(status(page).getByRole('button', { name: 'Expires within 60 days' }).last()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Response options' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /View sources/ }).last()).toBeVisible();
});

test('accessibility: with reduced motion requested, the settled Warranties answer runs no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAskApi(page);
  await startWarranties(page);
  await status(page).getByRole('button', { name: 'Expires within 60 days' }).click();
  await expect(page.getByRole('heading', { name: '1 warranty: 1 expiring within 60 days.' })).toBeVisible();
  // Poll rather than sample once: a finite CSS transition that began a frame ago must be allowed to finish; what must never happen is an
  // animation that keeps running (a spinner, a pulse) once the answer has settled.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && !(animation.effect as KeyframeEffect | null)?.target?.closest?.('[role="status"]')).length), { timeout: 5000 }).toBe(0);
});

test('recovery: a failed first request keeps the typed question in the composer, and Try again recovers', async ({ page }) => {
  await installAskApi(page, { askFailsOnce: true });
  await open(page);
  const question = 'Show my warranty journey';
  await composer(page).fill(question);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(composer(page)).toHaveValue(question);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
});

test('recovery: a refinement that fails keeps the answer on screen, says so, and the same chip works on retry', async ({ page }) => {
  await installAskApi(page, { refinementFailsOnce: true });
  await startWarranties(page);
  const chip = () => status(page).getByRole('button', { name: 'Expires within 60 days' });
  await chip().click();
  await expect(page.getByRole('alert').filter({ hasText: /could not refine|Ask/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await expect(page.getByText('Earlier version of this answer · show')).toHaveCount(0);
  await expect(chip()).toBeEnabled();
  await chip().click();
  await expect(page.getByRole('heading', { name: '1 warranty: 1 expiring within 60 days.' })).toBeVisible();
});
