import { expect, test } from '@playwright/test';
import {
  caseId,
  installAuthenticatedContext,
  installRenovationApi,
  propertyId,
} from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('mobile workspace and case remain readable without document-level overflow', async ({ page }) => {
  await installRenovationApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/renovations`);

  await expect(page.getByRole('heading', { name: 'Renovations', exact: true })).toBeVisible();
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);

  const openPlan = page.getByRole('link', { name: 'Open plan' });
  expect((await openPlan.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  await openPlan.click();

  await expect(page).toHaveURL(new RegExp(`/renovations/${caseId}$`));
  await expect(page.getByRole('navigation', { name: 'Renovation stages' })).toBeVisible();
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
  expect((await page.getByRole('link', { name: 'Resolve 2 blocking readiness items' }).boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(40);
});
