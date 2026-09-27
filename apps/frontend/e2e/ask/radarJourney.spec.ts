import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';
import { installRadarJourney, type RadarJourneyOptions } from './radarJourneyFixtures';

// Radar R-3 (FRD v1.134): the Home Event Radar feed certified as the fifth calm domain, as one acceptance journey in the calm shell at desktop and
// phone width: the counted answer, inline event detail, governed refinement, the per-user writes (save, dismiss, restore), the confirmed writes
// (mark done, feedback, planning, notification settings), permissions, removed records, access loss, partial coverage, accessibility and recovery.
// Fixture-backed: browser behavior against the producer's shape (radarJourneyFixtures.ts), not a live backend. The planning journey starts at its
// review step here; its capture form is covered by ask.spec.ts (FRD v1.41).
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => {
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  // The consent banner is fixed to the bottom of the screen and would cover the controls under test.
  const accept = page.getByRole('button', { name: 'Accept all' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
};
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const live = (page: Page, revision: number) => page.locator(`#ask-execution-execution-radar-journey-${revision}`);
const HEADLINE = '2 events are happening now.';
const install = async (page: Page, options: RadarJourneyOptions = {}) => { const base = await installAskApi(page); const journey = await installRadarJourney(page, options); return { base, ...journey }; };
const start = async (page: Page) => { await open(page); await ask(page, 'Show my radar journey'); await expect(page.locator('[data-calm-summary]').first()).toBeVisible(); };
const timing = (page: Page) => page.getByRole('group', { name: 'Filter by timing' });
const source = (page: Page) => page.getByRole('group', { name: 'Filter by source' });
const dismissedGroup = (page: Page) => page.getByRole('group', { name: 'Dismissed events' });
const review = (page: Page, revision = 1) => live(page, revision).getByRole('button', { name: /^Review: / });
const detail = (page: Page) => page.locator('[data-ask-item-detail-sheet]');
const flow = (page: Page, id: string) => page.locator(`#ask-execution-execution-radar-journey-${id}`);
const confirmStage = (page: Page) => page.locator('[data-conversational-stage="review"]');

test('the answer says what is happening, offers one step, keeps the page links quiet, and states what it does not do', async ({ page }) => {
  await install(page);
  await start(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  const answer = live(page, 1);
  await expect(answer).toContainText('Most important: Heat advisory.');
  await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('1 high priority');
  await expect(page.getByRole('list', { name: 'At a glance' })).toContainText('1 upcoming');
  // One filled step, the top-ranked event; nothing else is a filled button.
  await expect(answer.locator('[data-radar-review-top]')).toHaveCount(1);
  await expect(review(page)).toHaveText('Review: Heat advisory');
  await expect(answer.locator('button.bg-teal-700')).toHaveCount(1);
  await expect(answer.getByRole('link', { name: /Open Home Event Radar/ })).toHaveCount(1);
  await expect(answer.locator('[data-calm-footnote]')).toContainText('not an emergency alert service and does not confirm that nothing else is happening');
  expect((await answer.locator('[data-calm-summary]').allTextContents()).join(' ')).not.toMatch(/safe|no risk|nothing to worry|guarantee/i);
});

test('the step opens the event inline, from the live record, without leaving the conversation', async ({ page }) => {
  await install(page);
  await start(page);
  await review(page).click();
  await expect(detail(page).getByRole('heading', { name: 'Heat advisory', exact: true })).toBeVisible();
  await expect(detail(page).getByText('This event covers your recorded property location.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await page.keyboard.press('Escape');
  await expect(detail(page)).toHaveCount(0);
  await expect(review(page)).toBeFocused();
});

test('filters replace the result: each chip continues the source, replaces one dimension, keeps the question, and can be cleared', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await expect(timing(page).getByRole('button', { name: 'Any time' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

  await timing(page).getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 upcoming event.' })).toBeVisible();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Only show upcoming events', launchContext: { sourceExecutionId: 'execution-radar-journey-1' } });
  await expect(page.getByText('Earlier version of this answer · show')).toBeVisible();
  await expect(page.getByText('Show my radar journey', { exact: true }).first()).toBeVisible();
  const applied = timing(page).getByRole('button', { name: 'Upcoming', exact: true });
  await expect(applied).toHaveAttribute('aria-pressed', 'true');
  await expect(applied).toBeDisabled();
  await expect(live(page, 2)).toContainText('Most important: Boil water notice.');
  await expect(live(page, 2)).not.toContainText('Heat advisory');

  // Only sources that have events under the other filters are offered, and the applied timing stays.
  await expect(source(page).getByRole('button', { name: 'Utility' })).toBeVisible();
  await expect(source(page).getByRole('button', { name: 'Weather' })).toHaveCount(0);

  // The source replaces only itself: the timing stays.
  await source(page).getByRole('button', { name: 'Utility' }).click();
  await expect(page.getByRole('heading', { name: '1 upcoming utility event.' })).toBeVisible();
  await expect(timing(page).getByRole('button', { name: 'Upcoming', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: HEADLINE }).last()).toBeVisible();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Now show all events with no filters' });
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});

test('a filter that matches nothing keeps the answer, says so, and can be widened', async ({ page }) => {
  await install(page);
  await start(page);
  await timing(page).getByRole('button', { name: 'Recently ended', exact: true }).click();
  await source(page).getByRole('button', { name: 'Weather' }).click();
  await timing(page).getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No monitored events match these filters.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Review: / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  await expect(source(page).getByRole('button', { name: 'Weather' })).toHaveAttribute('aria-pressed', 'true');
});

test('dismissed events are hidden by default, shown on request, and the control reverses', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await expect(dismissedGroup(page).getByRole('button', { name: 'Hide dismissed' })).toHaveAttribute('aria-pressed', 'true');
  await dismissedGroup(page).getByRole('button', { name: 'Include dismissed' }).click();
  await expect(page.getByRole('heading', { name: '3 events are happening now.' })).toBeVisible();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Now show events including dismissed ones' });
  await dismissedGroup(page).getByRole('button', { name: 'Hide dismissed' }).click();
  await expect(page.getByRole('heading', { name: HEADLINE }).last()).toBeVisible();
});

test('Save, Dismiss and Restore are direct, per-user writes: no confirmation, a receipt, and the detail follows the live state', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await review(page).click();
  await detail(page).locator('[data-radar-action="radar-save"]').click();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Save this monitored event.', launchContext: { entityType: 'RADAR_MATCH', entityId: 'radar-heat', operationId: 'HOME_EVENT_RADAR_STATE' } });
  const receipt = page.locator('[data-calm-receipt="completed"]').last();
  await expect(receipt).toContainText('Event saved');
  await expect(receipt).toContainText('other household members keep their own view');
  await expect(page.locator('[data-conversational-stage="review"]')).toHaveCount(0);
  expect(api.confirmBodies).toHaveLength(0);
  // The detail re-reads the live record: an already-saved event no longer offers Save.
  await review(page).click();
  await expect(detail(page).locator('[data-radar-action="radar-save"]')).toHaveCount(0);
  await expect(detail(page).locator('[data-radar-action="radar-dismiss"]')).toBeVisible();
  await detail(page).locator('[data-radar-action="radar-dismiss"]').click();
  await expect(page.locator('[data-calm-receipt="completed"]').last()).toContainText('Event dismissed');
});

test('a dismissed event can be restored from the same inline detail', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await dismissedGroup(page).getByRole('button', { name: 'Include dismissed' }).click();
  await source(page).getByRole('button', { name: 'Utility' }).click();
  await expect(page.getByRole('heading', { name: '1 event is happening now.' })).toBeVisible();
  await expect(live(page, 3)).toContainText('Most important: Planned power outage.');
  await review(page, 3).click();
  await expect(detail(page).locator('[data-radar-action="radar-restore"]')).toBeVisible();
  await expect(detail(page).locator('[data-radar-action="radar-dismiss"]')).toHaveCount(0);
  await detail(page).locator('[data-radar-action="radar-restore"]').click();
  await expect(page.locator('[data-calm-receipt="completed"]').last()).toContainText('Event restored');
  expect(api.stateOf('radar-outage')).toBe('new');
});

test('Mark done goes through review, consent and confirmation to a receipt, and cancel is distinct from confirm', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await review(page).click();
  await detail(page).locator('[data-radar-action="radar-mark-done"]').click();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Mark this monitored event as done.', launchContext: { entityId: 'radar-heat', operationId: 'HOME_EVENT_RADAR_MARK_DONE', sourceExecutionId: 'execution-radar-journey-1' } });
  await expect(flow(page, 'done')).toContainText('Review · nothing is saved until you confirm');
  await expect(page.getByText('Mark "Heat advisory" as done?').first()).toBeVisible();
  await expect(flow(page, 'done').getByRole('button', { name: 'Mark done', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.getByRole('checkbox').check();
  await flow(page, 'done').getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect.poll(() => api.confirmBodies).toEqual([expect.objectContaining({ consentConfirmed: true })]);
  const receipt = page.locator('[data-calm-receipt="completed"]');
  await expect(receipt).toContainText('Event marked done');
  await expect(receipt.getByRole('link', { name: /Open in Home Event Radar/ })).toHaveClass(/bg-teal-700/);
  expect(api.stateOf('radar-heat')).toBe('acted_on');
});

test('an unknown outcome is reconciled by a status check, never a second execution invitation, before the receipt', async ({ page }) => {
  const api = await install(page, { unknownOutcomeOnce: true });
  await start(page);
  await review(page).click();
  await detail(page).locator('[data-radar-action="radar-mark-done"]').click();
  await page.getByRole('checkbox').check();
  await flow(page, 'done').getByRole('button', { name: 'Mark done', exact: true }).click();
  const unknown = page.locator('[data-calm-outcome-unknown]');
  await expect(unknown).toContainText('Outcome not yet known');
  await expect(flow(page, 'done').getByRole('button', { name: 'Mark done', exact: true })).toHaveCount(0);
  await unknown.getByRole('button', { name: 'Check status' }).click();
  await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Event marked done');
  expect(api.confirmBodies).toHaveLength(2);
});

test('a confirmation the requester is no longer authorised to make is refused, redacts that result, and changes nothing', async ({ page }) => {
  const api = await install(page, { confirmDenied: true });
  await start(page);
  await review(page).click();
  await detail(page).locator('[data-radar-action="radar-mark-done"]').click();
  await page.getByRole('checkbox').check();
  await flow(page, 'done').getByRole('button', { name: 'Mark done', exact: true }).click();
  const denied = page.locator('#ask-execution-execution-radar-journey-done');
  await expect(denied).toHaveAttribute('role', 'alert');
  await expect(denied.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(denied).toContainText('Access to this result is no longer available.');
  await expect(page.locator('[data-calm-receipt]')).toHaveCount(0);
  expect(api.confirmBodies).toHaveLength(1);
  expect(api.stateOf('radar-heat')).toBe('new');
});

test('feedback: the reason is edited in the review, then confirmed', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await review(page).click();
  await detail(page).locator('[data-radar-action="radar-feedback"]').click();
  await expect(page.getByText('Send feedback on "Heat advisory"?').first()).toBeVisible();
  await flow(page, 'feedback').getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByLabel('Reason').selectOption('not_relevant');
  await flow(page, 'feedback').getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect.poll(() => api.editBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, edits: expect.objectContaining({ feedbackType: 'not_relevant' }) })]);
  await page.getByLabel(/I want to send this feedback to Home Event Radar/).check();
  await flow(page, 'feedback').getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect.poll(() => api.confirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 2, consentConfirmed: true })]);
  await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Feedback sent');
});

