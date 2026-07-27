import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import { installAuthenticatedContext, installMarketContextApi } from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('qualified market context exposes provenance, limitations, and no personal conclusion', async ({
  page,
}) => {
  await installMarketContextApi(page);
  await page.goto('/acceptance/coverage-launch');

  await expect(page.getByRole('heading', {
    name: 'Coverage & Premium Review launch gate',
  })).toBeVisible();
  await expect(page.getByText('Observed market context — not a quote')).toBeVisible();
  await expect(page.getByText('$2,400 annual premium reference')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reviewed market source' })).toHaveAttribute(
    'href',
    'https://example.com/methodology',
  );
  await expect(page.getByText('Method and limitations')).toBeVisible();
  await expect(page.getByText(/not a personal insurance quote or carrier offer/)).toBeVisible();
  await expect(page.getByText(/you are overpaying/i)).toHaveCount(0);
});

test('source outage remains explicit and does not manufacture a value', async ({ page }) => {
  await installMarketContextApi(page, 'SOURCE_UNAVAILABLE');
  await page.goto('/acceptance/coverage-launch');

  await expect(page.getByRole('heading', {
    name: 'Observed market context unavailable',
  })).toBeVisible();
  await expect(page.getByText(/Saved policy facts are unaffected/)).toBeVisible();
  await expect(page.getByText(/annual premium reference/)).toHaveCount(0);
});

test('coverage market context passes the WCAG automated gate', async ({ page }) => {
  await installMarketContextApi(page);
  await page.goto('/acceptance/coverage-launch');
  await page.addScriptTag({ content: axeCore.source });

  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: {
        run: (
          root: Document,
          options: Record<string, unknown>,
        ) => Promise<{ violations: unknown[] }>;
      };
    }).axe;
    return (await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
    })).violations;
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});
