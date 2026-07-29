import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import { installSavingsBenefitsRoutes } from './savingsBenefitsFixtures';

test('complete Savings and Benefits view passes accessibility, keyboard, zoom, and partner-consent checks', async ({ page }) => {
  await installSavingsBenefitsRoutes(page);
  await page.goto('/acceptance/savings-benefits');
  await expect(page.getByRole('heading', { name: 'Savings and Benefits acceptance' })).toBeVisible();

  await page.getByRole('button', { name: 'Get partner help' }).focus();
  await page.keyboard.press('Enter');
  const consentDialog = page.getByRole('dialog', { name: 'Share this opportunity with an approved partner' });
  await expect(consentDialog).toBeVisible();
  await page.getByRole('combobox', { name: 'Partner' }).click();
  await page.getByRole('option', { name: 'Approved Energy Help' }).click();
  await expect(page.getByText('Contract to Cozy may receive a referral payment.')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Consent and share' }).click();
  await expect(consentDialog).toBeHidden();
  await page.waitForTimeout(500);

  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document)).violations;
  });
  expect(violations).toEqual([]);

  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('homeowner can revoke consent and report a complaint from an active handoff', async ({ page }) => {
  await installSavingsBenefitsRoutes(page, true);
  await page.goto('/acceptance/savings-benefits');
  await expect(page.getByText(/Approved Energy Help · acknowledged/)).toBeVisible();

  await page.getByRole('button', { name: 'Report a problem' }).click();
  await page.getByLabel('What happened?').fill('The partner did not honor the disclosed process.');
  await page.getByRole('button', { name: 'Submit report' }).click();

  await page.getByRole('button', { name: 'Revoke consent' }).click();
  await page.getByLabel('Reason').fill('I no longer want this partner to receive my information.');
  await page.getByRole('button', { name: 'Revoke consent' }).last().click();
});
