import { expect, test } from '@playwright/test';
import {
  installAuthenticatedContext,
  installCoverageJourneyApi,
  installMarketContextApi,
} from './fixtures';

test.beforeEach(async ({ context, page }) => {
  await installAuthenticatedContext(context);
  await installCoverageJourneyApi(page);
  await installMarketContextApi(page);
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
  await expect(page.getByRole('heading', { name: 'Current policy record' })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Loss-prevention plan',
    level: 2,
  })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Licensed help' })).toBeVisible();
});
