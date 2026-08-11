import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

test.beforeEach(async ({ context }) => installAskContext(context));

test('refrigerator capture preserves year precision and resumes automatically', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Good' }).click();
  await page.getByRole('group', { name: 'Purchase date precision' }).getByRole('button', { name: 'Year' }).click();
  await page.getByLabel('Purchase date value').fill('2018');
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByRole('heading', { name: 'Updated answer' })).toBeVisible();
  expect(api.captureBodies[0]).toMatchObject({ answer: { mode: 'UPDATE', entityId: 'fridge-1', values: { condition: 'GOOD', purchasedOn: { precision: 'YEAR', value: '2018' } } } });
});

test('refinance capture saves consented profile inputs and resumes automatically', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is refinancing a good option?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByLabel('Mortgage balance').fill('350000');
  await page.getByLabel('Current interest rate').fill('7.25');
  await page.getByLabel('Remaining term').fill('25');
  await page.getByText('Save these details to my Financing Profile.').click();
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByRole('heading', { name: 'Updated answer' })).toBeVisible();
  expect(api.captureBodies[0]).toMatchObject({ sensitiveDataConfirmed: true, answer: { currentMortgageBalanceUsd: 350000, interestRatePct: 7.25, remainingTermYears: 25 } });
});

test('context conflict refreshes inline values and retries without losing the draft', async ({ page }) => {
  const api = await installAskApi(page, { conflictOnce: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Fair' }).click();
  await page.getByRole('group', { name: 'Purchase date precision' }).getByRole('button', { name: 'Year' }).click();
  await page.getByLabel('Purchase date value').fill('2017');
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByText(/Review the refreshed values and continue/)).toBeVisible();
  await expect(page.getByLabel('Purchase date value')).toHaveValue('2017');
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByRole('heading', { name: 'Updated answer' })).toBeVisible();
  expect(api.captureAttempts()).toBe(2);
  expect(api.captureBodies[1]).toMatchObject({ expectedContextVersion: 'context-v2' });
});

test('permission denial keeps a safe full-form recovery path', async ({ page }) => {
  await installAskApi(page, { permissionDenied: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Good' }).click();
  await page.getByRole('group', { name: 'Purchase date precision' }).getByRole('button', { name: 'I’m not sure' }).click();
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByText(/contributor or owner/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open full form/ })).toBeVisible();
});

test('capability discovery shows readiness and related-tool continuity', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is there a tool to help with refinancing?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'Best match for your goal' })).toBeVisible();
  await expect(page.getByText('More home details will improve the result')).toBeVisible();
  await expect(page.getByText('Add current mortgage facts before running a comparison.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Related tools for what comes next' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Break-Even/ })).toHaveAttribute('href', new RegExp(`/properties/${propertyId}/tools/break-even$`));
});

test('unavailable capability fails honestly without a launch link', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the disabled refinance tool');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByLabel('Mortgage Refinance Radar unavailable')).toBeVisible();
  await expect(page.getByText('This tool is disabled by the current rollout policy.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Mortgage Refinance Radar/ })).toHaveCount(0);
});
