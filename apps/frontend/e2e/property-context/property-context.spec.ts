import { expect, test } from '@playwright/test';
import { installAuthenticatedContext, installPropertyContextApi } from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('scalar capture survives latency and resumes in place with keyboard input', async ({ page }) => {
  const api = await installPropertyContextApi(page, 'scalar', { evaluationDelayMs: 1_600 });
  await page.goto('/acceptance/property-context?scenario=scalar');

  const featureDraft = page.getByLabel('Feature draft');
  await featureDraft.fill('Seller notes stay here');
  await expect(page.getByText('This is taking a little longer than usual.')).toBeVisible();
  await expect(featureDraft).toHaveValue('Seller notes stay here');

  const primaryResidence = page.getByRole('button', { name: 'Primary residence' });
  await primaryResidence.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Capture callback count')).toHaveText('Captured: 1');
  await expect(page.getByLabel('Ready callback count')).toHaveText('Ready: 1');
  await expect(featureDraft).toHaveValue('Seller notes stay here');
  await expect(page.getByRole('heading', { name: 'Property use' })).toHaveCount(0);
  expect(api.captureBodies).toHaveLength(1);
  expect(api.captureBodies[0]).toMatchObject({
    featureKey: 'SELLER_PREP',
    operationKey: 'OPEN_PLAN',
    expectedContextVersion: 'context-v1',
    answer: { value: 'PRIMARY_RESIDENCE' },
  });
});

test('structured capture follows the minimum conditional path', async ({ page }) => {
  const api = await installPropertyContextApi(page, 'structured');
  await page.goto('/acceptance/property-context?scenario=structured');

  await expect(page.getByRole('group', { name: 'Private outdoor space *' })).toBeVisible();
  await page.getByRole('group', { name: 'Private outdoor space *' }).getByRole('button', { name: 'No' }).click();
  await expect(page.getByRole('group', { name: 'Outdoor space types *' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Who handles landscaping? *' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByLabel('Ready callback count')).toHaveText('Ready: 1');
  expect(api.captureBodies[0]).toMatchObject({
    featureKey: 'PLANT_ADVISOR',
    operationKey: 'GENERATE_OUTDOOR_RECOMMENDATIONS',
    answer: { hasPrivateOutdoorSpace: false },
  });
});

test('relational capture recovers from failure without losing feature or form input', async ({ page }) => {
  const api = await installPropertyContextApi(page, 'relational', { captureFailures: 1 });
  await page.goto('/acceptance/property-context?scenario=relational');

  await page.getByLabel('Feature draft').fill('Maintenance choices stay here');
  await page.getByLabel('Item or system name').fill('Main heat pump');
  await page.getByRole('group', { name: 'Category *' }).getByRole('button', { name: 'HVAC' }).click();
  await page.getByRole('group', { name: 'Current condition *' }).getByRole('button', { name: 'Good' }).click();
  await page.getByRole('button', { name: 'Add and continue' }).click();

  await expect(page.getByText('Temporary capture failure', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Feature draft')).toHaveValue('Maintenance choices stay here');
  await expect(page.getByLabel('Item or system name')).toHaveValue('Main heat pump');
  await page.getByRole('button', { name: 'Add and continue' }).click();

  await expect(page.getByLabel('Capture callback count')).toHaveText('Captured: 1');
  await expect(page.getByLabel('Ready callback count')).toHaveText('Ready: 1');
  expect(api.captureAttempts()).toBe(2);
  expect(api.captureBodies[1]).toMatchObject({
    featureKey: 'MAINTENANCE',
    operationKey: 'SET_UP_INSTALLED_SYSTEMS',
    answer: { mode: 'CREATE', values: { name: 'Main heat pump', category: 'HVAC', condition: 'GOOD' } },
  });
});
