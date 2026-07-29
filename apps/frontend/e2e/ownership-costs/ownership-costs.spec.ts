import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import {
  installOwnershipCostRoutes,
  PROPERTY_ID,
  VIEWS,
} from './ownershipCostFixtures';

test.beforeEach(async ({ page }) => {
  await installOwnershipCostRoutes(page);
});

for (const [view, heading] of VIEWS) {
  test(`${view} view passes target-build accessibility and keyboard checks`, async ({ page }) => {
    await page.goto(`/acceptance/ownership-costs/${PROPERTY_ID}?view=${view}`);
    await expect(page.getByRole('heading', { name: 'Cost of owning this home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ownership cost views' })).toBeVisible();

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY']).toContain(focused);

    await page.addScriptTag({ content: axeCore.source });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: typeof axeCore }).axe;
      return (await axe.run(document)).violations;
    });
    expect(violations).toEqual([]);
  });
}
