import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Explore with Cozy, Phase 2 (narrow screens): one compact disclosure, not a second drawer.
test.beforeEach(async ({ context }) => installAskContext(context));

test('mobile Explore is one inline disclosure that opens the focused view without a dialog or a request', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const toggle = page.getByRole('button', { name: 'Explore with Cozy' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The page carries an unrelated cookie banner (role=dialog), so assert on the Ask drawers by name.
  await expect(page.getByRole('dialog', { name: /Ask Cozy conversations|Explore/ })).toHaveCount(0);
  await page.locator('#ask-explore-disclosure-panel').getByRole('button', { name: 'Home care' }).click();
  await expect(page.getByRole('heading', { name: 'Home care' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Ask Cozy conversations|Explore/ })).toHaveCount(0);
  expect(api.executionBodies).toHaveLength(0);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByPlaceholder(/^Ask anything about /)).toBeInViewport();
  await expect(toggle).toBeFocused();
});
