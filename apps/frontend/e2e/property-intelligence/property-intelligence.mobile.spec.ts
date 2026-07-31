import { expect, test } from '@playwright/test';
import {
  installAuthenticatedContext,
  installPropertyIntelligenceApi,
} from './fixtures';

test.beforeEach(async ({ context, page }) => {
  await installAuthenticatedContext(context);
  await installPropertyIntelligenceApi(page);
});

test('mobile pilot preserves source, geography, and canonical journey without overflow', async ({
  page,
}) => {
  await page.goto('/acceptance/property-intelligence');

  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);
  await expect(page.getByText('New York City Department of City Planning').first()).toBeVisible();
  await expect(page.getByText('No exact point distance is available.')).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'A NYC planning application was filed in Manhattan',
  })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open canonical owner' })).toBeVisible();
});
