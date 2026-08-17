import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8080/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/auth/me'
      ? { id: 'slice8-mobile-user', email: 'slice8@example.com', firstName: 'Taylor', lastName: 'Acceptance', role: 'HOMEOWNER', emailVerified: true, status: 'ACTIVE', createdAt: '2026-01-01T12:00:00.000Z' }
      : path === '/api/notifications/unread-count'
        ? { count: 0 }
        : null;
    if (data) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      return;
    }
    await route.abort('blockedbyclient');
  });
});

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
}

test('mobile buyer and mixed-property traversals remain operable without overflow', async ({ page }) => {
  await page.goto('/acceptance/home-buyer-lifecycle/slice8?scenario=buyer&view=onboarding');
  await page.getByRole('button', { name: 'Buying existing' }).click();
  await page.getByLabel('Property address').fill('42 River Street');
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Create my Closing Plan' }).click();

  await expect(page.getByRole('heading', { name: 'Your path to closing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue Closing Plan: Review accepted contract dates' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/acceptance/home-buyer-lifecycle/slice8?scenario=protected&property=owner-one');
  await expect(page.getByRole('heading', { name: 'Harbor House' })).toBeVisible();
  await page.getByRole('button', { name: /42 River Street/ }).click();
  await expect(page.getByRole('heading', { name: 'Your path to closing' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
