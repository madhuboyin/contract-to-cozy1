import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import {
  caseId,
  installAuthenticatedContext,
  installRenovationApi,
  propertyId,
} from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('canonical workspace advances one renovation through one primary next action', async ({ page }) => {
  await installRenovationApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/renovations`);

  await expect(page.getByRole('heading', { name: 'Renovations', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kitchen and electrical remodel' })).toBeVisible();
  await expect(page.getByText('Is this renovation ready to start?')).toBeVisible();
  await page.getByRole('link', { name: 'Open plan' }).focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/renovations/${caseId}$`));
  await expect(page.getByRole('heading', { name: 'Is this renovation ready to start?' })).toBeVisible();
  const currentStage = page.getByRole('navigation', { name: 'Renovation stages' })
    .locator('[aria-current="step"]');
  await expect(currentStage).toHaveText('Readiness');
  await expect(page.getByRole('link', { name: 'Resolve 2 blocking readiness items' })).toHaveCount(1);
  await expect(page.getByText('2 specialist records linked to this plan.')).toBeVisible();
  await expect(page.getByText(/must be verified with the appropriate authority/i)).toBeVisible();
});

test('workspace exposes empty state without inventing a renovation plan', async ({ page }) => {
  await installRenovationApi(page, { empty: true });
  await page.goto(`/dashboard/properties/${propertyId}/renovations`);

  await expect(page.getByRole('heading', { name: 'No renovation plans yet' })).toBeVisible();
  await expect(page.getByText(/does not create a plan until you explicitly select one/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore options' })).toHaveAttribute(
    'href',
    `/dashboard/properties/${propertyId}/renovations/explore`,
  );
});

test('case remains usable when readiness and compliance details fail independently', async ({ page }) => {
  await installRenovationApi(page, { readinessFailure: true, complianceFailure: true });
  await page.goto(`/dashboard/properties/${propertyId}/renovations/${caseId}`);

  await expect(page.getByRole('heading', { name: 'Kitchen and electrical remodel' })).toBeVisible();
  await expect(page.getByText('Some supporting details are temporarily unavailable.')).toBeVisible();
  await expect(page.getByText(/readiness and compliance records could not be refreshed/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resolve 2 blocking readiness items' })).toBeVisible();
});

test('requirements failure remains distinct from empty research and recovers on retry', async ({ page }) => {
  await installRenovationApi(page, { requirementsFailures: 1 });
  await page.goto(`/dashboard/properties/${propertyId}/renovations/${caseId}/requirements`);

  const requirementsAlert = page.getByRole('alert')
    .filter({ hasText: 'Requirements source temporarily unavailable' });
  await expect(requirementsAlert).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate research candidates' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(requirementsAlert).toHaveCount(0);
  await expect(page.getByText('Start scope-specific requirements research')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate research candidates' })).toBeVisible();
});

test('legacy advisor route redirects to the canonical renovation workspace', async ({ page }) => {
  await installRenovationApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/tools/home-renovation-risk-advisor`);

  await expect(page).toHaveURL(new RegExp(`/dashboard/properties/${propertyId}/renovations$`));
  await expect(page.getByRole('heading', { name: 'Renovations', exact: true })).toBeVisible();
});

test('canonical workspace passes automated accessibility and keyboard checks', async ({ page }) => {
  await installRenovationApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/renovations/${caseId}`);

  await page.getByRole('link', { name: 'Resolve 2 blocking readiness items' }).focus();
  await expect(page.getByRole('link', { name: 'Resolve 2 blocking readiness items' })).toBeFocused();

  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    })).violations;
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});
