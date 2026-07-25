import { expect, test } from '@playwright/test';

type CapturedLifecycleBatch = {
  propertyId: string;
  events: Array<{
    toolId: string;
    stage: string;
    surface: string;
    registryVersion?: string | null;
    contextVersion?: string | null;
    sourceActionId?: string | null;
  }>;
};

async function installLifecycleCapture(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const captureWindow = window as typeof window & {
      __ctcCapturedLifecycleBatches?: CapturedLifecycleBatch[];
      __ctcToolLifecycleAcceptanceSink?: (
        propertyId: string,
        events: CapturedLifecycleBatch['events'],
      ) => void;
    };
    captureWindow.__ctcCapturedLifecycleBatches = [];
    captureWindow.__ctcToolLifecycleAcceptanceSink = (propertyId, events) => {
      captureWindow.__ctcCapturedLifecycleBatches!.push({
        propertyId,
        events: structuredClone(events),
      });
    };
  });
}

async function capturedLifecycle(
  page: import('@playwright/test').Page,
): Promise<CapturedLifecycleBatch[]> {
  return page.evaluate(() => {
    const captureWindow = window as typeof window & {
      __ctcCapturedLifecycleBatches?: CapturedLifecycleBatch[];
    };
    return structuredClone(captureWindow.__ctcCapturedLifecycleBatches ?? []);
  });
}

async function discoveredEvents(page: import('@playwright/test').Page) {
  return (await capturedLifecycle(page))
    .flatMap((batch) =>
      batch.events.map((event) => ({
        ...event,
        propertyId: batch.propertyId,
      })))
    .filter((event) => event.stage === 'DISCOVERED');
}

async function waitForAcceptanceHydration(
  page: import('@playwright/test').Page,
) {
  await expect(page.locator('main')).toHaveAttribute(
    'data-acceptance-hydrated',
    'true',
  );
}

async function centerInViewport(
  locator: import('@playwright/test').Locator,
) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
}

test.beforeEach(async ({ page }) => {
  await installLifecycleCapture(page);
});

test('Unified Home tools preserve recommendation and property context', async ({ page }) => {
  await page.goto('/acceptance/tool-discovery');
  await waitForAcceptanceHydration(page);

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
  await waitForAcceptanceHydration(page);

  await expect(page.getByText('Quote Comparison', { exact: true })).toHaveCount(0);
  const search = page.getByLabel('Search home tools');
  await search.fill('cost growth');
  await expect(search).toHaveValue('cost growth');
  await expect(page.getByText('Cost Growth', { exact: true })).toBeVisible();
  await expect(page.getByText('Plant Advisor', { exact: true })).toHaveCount(0);

  const costGrowthLink = page.getByRole('link', { name: /Cost Growth/ });
  await expect(costGrowthLink).toHaveAttribute('href', /launchSurface=explore_tools/);
  await expect(costGrowthLink).toHaveAttribute('href', /contextVersion=tool-context-v2/);
});

test('actual-view telemetry records only viewport-qualified tools and deduplicates the session', async ({ page }) => {
  await page.goto('/acceptance/tool-discovery');
  await waitForAcceptanceHydration(page);

  await expect(page.getByTestId('telemetry-viewport-gate')).toBeVisible();
  await page.waitForTimeout(900);
  expect(await discoveredEvents(page)).toEqual([]);

  const coverageCard = page.getByTestId('unified-home-tool-coverage-options');
  await centerInViewport(coverageCard);
  await expect.poll(async () => (await discoveredEvents(page)).length).toBeGreaterThan(0);
  // A narrow viewport can expose the next stacked card at the same time.
  // Allow the full continuous-exposure window before comparing all visible
  // cards with emitted events.
  await page.waitForTimeout(900);

  const visibleUnifiedIds = await page
    .locator('[data-testid^="unified-home-tool-"]')
    .evaluateAll((elements) => elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const visibleWidth = Math.max(
        0,
        Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
      );
      const visibleHeight = Math.max(
        0,
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
      );
      const ratio = rect.width * rect.height > 0
        ? (visibleWidth * visibleHeight) / (rect.width * rect.height)
        : 0;
      return ratio >= 0.5
        ? [element.getAttribute('data-testid')!.replace('unified-home-tool-', '')]
        : [];
    }));
  const initialEvents = await discoveredEvents(page);
  const unifiedEvents = initialEvents.filter(
    (event) => event.surface === 'unified_home',
  );
  expect([...new Set(unifiedEvents.map((event) => event.toolId))].sort())
    .toEqual([...visibleUnifiedIds].sort());
  expect(unifiedEvents.every((event) =>
    event.propertyId === 'tool-discovery-property'
    && event.registryVersion === 'acceptance-registry-v1'
    && event.contextVersion === 'tool-context-v2')).toBe(true);
  expect(unifiedEvents.find((event) => event.toolId === 'coverage-options'))
    .toMatchObject({
      sourceActionId: 'coverage-action-1',
      stage: 'DISCOVERED',
    });
  expect(initialEvents.some((event) => event.surface === 'explore_tools')).toBe(false);

  const costGrowthLink = page.getByRole('link', { name: /Cost Growth/ });
  await centerInViewport(costGrowthLink);
  await expect.poll(async () =>
    (await discoveredEvents(page))
      .filter((event) =>
        event.surface === 'explore_tools'
        && event.toolId === 'cost-growth').length).toBe(1);

  await page.getByRole('heading', { name: 'Tool discovery acceptance' })
    .scrollIntoViewIfNeeded();
  await centerInViewport(costGrowthLink);
  await page.waitForTimeout(900);
  expect(
    (await discoveredEvents(page)).filter((event) =>
      event.surface === 'explore_tools'
      && event.toolId === 'cost-growth'),
  ).toHaveLength(1);

  await page.reload();
  await waitForAcceptanceHydration(page);
  await centerInViewport(coverageCard);
  await page.waitForTimeout(900);
  expect(await discoveredEvents(page)).toEqual([]);
});

test('standalone mobile PWA preserves actual-view behavior', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-pwa');
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query !== '(display-mode: standalone)') return originalMatchMedia(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      };
    };
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
  });

  await page.goto('/acceptance/tool-discovery');
  await waitForAcceptanceHydration(page);
  expect(await page.evaluate(() =>
    window.matchMedia('(display-mode: standalone)').matches)).toBe(true);

  const manifest = await page.request.get('/manifest.json');
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({
    start_url: '/dashboard',
    display: 'standalone',
    scope: '/',
  });

  await centerInViewport(
    page.getByTestId('unified-home-tool-coverage-options'),
  );
  await expect.poll(async () =>
    (await discoveredEvents(page))
      .filter((event) => event.toolId === 'coverage-options').length).toBe(1);
});
