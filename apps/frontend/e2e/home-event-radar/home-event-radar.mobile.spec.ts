import { expect, test } from '@playwright/test';
import { installAuthenticatedContext, installRadarApi } from './fixtures';

test.beforeEach(async ({ context }) => {
  await installAuthenticatedContext(context);
});

test('mobile feed and bottom-sheet detail remain accessible without horizontal overflow', async ({
  page,
}) => {
  await installRadarApi(page);
  await page.goto('/acceptance/home-event-radar');

  await expect(page.getByRole('heading', { name: 'Home Event Radar' })).toBeVisible();
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);

  const timingGroup = page.getByRole('group', { name: 'Event timing' });
  const categoryGroup = page.getByRole('group', { name: 'Event category' });
  await expect(timingGroup).toBeVisible();
  await expect(categoryGroup).toBeVisible();
  for (const button of [
    ...await timingGroup.getByRole('button').all(),
    ...await categoryGroup.getByRole('button').all(),
  ]) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole('button', { name: /Severe thunderstorm warning/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Severe thunderstorm warning' });
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - (viewport?.height ?? 0));
  }).toBeLessThanOrEqual(2);
  await expect.poll(async () => (
    (await dialog.boundingBox())?.width ?? 0
  )).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);

  for (const name of ['Save', 'Mark done', 'Dismiss', 'Save feedback']) {
    const button = dialog.getByRole('button', { name, exact: true });
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(dialog.getByRole('radio', { name: 'Not relevant to my home' })).toBeVisible();
  await expect(dialog.getByLabel('Comment (optional)')).toHaveAttribute('maxlength', '500');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/matchId=/);
});
