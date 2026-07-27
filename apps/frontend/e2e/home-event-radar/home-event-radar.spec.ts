import { expect, test } from '@playwright/test';
import {
  installAuthenticatedContext,
  installRadarApi,
  type MonitoringState,
} from './fixtures';

const acceptancePath = '/acceptance/home-event-radar';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('core feed and detail semantics work in every supported desktop browser', async ({ page }) => {
  await installRadarApi(page);
  await page.goto(acceptancePath);

  await expect(page.getByRole('status')).toContainText('Monitoring is active');
  const eventButton = page.getByRole('button', {
    name: /Review update: Severe thunderstorm warning.*Source NWS Alerts.*Severe.*Moderate property impact/i,
  });
  await expect(eventButton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insurance · unavailable' })).toBeDisabled();

  await eventButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Severe thunderstorm warning' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Official event details' })).toBeVisible();
  await expect(dialog.getByText('Resolution in progress')).toBeVisible();
  await expect(dialog.getByText(/Current step: Secure exposed property/i)).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Continue resolution' })).toHaveAttribute(
    'href',
    /guidanceJourneyId=journey-weather.*guidanceStepKey=secure-property/,
  );
  await expect(page).toHaveURL(/matchId=match-weather/);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/matchId=/);
  await expect(eventButton).toBeFocused();
});

test('every monitoring state has truthful zero-feed copy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const api = await installRadarApi(page, { emptyFeed: true });
  const cases: Array<{
    state: MonitoringState;
    monitoringTitle: string;
    emptyTitle: string;
  }> = [
    {
      state: 'ACTIVE',
      monitoringTitle: 'Monitoring is active',
      emptyTitle: 'No active events detected',
    },
    {
      state: 'PARTIAL',
      monitoringTitle: 'Some monitoring is active',
      emptyTitle: 'No events detected by active sources',
    },
    {
      state: 'DEGRADED',
      monitoringTitle: 'Monitoring is delayed',
      emptyTitle: 'No events available while monitoring is delayed',
    },
    {
      state: 'UNCOVERED',
      monitoringTitle: 'Live monitoring is unavailable',
      emptyTitle: 'Live monitoring is not available',
    },
    {
      state: 'SETUP_NEEDED',
      monitoringTitle: 'Property setup is needed',
      emptyTitle: 'Complete property setup',
    },
  ];

  for (const scenario of cases) {
    api.setMonitoringState(scenario.state);
    await page.goto(`${acceptancePath}?scenario=${scenario.state.toLowerCase()}`);
    await expect(page.getByRole('status')).toContainText(scenario.monitoringTitle);
    await expect(page.getByRole('heading', { name: scenario.emptyTitle })).toBeVisible();
  }
});

test('server filters, URL state, pagination, and unavailable categories stay authoritative', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const api = await installRadarApi(page);
  await page.goto(acceptancePath);

  await expect(page.getByRole('button', { name: /Load more events \(2 of 3\)/ })).toBeVisible();
  await page.getByRole('button', { name: /Load more events/ }).click();
  await expect(page.getByRole('button', { name: /Freeze advisory ended/ })).toBeVisible();
  await expect.poll(() => api.eventQueries.some((query) => (
    query.get('cursor') === 'acceptance-cursor-2'
  ))).toBe(true);

  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page).toHaveURL(/family=weather/);
  await expect.poll(() => api.eventQueries.at(-1)?.get('sourceFamily')).toBe('weather');
  await expect(page.getByRole('button', { name: /Planned utility maintenance/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page).toHaveURL(/view=now/);
  await expect.poll(() => api.eventQueries.at(-1)?.get('lifecycle')).toBe('now');

  const insurance = page.getByRole('button', { name: 'Insurance · unavailable' });
  await expect(insurance).toBeDisabled();
  await expect(insurance).toHaveAttribute('aria-disabled', 'true');
});

test('deep links restore selection and preserve filters when the sheet closes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await installRadarApi(page);
  await page.goto(`${acceptancePath}?view=now&family=weather&matchId=match-weather`);

  await expect(page.getByRole('dialog', { name: 'Severe thunderstorm warning' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page).toHaveURL(/view=now/);
  await expect(page).toHaveURL(/family=weather/);
  await expect(page).not.toHaveURL(/matchId=/);
  await expect(page.getByRole('button', { name: 'Now', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Weather', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('detail failures remain explicit and retry without fabricated evidence', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const api = await installRadarApi(page, { detailFailures: 2 });
  await page.goto(acceptancePath);

  await page.getByRole('button', { name: /Severe thunderstorm warning/ }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to load event details');
  await expect(page.getByRole('heading', { name: 'Official event details' })).toHaveCount(0);
  expect(api.detailAttempts()).toBe(2);

  await page.getByRole('button', { name: 'Retry details' }).click();
  await expect(page.getByRole('heading', { name: 'Official event details' })).toBeVisible();
  expect(api.detailAttempts()).toBeGreaterThanOrEqual(3);
});

test('overview failure is not an all-clear and supports retry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const api = await installRadarApi(page, { overviewFailures: 3 });
  await page.goto(acceptancePath);

  await expect(page.getByRole('alert').filter({
    hasText: 'Monitoring status unavailable',
  })).toBeVisible();
  await expect(page.getByText('must not be treated as an all-clear')).toBeVisible();
  expect(api.overviewAttempts()).toBe(3);

  await page.getByRole('button', { name: 'Retry status' }).click();
  await expect(page.getByRole('status')).toContainText('Monitoring is active');
  expect(api.overviewAttempts()).toBe(4);
});

test('personal state, restore, and feedback mutations remain match-scoped', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const api = await installRadarApi(page);
  await page.goto(acceptancePath);

  await page.getByRole('button', { name: /Severe thunderstorm warning/ }).click();
  await expect.poll(() => api.stateBodies.length).toBe(1);
  expect(api.stateBodies[0]).toEqual({
    state: 'seen',
    guidanceJourneyId: null,
    guidanceStepKey: null,
    guidanceSignalIntentFamily: null,
  });

  await page.getByRole('radio', { name: 'Wrong location' }).click();
  await page.getByLabel('Comment (optional)').fill('This warning is across the county line.');
  await page.getByRole('button', { name: 'Save feedback' }).click();
  await expect(page.getByText('Feedback saved. Thank you.')).toBeVisible();
  expect(api.feedbackBodies).toEqual([{
    feedbackType: 'wrong_location',
    comment: 'This warning is across the county line.',
  }]);
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('button', { name: /Planned utility maintenance/ })).toContainText(
    'Saved',
  );
  await page.getByRole('button', { name: /dismissed event/i }).click();
  await page.getByRole('button', { name: /Load more events/ }).click();
  await page.getByRole('button', { name: /Dismissed wind advisory/ }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => api.stateBodies.at(-1)?.state).toBe('seen');
  expect(api.stateBodies.at(-1)).not.toHaveProperty('userId');
  expect(api.stateBodies.at(-1)).not.toHaveProperty('stateMetaJson');
});
