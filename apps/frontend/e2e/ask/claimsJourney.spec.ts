import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Claims C-3 (FRD v1.129): the incident and claim status answer certified as the fourth calm domain, as one acceptance journey in the calm shell
// at desktop and phone width. It is read-only by design: filing and status changes are exercised only through their own existing confirmation,
// authorization and recovery contracts, never offered from the answer. Fixture-backed: browser behavior against the producer's shape, not a
// live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => page.goto(`/acceptance/ask?propertyId=${propertyId}`);
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const live = (page: Page, revision: number) => page.locator(`#ask-execution-execution-claims-journey-${revision}`);
const HEADLINE = '1 active incident and 2 open claims.';
const startClaims = async (page: Page) => { await open(page); await ask(page, 'Show my claims journey'); await expect(page.locator('[data-calm-summary]').first()).toBeVisible(); };
const scope = (page: Page) => page.getByRole('group', { name: 'Claim scope filters' });
const state = (page: Page) => page.getByRole('group', { name: 'Claim status filters' });

test('the answer says what is open, offers no claim action, keeps the record pages quiet, and states what it does not decide', async ({ page }) => {
  await installAskApi(page);
  await startClaims(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  const answer = live(page, 1);
  await expect(answer).toContainText('1 resolved incident and 1 closed claim also on file.');
  await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('2 open claims');
  // No filled step, and nothing that starts or files a claim, is offered from a status answer.
  await expect(answer.locator('a.bg-teal-700, button.bg-teal-700')).toHaveCount(0);
  await expect(answer.getByRole('button', { name: /file a claim|start a claim|new claim|claim now/i })).toHaveCount(0);
  await expect(answer.getByRole('link', { name: /Open claims/ })).toHaveCount(1);
  await expect(answer.getByRole('link', { name: /Open incidents/ })).toHaveCount(1);
  // The boundary footnote itself says what is NOT decided, so it is set aside; nothing else in the answer speaks of approval or coverage.
  expect((await answer.locator('[data-calm-summary], ul, [data-claim-filters]').allTextContents()).join(' ')).not.toMatch(/approv|you are covered|eligible|will pay|guaranteed/i);
  await expect(answer.locator('[data-calm-footnote]')).toContainText('It does not decide whether a claim will be approved or covered. Filing a claim or changing its status happens only when you ask and confirm.');
  const trust = page.locator('[data-calm-trust-line]');
  await expect(trust).toContainText('Based on 3 sources, latest Sep 1, 2026');
  const trustBox = await trust.boundingBox();
  const helpfulBox = await page.getByRole('button', { name: 'Helpful response', exact: true }).boundingBox();
  expect(trustBox && helpfulBox && trustBox.y < helpfulBox.y).toBe(true);
});

test('filters replace the result: each chip continues the source, replaces one dimension, keeps the question, and can be cleared', async ({ page }) => {
  const api = await installAskApi(page);
  await startClaims(page);
  await expect(scope(page).getByRole('button', { name: 'Incidents and claims' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

  await scope(page).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 open claims.' })).toBeVisible();
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show claims', launchContext: { sourceExecutionId: 'execution-claims-journey-1' } });
  await expect(page.getByText('Earlier version of this answer · show')).toBeVisible();
  await expect(page.getByText('Show my claims journey', { exact: true }).first()).toBeVisible();
  const applied = scope(page).getByRole('button', { name: 'Claims', exact: true });
  await expect(applied).toHaveAttribute('aria-pressed', 'true');
  await expect(applied).toBeDisabled();
  await expect(live(page, 2).getByText('Basement leak')).toHaveCount(0);

  // The state replaces only itself: the scope stays.
  await state(page).getByRole('button', { name: 'Closed', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No open claims.' })).toBeVisible();
  await expect(scope(page).getByRole('button', { name: 'Claims', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => api.executionBodies.at(-1)).toMatchObject({ message: 'Only show closed records', launchContext: { sourceExecutionId: 'execution-claims-journey-2' } });
  await expect(live(page, 3).getByRole('button', { name: 'Old fence claim' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: HEADLINE }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  await expect(scope(page).getByRole('button', { name: 'Incidents and claims' })).toHaveAttribute('aria-pressed', 'true');
});

test('an exact-claim question: one claim, no filters, and the same read-only answer', async ({ page }) => {
  await installAskApi(page);
  await open(page);
  await ask(page, 'Show my kitchen claim journey');
  await expect(page.getByRole('heading', { name: '1 open claim.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kitchen leak' })).toBeVisible();
  await expect(page.getByRole('group', { name: /Claim .*filters/ })).toHaveCount(0);
  await expect(page.getByText('Roof hail claim')).toHaveCount(0);
});

test('a claim opens inline without navigating, and its actions follow the live status: a draft may start, submit or close, never approve', async ({ page }) => {
  await installAskApi(page);
  await startClaims(page);
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Kitchen leak' }).click();
  await expect(answer.getByText('Water under the kitchen sink damaged the cabinet floor.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect(answer.locator('[data-claim-action]')).toHaveCount(3);
  await expect(answer.getByRole('button', { name: 'Mark approved' })).toHaveCount(0);
  await expect(answer.getByRole('button', { name: 'Mark denied' })).toHaveCount(0);
  // An incident row keeps its link: incidents open on their own page.
  await expect(answer.getByRole('link', { name: 'Basement leak' })).toBeVisible();
});

test('a status change goes through review, consent and confirmation to a receipt, and cancel is distinct from confirm', async ({ page }) => {
  const api = await installAskApi(page);
  await startClaims(page);
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Kitchen leak' }).click();
  await answer.getByRole('button', { name: 'Mark submitted' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Submit this claim.',
    launchContext: expect.objectContaining({ entityType: 'CLAIM', entityId: 'claim-kitchen-leak', operationId: 'CLAIM_TRANSITION', sourceExecutionId: 'execution-claims-journey-1' }),
  }));
  await expect(page.locator('[data-conversational-stage="review"]')).toContainText('Review · nothing is saved until you confirm');
  await expect(page.getByText('Change Kitchen leak to submitted?').first()).toBeVisible();
  // Nothing happens without consent, and Cancel is its own control.
  await expect(page.getByRole('button', { name: 'Change status' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Change status' }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ consentConfirmed: true })]);
  const receipt = page.locator('[data-calm-receipt="completed"]');
  await expect(receipt).toContainText('Receipt');
  await expect(receipt).toContainText('Claim status updated');
  await expect(receipt).toContainText('Kitchen leak');
  await expect(receipt.getByRole('link', { name: /Open claim/ })).toHaveClass(/bg-teal-700/);
});

test('an unknown outcome is reconciled by a status check, never a second execution invitation, before the receipt', async ({ page }) => {
  const api = await installAskApi(page, { claimUnknownOutcomeOnce: true });
  await startClaims(page);
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Kitchen leak' }).click();
  await answer.getByRole('button', { name: 'Mark submitted' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Change status' }).click();
  const unknown = page.locator('[data-calm-outcome-unknown]');
  await expect(unknown).toContainText('Outcome not yet known');
  await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0);
  await unknown.getByRole('button', { name: 'Check status' }).click();
  await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Claim status updated');
  expect(api.correctionConfirmBodies).toHaveLength(2);
});

test('a confirmation the requester is no longer authorised to make is refused, redacts that result instead of leaving a live control, and changes nothing', async ({ page }) => {
  const api = await installAskApi(page, { claimConfirmDenied: true });
  await startClaims(page);
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Kitchen leak' }).click();
  await answer.getByRole('button', { name: 'Mark submitted' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Change status' }).click();
  // The existing authorization contract: a refused confirmation withdraws the review rather than leaving a button that would fail again.
  const review = page.locator('#ask-execution-execution-claim-transition');
  await expect(review).toHaveAttribute('role', 'alert');
  await expect(review.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(review).toContainText('Access to this result is no longer available.');
  await expect(page.getByRole('button', { name: 'Change status' })).toHaveCount(0);
  await expect(page.locator('[data-calm-receipt]')).toHaveCount(0);
  expect(api.correctionConfirmBodies).toHaveLength(1);
});

test('a viewer sees the same recorded answer and claim detail with no status-change control anywhere', async ({ page }) => {
  await installAskApi(page, { claimsViewer: true });
  await startClaims(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Kitchen leak' }).click();
  await expect(answer.getByText('Water under the kitchen sink damaged the cabinet floor.')).toBeVisible();
  await expect(answer.locator('[data-claim-action]')).toHaveCount(0);
  await expect(answer.getByRole('button', { name: /^Mark / })).toHaveCount(0);
  await expect(answer.getByRole('button', { name: 'Close claim', exact: true })).toHaveCount(0);
});

test('a claim removed after the answer says so in its detail and the conversation continues', async ({ page }) => {
  await installAskApi(page);
  await startClaims(page);
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Old fence claim' }).click();
  await expect(answer.getByRole('alert')).toContainText('Claim no longer exists');
  await expect(answer.getByRole('alert')).toContainText('This claim was removed after the Ask result was created.');
  await expect(composer(page)).toBeEnabled();
});

test('losing access to the home redacts the whole result instead of leaving stale claims on screen', async ({ page }) => {
  await installAskApi(page, { claimDetailAccessLost: true });
  await startClaims(page);
  const answer = live(page, 1);
  await answer.getByRole('button', { name: 'Kitchen leak' }).click();
  await expect(answer).toHaveAttribute('role', 'alert');
  await expect(answer.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(answer).toContainText('Access to this result is no longer available.');
  await expect(answer.getByText('Roof hail claim')).toHaveCount(0);
});

test('an empty record is not read as "nothing has ever happened", and it still says what this shows', async ({ page }) => {
  await installAskApi(page, { claimsEmpty: true });
  await open(page);
  await ask(page, 'Show my claims journey');
  await expect(page.getByRole('heading', { name: 'No incidents or claims are recorded for this home' })).toBeVisible();
  await expect(page.getByText(/not confirmation that nothing has ever happened/)).toBeVisible();
  await expect(page.getByText('This shows the incident and claim records in your Home Record.')).toBeVisible();
  await expect(page.getByRole('group', { name: /Claim .*filters/ })).toHaveCount(0);
});

test('on a phone: nothing scrolls sideways, chips are reachable, and a refinement works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await startClaims(page);
  await noSidewaysScroll(page);
  const chip = scope(page).getByRole('button', { name: 'Claims', exact: true });
  await chip.scrollIntoViewIfNeeded();
  const chipBox = await chip.boundingBox();
  // WCAG 2.2 AA target size (2.5.8) is 24px; the calm filter chips are 30px, the same as the other domains'.
  expect(chipBox && chipBox.height >= 24 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 390).toBe(true);
  await chip.click();
  await expect(page.getByRole('heading', { name: '2 open claims.' })).toBeVisible();
  await noSidewaysScroll(page);
  await expect(page.locator('[data-calm-trust-line]').last()).toBeVisible();
});

test('accessibility: filters are named groups of toggle buttons operable from the keyboard, and the status region announces each result', async ({ page }) => {
  await installAskApi(page);
  await startClaims(page);
  await expect(page.getByRole('status').filter({ hasText: 'Ask response updated. Latest status: answered.' })).toBeAttached();
  const chip = state(page).getByRole('button', { name: 'Open', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: HEADLINE }).last()).toBeVisible();
  await expect(state(page).getByRole('button', { name: 'Open', exact: true }).last()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Response options' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /View sources/ }).last()).toBeVisible();
});

test('accessibility: with reduced motion requested, the settled Claims answer runs no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAskApi(page);
  await startClaims(page);
  await scope(page).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 open claims.' })).toBeVisible();
  // Poll rather than sample once: a finite CSS transition that began a frame ago must be allowed to finish.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && !(animation.effect as KeyframeEffect | null)?.target?.closest?.('[role="status"]')).length), { timeout: 5000 }).toBe(0);
});

test('recovery: a failed first request keeps the typed question in the composer, and Try again recovers', async ({ page }) => {
  await installAskApi(page, { askFailsOnce: true });
  await open(page);
  const question = 'Show my claims journey';
  await composer(page).fill(question);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(composer(page)).toHaveValue(question);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
});

test('recovery: a refinement that fails keeps the answer on screen, says so, and the same chip works on retry', async ({ page }) => {
  await installAskApi(page, { refinementFailsOnce: true });
  await startClaims(page);
  const chip = () => scope(page).getByRole('button', { name: 'Claims', exact: true });
  await chip().click();
  await expect(page.getByRole('alert').filter({ hasText: /could not refine|Ask/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await expect(page.getByText('Earlier version of this answer · show')).toHaveCount(0);
  await expect(chip()).toBeEnabled();
  await chip().click();
  await expect(page.getByRole('heading', { name: '2 open claims.' })).toBeVisible();
});
