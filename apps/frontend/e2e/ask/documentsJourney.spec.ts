import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Documents D-3 (FRD v1.153): Documents certified as the sixth calm domain, as one acceptance journey in the calm shell at desktop and
// phone width. Fixture-backed: it proves browser behavior of the real app against the producer's shape, not a live backend. Deliberately
// read-only throughout: unlike Warranties/Claims, Documents has no filled step -- uploading, verifying and reviewing happen on the Home
// Records page, never through Ask.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => page.goto(`/acceptance/ask?propertyId=${propertyId}`);
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const live = (page: Page, revision: number) => page.locator(`#ask-execution-execution-documents-journey-${revision}`);
const HEADLINE = '4 documents on file';
const startDocuments = async (page: Page) => { await open(page); await ask(page, 'Show my documents journey'); await expect(page.locator('[data-calm-summary]').first()).toBeVisible(); };
const filters = (page: Page) => page.getByRole('group', { name: 'Document filters' });

test('a list question: exact counts, documents grouped by type, the recorded-information boundary, and no filled step', async ({ page }) => {
  await installAskApi(page);
  await startDocuments(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  const answer = page.locator('#ask-execution-execution-documents-journey-1');
  await expect(answer.getByText('Invoices')).toBeVisible();
  await expect(answer.getByText('Warranties')).toBeVisible();
  await expect(answer.getByText('Permits')).toBeVisible();
  await expect(answer.getByText('Estimates')).toBeVisible();
  await expect(answer.getByRole('button', { name: 'HVAC install invoice' })).toBeVisible();
  const pageLink = page.getByRole('link', { name: /Open Home Records/ }).first();
  await expect(pageLink).toBeVisible();
  // Documents has no filled step: nothing here files a claim, corrects a record, or attaches evidence.
  await expect(answer.getByRole('button', { name: /correct/i })).toHaveCount(0);
  await expect(answer.getByRole('button', { name: /attach/i })).toHaveCount(0);
  await expect(answer.locator('[data-calm-footnote]')).toContainText('Ask has not read or interpreted the documents themselves.');
});

test('filters replace the result: a status chip and a type chip each replace one dimension, keep the question, and can be cleared', async ({ page }) => {
  const api = await installAskApi(page);
  await startDocuments(page);
  await expect(filters(page).getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

  await filters(page).getByRole('button', { name: 'Unverified' }).click();
  await expect(page.getByRole('heading', { name: '1 document matches this request' })).toBeVisible();
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show unverified documents', launchContext: { sourceExecutionId: 'execution-documents-journey-1' } });
  await expect(page.getByText('Show my documents journey', { exact: true }).first()).toBeVisible();
  const appliedStatus = filters(page).getByRole('button', { name: 'Unverified' });
  await expect(appliedStatus).toHaveAttribute('aria-pressed', 'true');
  await expect(appliedStatus).toBeDisabled();

  // A type chip replaces only the type: the status stays applied.
  await filters(page).getByRole('button', { name: 'Permits' }).click();
  await expect(page.getByRole('heading', { name: '1 document matches this request' })).toBeVisible();
  await expect(filters(page).getByRole('button', { name: 'Unverified' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show Permits', launchContext: { sourceExecutionId: 'execution-documents-journey-2' } });
  await expect(live(page, 3).getByRole('button', { name: 'Old permit scan' })).toBeVisible();

  // A filter that matches nothing keeps the way back.
  await filters(page).getByRole('button', { name: 'Verified' }).click();
  await expect(page.getByRole('heading', { name: 'No documents match these filters.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: HEADLINE }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  await expect(filters(page).getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('inline detail opens without navigating: a Home Record and a transitional legacy document each show their own store facts', async ({ page }) => {
  await installAskApi(page);
  await startDocuments(page);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Roof warranty document' }).click();
  await expect(response.getByText(/Current canonical record/)).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect(response.getByText('Manufacturer warranty for the roofing replacement.')).toBeVisible();

  await response.getByRole('button', { name: 'Old permit scan' }).click();
  await expect(response.getByText('Scanned building permit from a prior renovation.')).toBeVisible();
  await expect(response.getByText('Unverified', { exact: true })).toBeVisible();
});

test('a document removed after the answer says so in its detail and the conversation continues', async ({ page }) => {
  await installAskApi(page);
  await startDocuments(page);
  const response = live(page, 1);
  await response.getByRole('button', { name: 'Deleted estimate' }).click();
  await expect(response.getByRole('alert')).toContainText(/no longer exists|no longer available/);
  await expect(response.getByText('Deleted estimate').first()).toBeVisible();
  await expect(composer(page)).toBeEnabled();
});

test('an empty record is not read as "nothing exists", and it still states what this reports', async ({ page }) => {
  await installAskApi(page, { documentsEmpty: true });
  await open(page);
  await ask(page, 'Show my documents journey');
  await expect(page.getByRole('heading', { name: 'No documents on file for this property' })).toBeVisible();
  await expect(page.getByText('Ask found no documents recorded for this home yet.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Document filters' })).toHaveCount(0);
});

test('on a phone: nothing scrolls sideways, chips are reachable, and a refinement works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await startDocuments(page);
  await noSidewaysScroll(page);
  const chip = filters(page).getByRole('button', { name: 'Unverified' });
  await chip.scrollIntoViewIfNeeded();
  const chipBox = await chip.boundingBox();
  // WCAG 2.2 AA target size (2.5.8) is 24px; the calm filter chips are 30px, the same as Maintenance, Inventory and Warranties.
  expect(chipBox && chipBox.height >= 24 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 390).toBe(true);
  await chip.click();
  await expect(page.getByRole('heading', { name: '1 document matches this request' })).toBeVisible();
  await noSidewaysScroll(page);
});

test('accessibility: filters are a named group of toggle buttons operable from the keyboard, and the status region announces each result', async ({ page }) => {
  await installAskApi(page);
  await startDocuments(page);
  await expect(page.getByRole('status').filter({ hasText: 'Ask response updated. Latest status: answered.' })).toBeAttached();
  const chip = filters(page).getByRole('button', { name: 'Unverified' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '1 document matches this request' })).toBeVisible();
  await expect(filters(page).getByRole('button', { name: 'Unverified' }).last()).toHaveAttribute('aria-pressed', 'true');
});

test('recovery: a failed first request keeps the typed question in the composer, and Try again recovers', async ({ page }) => {
  await installAskApi(page, { askFailsOnce: true });
  await open(page);
  const question = 'Show my documents journey';
  await composer(page).fill(question);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(composer(page)).toHaveValue(question);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
});

test('recovery: a refinement that fails keeps the answer on screen, says so, and the same chip works on retry', async ({ page }) => {
  await installAskApi(page, { refinementFailsOnce: true });
  await startDocuments(page);
  const chip = () => filters(page).getByRole('button', { name: 'Unverified' });
  await chip().click();
  await expect(page.getByRole('alert').filter({ hasText: /could not refine|Ask/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await expect(chip()).toBeEnabled();
  await chip().click();
  await expect(page.getByRole('heading', { name: '1 document matches this request' })).toBeVisible();
});