test('planning a recommended action sends its code, then review and a receipt', async ({ page }) => {
  const api = await install(page);
  await start(page);
  await review(page).click();
  await expect(detail(page).locator('[data-radar-action="radar-plan-task"]')).toHaveCount(0);
  await detail(page).getByRole('button', { name: 'Plan this action: Check your cooling and water supply' }).click();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Plan this recommended action from a monitored event.', launchContext: { entityId: 'radar-heat', operationId: 'HOME_EVENT_RADAR_TASK', actionId: 'CHECK_COOLING' } });
  await page.getByLabel(/I authorize adding this to the shared maintenance list/).check();
  await flow(page, 'task').getByRole('button', { name: 'Set reminder', exact: true }).click();
  await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Reminder set');
});

test('notification settings are a quiet action on the feed, reviewed before they are saved', async ({ page }) => {
  const api = await install(page);
  await start(page);
  const settings = live(page, 1).getByRole('button', { name: 'Notification settings' });
  await expect(settings).not.toHaveClass(/bg-teal-700/);
  await settings.click();
  await expect.poll(() => api.bodies.at(-1)).toMatchObject({ message: 'Change my Home Event Radar notification settings.', launchContext: { operationId: 'HOME_EVENT_RADAR_PREFERENCES' } });
  await expect(page.getByText('Save these notification settings?').first()).toBeVisible();
  await page.getByLabel(/I want Home Event Radar to use these notification settings for me/).check();
  await flow(page, 'prefs').getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.locator('[data-calm-receipt="completed"]')).toContainText('Notification settings saved');
});

