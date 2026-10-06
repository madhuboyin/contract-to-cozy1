import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// The Home Habit Coach answers in the calm shell: the list as numbered cards (start with these / up next / routine / snoozed) with a Review
// button and an expandable fact sheet, and one habit's review with its next steps. Nothing links to the desktop Home Habit Coach page.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

async function ask(page: import('@playwright/test').Page, question: string) {
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('button', { name: 'Essential only' }).click({ timeout: 2000 }).catch(() => undefined);
  await page.getByPlaceholder(/^Ask anything about /).fill(question);
  await page.getByRole('button', { name: 'Send question' }).click();
}

test('the habits list: numbered groups, a Review button per habit, facts that open, and no desktop link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const api = await installAskApi(page);
  await ask(page, 'Show my home habits');
  const response = page.locator('#ask-execution-execution-home-habits');
  await expect(response.locator('[data-seasonal-intro]')).toContainText('habits to work on');
  await expect(response.locator('[data-seasonal-section="home-habits-start"] [data-seasonal-task]')).toHaveCount(2);
  await expect(response.locator('[data-seasonal-section="home-habits-up-next"] [data-seasonal-task]')).toHaveCount(1);
  await expect(response.locator('[data-seasonal-section="home-habits-routine"] [data-seasonal-task]')).toHaveCount(1);
  await expect(response.locator('[data-seasonal-section="home-habits-snoozed"] [data-seasonal-task]')).toHaveCount(1);
  const first = response.locator('[data-seasonal-task="h1"]');
  await expect(first).toContainText('Suggested for Aug 18, 2026');
  await first.getByRole('button', { name: 'Show details' }).click();
  await expect(first.locator('[data-seasonal-task-detail]')).toContainText('Press and hold the test button.');
  await expect(response.locator('a[href*="home-habit-coach"]')).toHaveCount(0);
  await page.screenshot({ path: process.env.HABITS_SHOT ?? 'test-results/habits-list.png' });
  await first.getByRole('button', { name: 'Review' }).click();
  await expect.poll(() => api.executionBodies.length).toBe(2);
  expect(api.executionBodies[1].message).toBe('Review the home habit "Test Smoke and CO Detectors".');
});

test('a habit review is one guide card whose actions each open a confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const api = await installAskApi(page);
  await ask(page, 'Review the home habit "Test Smoke and CO Detectors".');
  const guide = page.locator('#ask-execution-execution-home-habit-review [data-task-guide]');
  await expect(guide.getByRole('heading', { name: 'Test Smoke and CO Detectors' })).toBeVisible();
  await expect(guide.getByRole('navigation', { name: 'Where this is' })).toContainText('Home habits');
  await expect(guide.locator('[data-task-guide-tip]')).toContainText('Press and hold the test button.');
  await expect(guide.locator('[data-task-guide-actions] button')).toHaveCount(6);
  await page.screenshot({ path: process.env.HABIT_REVIEW_SHOT ?? 'test-results/habit-review.png' });
  await guide.getByRole('button', { name: /Add to my routine/ }).click();
  await expect.poll(() => api.executionBodies.length).toBe(2);
  expect(api.executionBodies[1].message).toBe('Add this habit to my maintenance routine.');
});

test('on a phone the habits list stays inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1400 });
  await installAskApi(page);
  await ask(page, 'Show my home habits');
  const response = page.locator('#ask-execution-execution-home-habits');
  await expect(response.locator('[data-seasonal-section="home-habits-start"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: process.env.HABITS_SHOT_MOBILE ?? 'test-results/habits-mobile.png' });
});
