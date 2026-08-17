import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8080/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'slice8-acceptance-user',
            email: 'slice8@example.com',
            firstName: 'Taylor',
            lastName: 'Acceptance',
            role: 'HOMEOWNER',
            emailVerified: true,
            status: 'ACTIVE',
            createdAt: '2026-01-01T12:00:00.000Z',
          },
        }),
      });
      return;
    }
    if (path === '/api/notifications/unread-count') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { count: 0 } }) });
      return;
    }
    await route.abort('blockedbyclient');
  });
});

async function expectNoSeriousAccessibilityViolations(page: import('@playwright/test').Page) {
  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document, {
      rules: { 'color-contrast': { enabled: false } },
    })).violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || ''));
  });
  expect(violations).toEqual([]);
}

test('buyer traversal requires an explicit journey choice and an explicit professional close', async ({ page }) => {
  await page.goto('/acceptance/home-buyer-lifecycle/slice8?scenario=buyer');

  await expect(page.getByRole('dialog', { name: 'Welcome to Cozy, Taylor!' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose my home journey' }).click();
  await expect(page.getByRole('heading', { name: 'Where are you in the home journey?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create my Closing Plan' })).toBeDisabled();

  await page.getByRole('button', { name: 'Buying existing' }).click();
  await page.getByLabel('Property address').fill('42 River Street');
  await page.getByLabel('Inspection concern').fill('Review the basement moisture finding');
  await page.getByRole('button', { name: 'Create my Closing Plan' }).click();

  await expect(page.getByRole('heading', { name: 'Your path to closing' })).toBeVisible();
  await expect(page.getByText('42 River Street, Portland, ME 04101')).toBeVisible();
  await expect(page.getByText('Review accepted contract dates').first()).toBeVisible();
  await expect(page.getByText(/generic homeowner maintenance/i)).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);

  for (const destination of [
    { link: 'Documents', heading: 'Documents' },
    { link: 'Inspection', heading: 'Inspection Hub' },
    { link: 'Ask Cozy', heading: 'Ask Cozy' },
  ]) {
    await page.getByRole('link', { name: destination.link, exact: true }).click();
    await expect(page.getByRole('heading', { name: destination.heading })).toBeVisible();
    await page.getByRole('button', { name: 'Return to Closing Home' }).click();
    await expect(page.getByRole('heading', { name: 'Your path to closing' })).toBeVisible();
  }

  await page.getByRole('link', { name: /Open Closing Plan/ }).click();
  await expect(page.getByRole('heading', { name: 'Closing Plan' })).toBeVisible();
  await expect(page.getByText('The elapsed target date has not changed the journey.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete closing and open my home' })).toBeDisabled();
  await page.getByLabel('I confirm the professional close completed').check();
  await page.getByRole('button', { name: 'Complete closing and open my home' }).click();

  await expect(page.getByRole('heading', { name: 'Welcome home. Your first 90 days are organized.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'River Street Home' })).toBeVisible();
  await expect(page.getByText('4 documents · 1 inspection')).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('protected homeowner traversal isolates two owned properties from an active purchase', async ({ page }) => {
  const buyerApiRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/.*buyer/i.test(request.url())) buyerApiRequests.push(request.url());
  });

  await page.goto('/acceptance/home-buyer-lifecycle/slice8?scenario=protected&property=owner-one');
  await expect(page.getByRole('heading', { name: 'Harbor House' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Systems tracked: 7. Open systems and inventory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your path to closing' })).toHaveCount(0);

  await page.getByRole('button', { name: /Maple Cottage/ }).click();
  await expect(page.getByRole('heading', { name: 'Maple Cottage' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Systems tracked: 4. Open systems and inventory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Harbor House' })).toHaveCount(0);

  await page.getByRole('button', { name: /42 River Street/ }).click();
  await expect(page.getByRole('heading', { name: 'Your path to closing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maple Cottage' })).toHaveCount(0);
  await expect(page.getByText('Home shortcuts')).toHaveCount(0);

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Maple Cottage' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Harbor House' })).toBeVisible();
  expect(buyerApiRequests).toEqual([]);
  await expectNoSeriousAccessibilityViolations(page);
});
