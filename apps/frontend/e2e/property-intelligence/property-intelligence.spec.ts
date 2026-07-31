import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import {
  installAuthenticatedContext,
  installPropertyIntelligenceApi,
  propertyId,
} from './fixtures';

test.beforeEach(async ({ context, page }) => {
  await installAuthenticatedContext(context);
  await installPropertyIntelligenceApi(page);
});

test('reviewed NYC planning source flows through Around Your Home and one-item briefing', async ({
  page,
}) => {
  await page.goto('/acceptance/property-intelligence');

  await expect(page.getByRole('heading', {
    name: 'Property Intelligence launch acceptance',
  })).toBeVisible();
  await expect(page.getByText('New York City Department of City Planning').first()).toBeVisible();
  await expect(page.getByText('NEW YORK COUNTY').first()).toBeVisible();
  await expect(page.getByText('No exact point distance is available.')).toBeVisible();
  await expect(page.getByText(/effect on this home is unknown/)).toBeVisible();
  await expect(page.getByText(/will increase property value|will lower insurance cost/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByText('Following')).toBeVisible();

  await expect(page.getByRole('heading', {
    name: 'A NYC planning application was filed in Manhattan',
  })).toHaveCount(1);
  await expect(page.getByText('Canonical change change-pilot')).toBeVisible();
  await page.getByRole('button', { name: 'Seen', exact: true }).click();
  await expect(page.getByText('Unread')).toHaveCount(0);

  await expect(page.getByRole('link', { name: 'Open canonical owner' })).toHaveAttribute(
    'href',
    `/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`,
  );
});

test('source degradation never renders as a quiet all-clear', async ({ page }) => {
  await installPropertyIntelligenceApi(page, 'DEGRADED');
  await page.goto('/acceptance/property-intelligence');

  await expect(page.getByText(/source check is degraded/i).first()).toBeVisible();
  await expect(page.getByText(
    'No material changes in this delivery window',
  )).toBeVisible();
  await expect(page.getByText(/not automatically an all-clear/i)).toBeVisible();
  await expect(page.getByText('Source Coverage Degraded')).toBeVisible();
  await expect(page.getByText(/nothing happened|everything is fine/i)).toHaveCount(0);
});

test('Property Intelligence pilot passes the automated accessibility gate', async ({ page }) => {
  await page.goto('/acceptance/property-intelligence');
  await page.addScriptTag({ content: axeCore.source });

  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: {
        run: (
          root: Document,
          options: Record<string, unknown>,
        ) => Promise<{ violations: unknown[] }>;
      };
    }).axe;
    return (await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
    })).violations;
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});
