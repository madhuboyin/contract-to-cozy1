import { expect, test } from '@playwright/test';
import {
  installOwnershipCostRoutes,
  PROPERTY_ID,
  VIEWS,
} from './ownershipCostFixtures';

test.beforeEach(async ({ page }) => {
  await installOwnershipCostRoutes(page);
});

for (const [view, heading] of VIEWS) {
  test(`${view} view remains usable without viewport overflow`, async ({ page }) => {
    await page.goto(`/acceptance/ownership-costs/${PROPERTY_ID}?view=${view}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ownership cost views' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
}
