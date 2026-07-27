import { expect, test } from '@playwright/test';
import { installAuthenticatedContext, installMarketContextApi } from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('mobile market context has no horizontal overflow and preserves source access', async ({
  page,
}) => {
  await installMarketContextApi(page);
  await page.goto('/acceptance/coverage-launch');

  await expect(page.getByText('Observed market context — not a quote')).toBeVisible();
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);
  await expect(page.getByRole('link', { name: 'Reviewed market source' })).toBeVisible();
  await expect(page.getByText(/not a personal insurance quote or carrier offer/)).toBeVisible();
});
