import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';

const propertyId = 'home-buyer-lifecycle-acceptance-property';
const advocacyHeading = 'You’ve built real momentum in your new home.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem('home-buyer-lifecycle-acceptance-ready') === '1') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem('home-buyer-lifecycle-acceptance-ready', '1');
  }, `buyer-advocacy:${propertyId}:v1`);
});

test('recent-owner handoff preserves homeowner continuity and exposes earned advocacy', async ({ page }) => {
  await page.goto('/acceptance/home-buyer-lifecycle');

  await expect(page.getByRole('heading', { name: 'Welcome home. Your first 90 days are organized.' })).toBeVisible();
  await expect(page.getByText('6 of 9 resolved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Harbor View Home' })).toBeVisible();
  await expect(page.getByText('Home shortcuts')).toBeVisible();
  await expect(page.getByRole('heading', { name: advocacyHeading })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invite co-buyer' })).toHaveAttribute(
    'href',
    `/dashboard/properties/${propertyId}/household`,
  );
  await expect(page.getByRole('button', { name: 'Recommend to a buyer' })).toBeVisible();

  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document, { rules: { 'color-contrast': { enabled: false } } })).violations;
  });
  expect(violations).toEqual([]);
});

test('dismissal persists and urgent homeowner work suppresses advocacy', async ({ page }) => {
  await page.goto('/acceptance/home-buyer-lifecycle');
  await expect(page.getByRole('heading', { name: advocacyHeading })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss advocacy prompt' }).click();
  await expect(page.getByRole('heading', { name: advocacyHeading })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: advocacyHeading })).toHaveCount(0);

  await page.evaluate((key) => window.localStorage.removeItem(key), `buyer-advocacy:${propertyId}:v1`);
  await page.goto('/acceptance/home-buyer-lifecycle?urgent=1');
  await expect(page.getByRole('heading', { name: 'Resolve the active water shutoff issue' })).toBeVisible();
  await expect(page.getByText('Confirm the leak is contained before continuing setup.')).toBeVisible();
  await expect(page.getByRole('heading', { name: advocacyHeading })).toHaveCount(0);
});
