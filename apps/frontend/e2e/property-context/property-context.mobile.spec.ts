import { expect, test } from '@playwright/test';
import { installAuthenticatedContext, installPropertyContextApi } from './fixtures';

test('structured capture remains usable at a narrow viewport', async ({ context, page }) => {
  await installAuthenticatedContext(context);
  await installPropertyContextApi(page, 'structured');
  await page.goto('/acceptance/property-context?scenario=structured');

  const panel = page.getByRole('region', { name: 'Outdoor space details' });
  await expect(panel).toBeVisible();
  const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(viewportFits).toBe(true);

  for (const button of await panel.getByRole('button').all()) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
