import { expect, test } from '@playwright/test';
import {
  installAuthenticatedContext,
  installServiceQuoteDecisionApi,
  propertyId,
} from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('mobile keeps the decision and homeowner controls within the viewport', async ({ page }) => {
  await installServiceQuoteDecisionApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/tools/quote-comparison`);

  await expect(page.getByRole('heading', { level: 1, name: 'Service Quote Decision' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Current HVAC proposal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Home tools' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Upload a quote/ })).toBeVisible();

  const proposal = page.getByRole('article', { name: 'Current HVAC proposal' });
  await expect(proposal.getByRole('button', { name: 'Edit facts' })).toBeVisible();
  await expect(proposal.getByRole('button', { name: 'Reject proposal' })).toBeVisible();
  await expect(proposal.getByRole('button', { name: 'Delete proposal' })).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
