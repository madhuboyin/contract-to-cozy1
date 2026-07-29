import { expect, test } from '@playwright/test';
import {
  installAuthenticatedContext,
  installServiceQuoteDecisionApi,
  propertyId,
} from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('desktop journey exposes evidence, safe controls, and keyboard dialog behavior', async ({ page }) => {
  const api = await installServiceQuoteDecisionApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/tools/quote-comparison`);

  await expect(page.getByRole('heading', { level: 1, name: 'Service Quote Decision' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Current HVAC proposal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How would you like to start?' })).toBeVisible();
  await expect(page.getByText('Welcome back to this quote decision')).toBeVisible();
  await expect(page.getByLabel('Evidence dimensions').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What we know' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What is missing' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why it matters' }).first()).toBeVisible();
  await expect(page.getByText(/stale or expired/i)).toBeVisible();
  await expect(page.getByText(/Recommended quote|best quote/i)).toHaveCount(0);

  const currentProposal = page.getByRole('article', { name: 'Current HVAC proposal' });
  await currentProposal.getByRole('button', { name: 'Edit facts' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit quote facts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Provider name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await currentProposal.getByRole('button', { name: 'Reject proposal' }).click();
  await expect(currentProposal.getByRole('button', { name: 'Restore proposal' })).toBeVisible();
  expect(api.mutationBodies.at(-1)?.body).toEqual({ decision: 'REJECTED' });
  await expect(currentProposal.getByRole('button', { name: 'Accept for final review' })).toHaveCount(0);

  await expect(page.getByRole('progressbar', { name: /quote readiness/i }).first()).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('heading', { name: 'Your data and privacy' })).toBeVisible();
});

test('screen-reader names expose proposal controls and clarification inputs', async ({ page }) => {
  await installServiceQuoteDecisionApi(page);
  await page.goto(`/dashboard/properties/${propertyId}/tools/quote-comparison`);

  const proposal = page.getByRole('article', { name: 'Current HVAC proposal' });
  await expect(proposal).toBeVisible();
  await expect(proposal.locator('[aria-label="Current HVAC proposal controls"]')).toBeVisible();
  await expect(proposal.getByLabel('Ask for clarification')).toBeVisible();
  await expect(proposal.getByRole('button', { name: 'Save question' })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: /Welcome back/ })).toBeVisible();
});
