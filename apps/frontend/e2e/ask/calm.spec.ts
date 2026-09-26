import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (FRD v1.111): the calm shell is the default for everyone. These specs use the default;
// every other spec in this folder pins the setting off (see installAskContext) so it keeps checking the previous presentation.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

test('calm landing: greeting, composer and one row of suggestions, and no helper copy', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.locator('[data-ask-layout="full-window"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Cozy' })).toHaveCount(1);
  await expect(page.getByText('Answers use your selected home record')).toHaveCount(0);
  await expect(page.locator('[data-calm-headline]')).toBeVisible();
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeInViewport();
  await expect(page.getByText('Enter to send · Shift+Enter for a new line')).toHaveCount(0);
  await expect(page.getByText('Record-based when available')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'For your attention' })).toHaveCount(0);
  await expect(page.locator('[data-calm-landing]')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Needs your attention' }).getByRole('button', { name: /to plan soon/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Needs your attention' }).getByRole('button', { name: /to plan soon/ })).toContainText('Schedule HVAC service');
  await expect(page.getByRole('button', { name: /More ideas/ })).toBeVisible();
  await expect(page.getByText('Top priority')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Suggestions' }).getByRole('button')).not.toHaveCount(0);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await expect(conversationNav.getByText('Your home assistant')).toHaveCount(0);
  await expect(conversationNav.getByText(/navigation remains available above/)).toHaveCount(0);
  await expect(conversationNav.getByPlaceholder('Search conversations')).toBeVisible();

  const chip = page.getByRole('list', { name: 'Needs your attention' }).getByRole('button').first();
  await chip.click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('calm answer: no answer frame, one overflow menu, and the composer stays plain', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('list', { name: 'Suggestions' }).getByRole('button').first().click();
  const options = page.getByRole('button', { name: 'Response options' });
  await expect(options.first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh this result/ })).toHaveCount(0);
  await expect(page.locator('article > div.rounded-3xl')).toHaveCount(0);
  await expect(page.getByText('Enter to send · Shift+Enter for a new line')).toHaveCount(0);
  await options.first().click();
  await expect(page.getByRole('menuitem', { name: /Refresh/ })).toBeVisible();
});

test('calm domain list: the list has no outer frame and the summary leads', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my claims');
  await page.keyboard.press('Enter');
  const list = page.locator('article section.overflow-hidden').first();
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('[data-calm-summary]').first()).toBeVisible();
});

test('calm tool discovery: one compact row for the match, related tools collapsed, no per-tool paragraphs', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is there a tool to help with refinancing?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'Best match for your goal' })).toBeVisible();
  await expect(page.getByText('More home details will improve the result')).toBeVisible();
  await expect(page.getByText(/Full tool:/)).toHaveCount(0);
  const related = page.locator('details[data-calm-secondary]');
  await expect(related).toHaveCount(1);
  await expect(related).not.toHaveAttribute('open', '');
  await related.locator('summary').click();
  await expect(related.getByRole('link', { name: /Open Break-Even/ })).toBeVisible();
});

test('calm desktop: no second title band, the status dot sits in the rail, and there is one page heading', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Cozy' })).toHaveCount(1);
  await expect(page.locator('header').filter({ hasText: 'Ask Cozy' })).toBeHidden();
});

test('?calm=0 returns to the previous presentation and is remembered', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}&calm=0`);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await expect(page.getByText('Answers use your selected home record')).toBeVisible();
  await expect(page.locator('[data-calm-landing]')).toHaveCount(0);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await page.goto(`/acceptance/ask?propertyId=${propertyId}&calm=1`);
  await expect(page.locator('[data-calm-landing]')).toBeVisible();
});

// FRD §11.12 slice G (IW-CONV-004/005): the completion flow is asked one question at a time.
const startCompletion = async (page: import('@playwright/test').Page, suffix = '') => {
  await page.goto(`/acceptance/ask?propertyId=${propertyId}${suffix}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Complete a maintenance task');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Which task did you complete?')).toBeVisible();
};
const CHIMNEY = 'Chimney cleaning and inspection · due Sep 23, 2026';

