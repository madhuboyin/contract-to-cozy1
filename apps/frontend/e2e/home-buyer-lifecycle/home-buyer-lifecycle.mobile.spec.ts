import { expect, test } from '@playwright/test';

test('mobile keeps the handoff, homeowner surface, and advocacy actions usable without overflow', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/acceptance/home-buyer-lifecycle');

  await expect(page.getByRole('heading', { name: 'Welcome home. Your first 90 days are organized.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Harbor View Home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You’ve built real momentum in your new home.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invite co-buyer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recommend to a buyer' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
