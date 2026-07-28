import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/properties/home-digital-twin-acceptance-property/home-digital-twin', async (route) => {
    await route.fulfill({ json: { success: true, data: { twin: null, context: null } } });
  });
});

test('desktop presents the homeowner outcome and passes automated accessibility', async ({ page }) => {
  await page.goto('/acceptance/home-digital-twin');
  await expect(page.getByRole('heading', { name: 'Home Upgrade Planner' })).toBeVisible();
  await expect(page.getByText(/compare repair, replacement, upgrade, and wait options/i)).toBeVisible();
  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })).violations;
  });
  expect(violations).toEqual([]);
});
