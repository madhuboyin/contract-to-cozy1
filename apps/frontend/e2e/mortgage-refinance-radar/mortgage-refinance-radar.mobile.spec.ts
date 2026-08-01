import { expect, test } from '@playwright/test';
import { installRefinanceRoutes, REFINANCE_IDS } from './refinanceFixtures';

test.beforeEach(async ({ page }) => {
  await installRefinanceRoutes(page);
});

for (const propertyId of [
  REFINANCE_IDS.open,
  REFINANCE_IDS.closed,
  REFINANCE_IDS.partial,
  REFINANCE_IDS.staleMortgage,
]) {
  test(`${propertyId} remains usable without horizontal page scrolling`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/acceptance/mortgage-refinance-radar/${propertyId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Mortgage Refinance Radar' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.getByRole('button', { name: 'Home tools' })).toBeVisible();
  });
}
