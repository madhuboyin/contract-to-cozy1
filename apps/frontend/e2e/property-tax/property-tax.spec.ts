import { expect, test } from '@playwright/test';
import { installAuthenticatedContext } from './fixtures';

const acceptancePath = '/acceptance/property-tax?eventId=event-1&matchId=match-1&actionId=action-1';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('seven-stage navigation preserves launch context and moves keyboard focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(acceptancePath);

  const navigation = page.getByRole('navigation', { name: 'Property Tax Center stages' });
  await expect(navigation.getByRole('link')).toHaveCount(7);
  await expect(navigation.getByRole('link', { name: 'overview' })).toHaveAttribute('aria-current', 'page');

  const changes = navigation.getByRole('link', { name: 'changes' });
  await changes.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/stage=changes/);
  await expect(page).toHaveURL(/eventId=event-1/);
  await expect(page).toHaveURL(/matchId=match-1/);
  await expect(page).toHaveURL(/actionId=action-1/);
  await expect(page.getByRole('heading', { name: 'changes stage' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Resolve the conflicting assessed value' })).toBeVisible();
});

test('trust and outcome disclosures remain explicit in every desktop browser', async ({ page }) => {
  await page.goto(`${acceptancePath}&stage=appeal`);

  await expect(page.getByRole('heading', { name: 'Verify the official filing window' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Official', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirmed', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estimated', exact: true })).toBeVisible();
  await expect(page.getByText(/no deadline, history, or expected savings is inferred/i)).toBeVisible();
});

test('skip navigation exposes a keyboard path to stage content', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto(acceptancePath);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to property-tax stage content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#property-tax-acceptance-content/);
});
