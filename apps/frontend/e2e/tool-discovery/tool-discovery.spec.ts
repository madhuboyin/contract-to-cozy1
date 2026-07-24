import { expect, test } from '@playwright/test';

test('Unified Home tools preserve recommendation and property context', async ({ page }) => {
  await page.goto('/acceptance/tool-discovery');

  await expect(page.getByRole('heading', { name: 'Tools for this home' })).toBeVisible();
  const recommendations = page.locator('[data-testid^="unified-home-tool-"]');
  await expect(recommendations).toHaveCount(3);

  const coverageHref = await page.getByTestId('unified-home-tool-coverage-options').getAttribute('href');
  expect(coverageHref).toContain('/dashboard/properties/tool-discovery-property/tools/coverage-options');
  expect(coverageHref).toContain('launchSurface=unified_home');
  expect(coverageHref).toContain('sourceActionId=coverage-action-1');
  expect(coverageHref).toContain('sourceEntityId=furnace-1');
  expect(coverageHref).toContain('contextVersion=tool-context-v2');
  expect(coverageHref).toContain(
    'recommendationReason=COVERAGE_GAPS_PRESENT',
  );
  expect(coverageHref).toContain(
    'recommendationVersion=capability-recommendation-v1',
  );
});

test('Explore tools searches the canonical registry and hides workflow-only tools', async ({ page }) => {
  await page.goto('/acceptance/tool-discovery');

  await expect(page.getByText('Quote Comparison', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search home tools').fill('cost growth');
  await expect(page.getByText('Cost Growth', { exact: true })).toBeVisible();
  await expect(page.getByText('Plant Advisor', { exact: true })).toHaveCount(0);

  const costGrowthLink = page.getByRole('link', { name: /Cost Growth/ });
  await expect(costGrowthLink).toHaveAttribute('href', /launchSurface=explore_tools/);
  await expect(costGrowthLink).toHaveAttribute('href', /contextVersion=tool-context-v2/);
});
