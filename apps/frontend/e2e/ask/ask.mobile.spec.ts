import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

test.beforeEach(async ({ context }) => installAskContext(context));

test('mobile starting surface keeps the composer visible without duplicate headings', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Cozy' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await page.getByRole('button', { name: /Explore everything Ask Cozy can do/ }).click();
  await expect(page.getByRole('dialog', { name: 'What Ask Cozy can help with' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan and monitor' })).toBeVisible();
});

test('mobile inline capture retains a full-form escape path', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('link', { name: /Open full form/ })).toHaveAttribute('href', /\/inventory$/);
  await expect(page.getByRole('button', { name: 'Save and update answer' })).toBeVisible();
});

test('mobile capability discovery keeps readiness and related tools readable', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is there a tool to help with refinancing?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('More home details will improve the result')).toBeVisible();
  await expect(page.getByRole('link', { name: /Break-Even/ })).toBeVisible();
});

test('mobile weather attention keeps the direct checklist in Ask', async ({ page }) => {
  await installAskApi(page, { noDecision: true, heatAttention: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('button', { name: /Multi-day heat risk ahead preparation.*Ask Cozy about this/ }).click();

  const response = page.locator('#ask-execution-execution-heat-preparation');
  await expect(response.getByRole('heading', { name: 'Prepare this home' })).toBeVisible();
  await expect(response.getByText('Inspect the HVAC filter before the heat arrives.')).toBeVisible();
  await expect(response.getByRole('link', { name: 'Open preparation checklist' })).toHaveCount(1);
  await expect(response.getByRole('link', { name: 'View in Home Actions' })).toHaveCount(0);
});