test('a viewer sees the same recorded answer and can save or dismiss, with no mark-done, feedback, planning or settings control anywhere', async ({ page }) => {
  await install(page, { viewer: true });
  await start(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await expect(live(page, 1).getByRole('button', { name: 'Notification settings' })).toHaveCount(0);
  await review(page).click();
  await expect(detail(page).locator('[data-radar-action="radar-save"]')).toBeVisible();
  await expect(detail(page).locator('[data-radar-action="radar-dismiss"]')).toBeVisible();
  await expect(detail(page).locator('[data-radar-action="radar-mark-done"], [data-radar-action="radar-feedback"], [data-radar-plan-action]')).toHaveCount(0);
});

test('an event removed after the answer says so in its detail and the conversation continues', async ({ page }) => {
  await install(page, { removedEvent: true });
  await start(page);
  await review(page).click();
  await expect(detail(page).getByRole('alert')).toContainText('Event no longer exists');
  await expect(detail(page).getByRole('alert')).toContainText('This monitored event was removed or is no longer visible after the Ask result was created.');
  await page.keyboard.press('Escape');
  await expect(composer(page)).toBeEnabled();
});

test('losing access to the home redacts the whole result instead of leaving stale events on screen', async ({ page }) => {
  await install(page, { detailAccessLost: true });
  await start(page);
  await review(page).click();
  const answer = live(page, 1);
  await expect(answer).toHaveAttribute('role', 'alert');
  await expect(answer.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(answer).toContainText('Access to this result is no longer available.');
  await expect(answer.getByText('Air quality alert')).toHaveCount(0);
});

test('partial coverage says so and never reads as a complete picture', async ({ page }) => {
  await install(page, { partial: true });
  await start(page);
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  // A degraded feed keeps its own coverage boundary, as a warning card (it carries a next step), instead of the general footnote.
  await expect(live(page, 1)).toContainText('Monitoring only partially covers this property');
  await expect(live(page, 1)).toContainText('so this may not reflect every current event.');
  await expect(live(page, 1)).not.toContainText('This is not an emergency alert service');
  await expect(live(page, 1).locator('[data-calm-footnote]')).toHaveCount(0);
});

test('an empty record is not read as "nothing is happening", and it still offers the page', async ({ page }) => {
  await install(page, { empty: true });
  await open(page);
  await ask(page, 'Show my radar journey');
  await expect(page.getByRole('heading', { name: 'No monitored events recorded yet' })).toBeVisible();
  await expect(page.getByText(/confirm your property address to enable monitoring/)).toBeVisible();
  await expect(page.getByRole('group', { name: /Filter by/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open Home Event Radar/ })).toBeVisible();
});

test('on a phone: nothing scrolls sideways, chips are reachable, the detail opens as a sheet, and a refinement works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await start(page);
  await noSidewaysScroll(page);
  const chip = timing(page).getByRole('button', { name: 'Upcoming', exact: true });
  await chip.scrollIntoViewIfNeeded();
  const chipBox = await chip.boundingBox();
  // WCAG 2.2 AA target size (2.5.8) is 24px; the calm filter chips are 32px, the same as the other domains'.
  expect(chipBox && chipBox.height >= 24 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 390).toBe(true);
  await review(page).click();
  const box = await detail(page).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await page.keyboard.press('Escape');
  await chip.click();
  await expect(page.getByRole('heading', { name: '1 upcoming event.' })).toBeVisible();
  await noSidewaysScroll(page);
});

test('accessibility: filters are named groups of toggle buttons operable from the keyboard, and the status region announces each result', async ({ page }) => {
  await install(page);
  await start(page);
  await expect(page.getByRole('status').filter({ hasText: 'Ask response updated. Latest status: answered.' })).toBeAttached();
  const chip = timing(page).getByRole('button', { name: 'Happening now', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '2 current events.' })).toBeVisible();
  await expect(timing(page).getByRole('button', { name: 'Happening now', exact: true }).last()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Response options' }).last()).toBeVisible();
});

test('accessibility: with reduced motion requested, the settled Radar answer runs no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await install(page);
  await start(page);
  await timing(page).getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 upcoming event.' })).toBeVisible();
  // Poll rather than sample once: a finite CSS transition that began a frame ago must be allowed to finish.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && !(animation.effect as KeyframeEffect | null)?.target?.closest?.('[role="status"]')).length), { timeout: 5000 }).toBe(0);
});

test('recovery: a failed first request keeps the typed question in the composer, and Try again recovers', async ({ page }) => {
  await install(page, { failFirstAsk: true });
  await open(page);
  const question = 'Show my radar journey';
  await composer(page).fill(question);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(composer(page)).toHaveValue(question);
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
});

test('recovery: a refinement that fails keeps the answer on screen, says so, and the same chip works on retry', async ({ page }) => {
  await install(page, { failFirstRefinement: true });
  await start(page);
  const chip = () => timing(page).getByRole('button', { name: 'Upcoming', exact: true });
  await chip().click();
  await expect(page.getByRole('alert').filter({ hasText: /could not refine|Ask/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: HEADLINE })).toBeVisible();
  await expect(page.getByText('Earlier version of this answer · show')).toHaveCount(0);
  await expect(chip()).toBeEnabled();
  await chip().click();
  await expect(page.getByRole('heading', { name: '1 upcoming event.' })).toBeVisible();
});
