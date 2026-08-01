import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import { installRefinanceRoutes, REFINANCE_IDS } from './refinanceFixtures';

const routeFor = (propertyId: string) =>
  `/acceptance/mortgage-refinance-radar/${propertyId}`;

test.beforeEach(async ({ page }) => {
  await installRefinanceRoutes(page);
});

test('OPEN and material UPDATE lead with an outcome and ordered next steps', async ({ page }) => {
  for (const propertyId of [REFINANCE_IDS.open, REFINANCE_IDS.update]) {
    await page.goto(routeFor(propertyId));
    await expect(page.getByRole('heading', { level: 1, name: 'Mortgage Refinance Radar' })).toBeVisible();
    await expect(page.getByText('Opportunity Open').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your refinance outlook' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Test loan scenarios' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compare official offers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Record what you plan to do' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore my options' }).first()).toBeVisible();
  }
});

test('CLOSED state is calm, actionable, and keeps technical evidence secondary', async ({ page }) => {
  await page.goto(routeFor(REFINANCE_IDS.closed));
  await expect(page.getByText('No Opportunity').first()).toBeVisible();
  await expect(page.getByText('No action needed right now')).toBeVisible();
  await expect(page.getByText(/Home monitoring continues/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh estimate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data freshness' })).not.toBeVisible();
  await page.getByText('Monitoring, sources, assumptions, and settings').click();
  await expect(page.getByRole('heading', { name: 'Data freshness' })).toBeVisible();
});

test('missing, no-mortgage, no-rate, and stale states never render a false all-clear', async ({ page }) => {
  await page.goto(routeFor(REFINANCE_IDS.partial));
  await expect(page.getByRole('heading', { name: 'Set up your mortgage' })).toBeVisible();
  await expect(page.getByText(/Known facts \(1\)/)).toBeVisible();
  await expect(page.getByText(/Missing facts \(2\)/)).toBeVisible();
  await expect(page.getByText('Optional facts')).toBeVisible();

  await page.goto(routeFor(REFINANCE_IDS.noMortgage));
  await expect(page.getByRole('heading', { name: 'No mortgage recorded' })).toBeVisible();

  await page.goto(routeFor(REFINANCE_IDS.noRates));
  await expect(page.getByRole('heading', { name: 'No market rate data available' })).toBeVisible();

  await page.goto(routeFor(REFINANCE_IDS.staleMortgage));
  await page.getByText('Monitoring, sources, assumptions, and settings').click();
  await expect(page.getByText('stale', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Confirm the current mortgage balance/).first()).toBeVisible();

  await page.goto(routeFor(REFINANCE_IDS.staleRates));
  await page.getByText('Monitoring, sources, assumptions, and settings').click();
  await expect(page.getByText(/outside the normal weekly update window/).first()).toBeVisible();
  await expect(page.getByText('Alert review needed')).toBeVisible();
});

test('load failure exposes retry and recovers to the real result', async ({ page }) => {
  await page.goto(routeFor(REFINANCE_IDS.error));
  await expect(page.getByRole('heading', { name: 'Radar check failed' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Opportunity Open').first()).toBeVisible();
});

test('scenario, official-offer comparison, save, load, and explicit delete work together', async ({ page }) => {
  await page.goto(routeFor(REFINANCE_IDS.open));
  await page.getByLabel('Target Rate (%)').fill('5.625');
  await page.getByLabel('Save this comparison').check();
  await page.getByRole('button', { name: 'Run Scenario' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Comparison saved' })).toBeVisible();
  await expect(page.getByText(/Scenario Result — 30-Year Fixed @ 5.625%/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Mortgage decision alternatives' })).toBeVisible();

  await page.getByText('I have Loan Estimates to compare').click();
  for (let index = 0; index < 2; index += 1) {
    const offer = page.getByRole('group', { name: `Offer ${index + 1}` });
    await offer.getByLabel('Lender label').fill(`Fixture Lender ${index + 1}`);
    await offer.getByLabel('Loan amount ($)').fill('320000');
    await offer.getByLabel('Note rate (%)').fill(index === 0 ? '5.625' : '5.75');
    await offer.getByLabel('APR (%)').fill(index === 0 ? '5.8' : '5.9');
    await offer.getByLabel('Monthly P&I ($)').fill(index === 0 ? '1840' : '1810');
    await offer.getByLabel('Loan costs ($)').fill(index === 0 ? '8000' : '10500');
    await offer.getByLabel('Lender credits ($)').fill('0');
    await offer.getByLabel('Cash to close ($)').fill(index === 0 ? '8000' : '10500');
    await offer.getByLabel('Cash-to-close direction').selectOption('FROM_BORROWER');
    await offer.getByLabel('In 5 years — total paid ($)').fill('120000');
    await offer.getByLabel('In 5 years — principal paid ($)').fill(index === 0 ? '25000' : '26000');
  }
  await page.getByRole('button', { name: 'Compare offers' }).click();
  await expect(page.getByText(/not overall lender quality/)).toBeVisible();
  await page.getByLabel('Saved comparison label (optional)').fill('Acceptance offers');
  await page.getByRole('button', { name: 'Save comparison' }).click();
  await expect(page.getByText('Saved comparisons')).toBeVisible();
  await page.getByRole('button', { name: 'Load comparison' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Permanently delete this saved comparison?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Acceptance offers was permanently deleted.')).toBeVisible();
  await expect(page.getByText('Saved comparisons')).toHaveCount(0);
});

test('alert preferences save while unavailable channels remain truthful', async ({ page }) => {
  const api = await installRefinanceRoutes(page);
  await page.goto(routeFor(REFINANCE_IDS.open));
  await page.getByText('Monitoring, sources, assumptions, and settings').click();

  await expect(page.getByText(/Email and push appear as available when supported/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Push/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Email/ }).check();
  await page.getByRole('button', { name: 'Save alert preferences' }).click();

  await expect(page.getByRole('status').filter({
    hasText: 'Preferences saved. Home monitoring remains on; unavailable channels will stay off.',
  })).toBeVisible();
  const saved = api.mutations.find((mutation) =>
    mutation.method === 'PUT' && mutation.path.endsWith('/refinance-radar/alert-preferences'));
  expect(saved?.body).toMatchObject({ emailEnabled: true, pushEnabled: false });
});

test('canonical Home Action respects shared ranking and dismissal lifecycle', async ({ page }) => {
  const api = await installRefinanceRoutes(page);
  await page.goto('/acceptance/mortgage-refinance-radar/home-actions');

  const actionHeadings = page.locator('section[aria-labelledby="attention-heading"] article h3');
  await expect(actionHeadings).toHaveText([
    'Address the electrical safety issue',
    'Review your refinance opportunity',
  ]);
  const refinanceAction = page.getByRole('article').filter({ hasText: 'Review your refinance opportunity' });
  await expect(refinanceAction.getByRole('link', { name: 'Review refinance outlook' }))
    .toHaveAttribute('href', '/dashboard/properties/refi-home-actions/tools/mortgage-refinance-radar');
  await refinanceAction.getByRole('button', { name: 'Not relevant' }).click();
  await expect(page.getByRole('heading', { name: 'Review your refinance opportunity' })).toHaveCount(0);
  const dismissal = api.mutations.find((mutation) =>
    mutation.path.includes('/home-actions/refinance%3Aopen/commands'));
  expect(dismissal?.body).toMatchObject({ command: 'NOT_RELEVANT', consequenceAcknowledged: true });
});

test('decision completion persists history and writes verified terms to Financing', async ({ page }) => {
  const api = await installRefinanceRoutes(page);
  await page.goto(routeFor(REFINANCE_IDS.open));
  await page.getByRole('button', { name: 'Proceed with this option' }).click();
  await expect(page.getByText('Proceeding', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark application started' }).click();
  await expect(page.getByText('Application in progress', { exact: true })).toBeVisible();
  await page.getByLabel('New mortgage balance').fill('315000');
  await page.getByLabel('New interest rate').fill('5.5');
  await page.getByLabel('New remaining term in months').fill('360');
  await page.getByLabel('New monthly payment').fill('1788');
  await page.getByRole('button', { name: 'Confirm closed and update Financing' }).click();
  await expect(page.getByText('Refinance closed', { exact: true })).toBeVisible();
  await expect(page.getByText(/Decision history \(3\)/)).toBeVisible();
  expect(api.decision()?.status).toBe('CLOSED');
  expect(api.financingProfile().interestRateBps).toBe(550);
  expect(api.financingProfile().currentMortgageBalanceCents).toBe(31500000);
});

test('primary hierarchy is keyboard reachable and has no serious axe violations', async ({ page }) => {
  await page.goto(routeFor(REFINANCE_IDS.open));
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY']).toContain(focused);

  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    })).violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
  });
  expect(violations).toEqual([]);
});
