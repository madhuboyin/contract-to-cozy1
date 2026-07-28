import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/properties/home-digital-twin-acceptance-property/home-digital-twin', async (route) => {
    await route.fulfill({ json: { success: true, data: { twin: null, context: null } } });
  });
});

test('mobile keeps the outcome and primary action visible without horizontal overflow', async ({ page }) => {
  await page.goto('/acceptance/home-digital-twin');
  await expect(page.getByRole('heading', { name: 'Home Upgrade Planner' })).toBeVisible();
  await expect(page.getByRole('button', { name: /build my home model/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
