import { expect, test } from '@playwright/test';
import { installAuthenticatedContext } from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('mobile stages retain 44px targets without page overflow', async ({ page }) => {
  await page.goto('/acceptance/property-tax?stage=overview&eventId=event-1');

  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);

  const navigation = page.getByRole('navigation', { name: 'Property Tax Center stages' });
  for (const link of await navigation.getByRole('link').all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const historyHref = await navigation.getByRole('link', { name: 'history' }).getAttribute('href');
  expect(historyHref).toContain('stage=history');
  expect(historyHref).toContain('eventId=event-1');
  await page.goto(historyHref!);
  await expect(page).toHaveURL(/stage=history/);
  await expect(page).toHaveURL(/eventId=event-1/);
  await expect(page.getByRole('heading', { name: 'history stage' })).toBeVisible();
});

test('reduced motion retains all content and navigation behavior', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/acceptance/property-tax?stage=bill');

  await expect(page.getByRole('heading', { name: 'bill stage' })).toBeVisible();
  const appealHref = await page.getByRole('link', { name: 'appeal' }).getAttribute('href');
  await page.goto(appealHref!);
  await expect(page.getByRole('heading', { name: 'appeal stage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verify the official filing window' })).toBeVisible();
});