test('calm completion: one question at a time with quick replies, then the review, then done', async ({ page }) => {
  const api = await installAskApi(page);
  await startCompletion(page);
  // The form card and its long helper copy are not drawn.
  await expect(page.getByText('Maintenance completion details')).toHaveCount(0);
  await expect(page.getByText(/Which task was completed, and was there an actual cost/)).toHaveCount(0);
  await expect(page.getByText('Was there an actual cost?')).toHaveCount(0);
  await page.getByRole('button', { name: CHIMNEY }).click();
  await expect(page.getByText('Was there an actual cost?')).toBeVisible();
  await expect(page.getByText('(optional)')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your answers so far' })).toContainText('Chimney cleaning and inspection');
  await page.getByLabel('Actual cost').fill('120');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Mark this maintenance task complete?')).toBeVisible();
  expect(api.captureBodies.at(-1)).toMatchObject({ captureKey: 'MAINTENANCE_COMPLETION_INPUTS', answer: { taskId: 'task-chimney', actualCostUsd: 120 } });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByText('Task marked complete')).toBeVisible();
});

test('calm completion: an optional question can be skipped and nothing is invented for it', async ({ page }) => {
  const api = await installAskApi(page);
  await startCompletion(page);
  await page.getByRole('button', { name: CHIMNEY }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('Mark this maintenance task complete?')).toBeVisible();
  expect(api.captureBodies.at(-1)?.answer).toEqual({ taskId: 'task-chimney' });
  await expect(page.getByText('Not recorded')).toBeVisible();
});

test('calm completion: an earlier answer can be changed before anything is submitted', async ({ page }) => {
  const api = await installAskApi(page);
  await startCompletion(page);
  await page.getByRole('button', { name: CHIMNEY }).click();
  await expect(page.getByText('Was there an actual cost?')).toBeVisible();
  await page.getByRole('button', { name: /Change Open task/ }).click();
  await expect(page.getByText('Which task did you complete?')).toBeVisible();
  await page.getByRole('button', { name: /HVAC Furnace/ }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('Mark this maintenance task complete?')).toBeVisible();
  expect(api.captureBodies).toHaveLength(1);
  expect(api.captureBodies[0]?.answer).toEqual({ taskId: 'task-furnace' });
});

test('the previous form is unchanged with ?calm=0', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}&calm=0`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Complete a maintenance task');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Maintenance completion details')).toBeVisible();
  await expect(page.getByText('Which task did you complete?')).toHaveCount(0);
});

// FRD §11.12 slice H (IW-CONV-006/012): the turn is on screen as soon as a question is sent.
test('calm pending turn: the question and a status appear at once, and the answer replaces them in place', async ({ page }) => {
  await installAskApi(page, { slowAnswerMs: 1500 });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.keyboard.press('Enter');
  const pending = page.locator('[data-pending-turn]');
  await expect(pending).toBeVisible();
  await expect(pending.getByText('What maintenance tasks are due this month?')).toBeVisible();
  await expect(pending.getByRole('status')).toHaveText('Checking your maintenance records…');
  await expect(page.getByRole('heading', { name: 'How can I help with your home?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  const before = await pending.getByText('What maintenance tasks are due this month?').boundingBox();
  await expect(pending).toHaveCount(0, { timeout: 8000 });
  // The question bubble only: the history rail also lists the question as the conversation's title.
  const answered = page.locator('main .bg-slate-900', { hasText: 'What maintenance tasks are due this month?' });
  await expect(answered).toHaveCount(1);
  const after = await answered.boundingBox();
  // The question does not move when the answer arrives.
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(2);
});

test('calm pending turn: stopping returns the question to the composer', async ({ page }) => {
  await installAskApi(page, { slowAnswerMs: 4000 });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-pending-turn]')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('[data-pending-turn]')).toHaveCount(0);
  await expect(page.getByPlaceholder('Ask anything about your home…')).toHaveValue('What maintenance tasks are due this month?');
});

test('with ?calm=0 there is no pending turn: the previous behavior is kept', async ({ page }) => {
  await installAskApi(page, { slowAnswerMs: 1500 });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}&calm=0`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('[data-pending-turn]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
});
