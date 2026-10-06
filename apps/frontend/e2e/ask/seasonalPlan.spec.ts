import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// The seasonal home-care answer in the calm shell (the default): an intro with a season icon, "Do these soon" and "Can wait" as numbered
// cards that open to a how-to, and next steps that ask inside the conversation. Nothing on it links to the desktop seasonal page.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

async function askForNextSeason(page: import('@playwright/test').Page) {
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('button', { name: 'Essential only' }).click({ timeout: 2000 }).catch(() => undefined);
  await page.getByPlaceholder(/^Ask anything about /).fill('What should I do to get ready for next season?');
  await page.getByRole('button', { name: 'Send question' }).click();
  return page.locator('#ask-execution-execution-seasonal-plan');
}

test('the seasonal plan: soon / can wait cards, a how-to that opens, and three in-Ask next steps', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const api = await installAskApi(page);
  const response = await askForNextSeason(page);

  await expect(response.locator('[data-seasonal-intro]')).toContainText('Getting ready for winter');
  await expect(response.locator('[data-seasonal-intro] svg')).toBeVisible();
  const soon = response.locator('[data-seasonal-section="seasonal-soon"]');
  const wait = response.locator('[data-seasonal-section="seasonal-wait"]');
  await expect(soon.getByRole('heading', { name: /Do these soon/ })).toContainText('(2)');
  await expect(wait.getByRole('heading', { name: /Can wait/ })).toContainText('(2)');
  await expect(soon.locator('[data-seasonal-task]')).toHaveCount(2);
  await expect(wait.locator('[data-seasonal-task]')).toHaveCount(2);
  await expect(soon.locator('[data-seasonal-task]').first()).toContainText('Replace furnace filters monthly');
  await expect(soon.locator('[data-seasonal-task]').first()).toContainText('High priority');

  // A how-to opens inline and closes again; nothing navigates.
  const first = soon.locator('[data-seasonal-task]').first();
  await first.getByRole('button', { name: 'How to do it' }).click();
  await expect(first.locator('[data-seasonal-task-detail]')).toContainText('About 15 minutes');
  await first.getByRole('button', { name: 'Hide details' }).click();
  await expect(first.locator('[data-seasonal-task-detail]')).toHaveCount(0);
  await expect(response.locator('a[href*="/dashboard/seasonal"]')).toHaveCount(0);

  // The three next steps are all offered, and each asks inside the conversation with its own operation.
  const next = response.locator('[data-seasonal-next-steps]');
  await expect(next.getByRole('button')).toHaveCount(3);
  await page.screenshot({ path: process.env.SEASONAL_SHOT ?? 'test-results/seasonal-plan.png', fullPage: false });
  await next.getByRole('button', { name: /Update home details/ }).click();
  await expect.poll(() => api.executionBodies.length).toBeGreaterThan(1);
  expect(api.executionBodies.at(-1)?.message).toBe('How complete is my home record?');
});

test('on a phone the plan stays inside the screen and its buttons remain reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1400 });
  await installAskApi(page);
  const response = await askForNextSeason(page);
  await expect(response.locator('[data-seasonal-section="seasonal-soon"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await response.locator('[data-seasonal-task]').first().getByRole('button', { name: 'How to do it' }).click();
  await expect(response.locator('[data-seasonal-task-detail]')).toBeVisible();
  await expect(response.locator('[data-seasonal-next-steps]').getByRole('button', { name: /Add these to my tasks/ })).toBeVisible();
  await page.screenshot({ path: process.env.SEASONAL_SHOT_MOBILE ?? 'test-results/seasonal-plan-mobile.png' });
});
