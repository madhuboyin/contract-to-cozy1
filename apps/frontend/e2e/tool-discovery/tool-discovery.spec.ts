import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';
import type { CapabilityCatalog } from '../../src/features/tools/capabilityTypes';

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

const canonicalCatalogFixture: CapabilityCatalog = {
  registryVersion: 'acceptance-canonical-registry-v1',
  propertyId: 'tool-discovery-property',
  workflowContextIncluded: false,
  capabilities: [
    {
      id: 'seller-prep',
      version: 1,
      label: 'Seller Prep',
      shortDescription: 'Prepare the home and records for a sale.',
      longDescription: 'Organize sale preparation around the home, its records, and the expected timeline.',
      iconName: 'clipboard-check',
      outcomeCategory: 'DECIDE_COMPARE',
      primaryJob: 'MAJOR_MOMENT',
      primaryDestination: 'PLAN_PROJECTS',
      intentAliases: ['prepare to sell', 'seller checklist'],
      supportedContext: ['PROPERTY', 'PROJECT', 'JOURNEY'],
      readinessRequirements: [{ kind: 'PROPERTY', reason: 'Select a property first.' }],
      expectedOutput: 'A prioritized seller preparation plan.',
      routeTemplate: '/dashboard/properties/[id]/seller-prep',
      href: '/dashboard/properties/tool-discovery-property/seller-prep',
      workflowOnly: false,
      releaseStage: 'ACTIVE',
      badges: [],
    },
    {
      id: 'home-digital-will',
      version: 1,
      label: 'Home Digital Will',
      shortDescription: 'Prepare critical home records for trusted access.',
      longDescription: 'Organize critical documents, trusted contacts, and transfer instructions for the home.',
      iconName: 'file-check',
      outcomeCategory: 'PROTECT_MONITOR',
      primaryJob: 'STAY_AHEAD',
      primaryDestination: 'HOME_RECORD',
      intentAliases: ['emergency home documents', 'trusted home contacts'],
      supportedContext: ['PROPERTY', 'DOCUMENT'],
      readinessRequirements: [{ kind: 'PROPERTY', reason: 'Select a property first.' }],
      expectedOutput: 'A durable trusted-access plan.',
      routeTemplate: '/dashboard/properties/[id]/tools/home-digital-will',
      href: '/dashboard/properties/tool-discovery-property/tools/home-digital-will',
      workflowOnly: false,
      releaseStage: 'ACTIVE',
      badges: [],
    },
    {
      id: 'plant-advisor',
      version: 1,
      label: 'Plant Advisor',
      shortDescription: 'Match plant care to room and light context.',
      longDescription: 'Use room, light, and seasonal context to plan practical plant care.',
      iconName: 'leaf',
      outcomeCategory: 'MAINTAIN_PREVENT',
      primaryJob: 'STAY_AHEAD',
      primaryDestination: 'HOME_RECORD',
      intentAliases: ['plant care', 'room light'],
      supportedContext: ['PROPERTY', 'ROOM'],
      readinessRequirements: [{ kind: 'PROPERTY', reason: 'Select a property first.' }],
      expectedOutput: 'A room-aware plant care recommendation.',
      routeTemplate: '/dashboard/properties/[id]/tools/plant-advisor',
      href: '/dashboard/properties/tool-discovery-property/tools/plant-advisor',
      workflowOnly: false,
      releaseStage: 'ACTIVE',
      badges: [],
    },
    {
      id: 'permits',
      version: 1,
      label: 'Permit Tracker',
      shortDescription: 'Track permit requirements and status.',
      longDescription: 'Keep permit-relevant projects, inspections, and supporting records organized.',
      iconName: 'clipboard-list',
      outcomeCategory: 'PLAN_BUDGET',
      primaryJob: 'MAJOR_MOMENT',
      primaryDestination: 'PLAN_PROJECTS',
      intentAliases: ['permit status', 'project permits'],
      supportedContext: ['PROPERTY', 'PROJECT', 'DOCUMENT'],
      readinessRequirements: [{ kind: 'PROPERTY', reason: 'Select a property first.' }],
      expectedOutput: 'A current permit and inspection record.',
      routeTemplate: '/dashboard/properties/[id]/tools/permits',
      href: '/dashboard/properties/tool-discovery-property/tools/permits',
      workflowOnly: false,
      releaseStage: 'ACTIVE',
      badges: [],
    },
    {
      id: 'ownership-costs',
      version: 1,
      label: 'Ownership Costs',
      shortDescription: 'Model long-term ownership cost trends.',
      longDescription: 'Review how recurring ownership costs may change over time.',
      iconName: 'dollar-sign',
      outcomeCategory: 'SAVE_OPTIMIZE',
      primaryJob: 'DECIDE',
      primaryDestination: 'PLAN_PROJECTS',
      intentAliases: ['future home costs', 'ownership cost trend'],
      supportedContext: ['PROPERTY'],
      readinessRequirements: [{ kind: 'PROPERTY', reason: 'Select a property first.' }],
      expectedOutput: 'A long-term ownership cost projection.',
      routeTemplate: '/dashboard/properties/[id]/ownership-costs',
      href: '/dashboard/properties/tool-discovery-property/ownership-costs',
      workflowOnly: false,
      releaseStage: 'ACTIVE',
      badges: [],
    },
    {
      id: 'material-specs',
      version: 1,
      label: 'Material Specs',
      shortDescription: 'Record finishes and products used in the home.',
      longDescription: 'Create a durable record of paint, flooring, finishes, products, and suppliers.',
      iconName: 'layers',
      outcomeCategory: 'UNDERSTAND_HOME',
      primaryJob: 'STAY_AHEAD',
      primaryDestination: 'HOME_RECORD',
      intentAliases: ['what paint did I use', 'match a repair finish'],
      supportedContext: ['PROPERTY', 'PROJECT', 'ROOM'],
      readinessRequirements: [{ kind: 'PROPERTY', reason: 'Select a property first.' }],
      expectedOutput: 'A durable material record.',
      routeTemplate: '/dashboard/properties/[id]/materials',
      href: '/dashboard/properties/tool-discovery-property/materials',
      workflowOnly: false,
      releaseStage: 'ACTIVE',
      badges: [],
    },
  ],
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
  await page.route('**/api/tool-capabilities*', async (route) => {
    const headers = {
      'access-control-allow-credentials': 'true',
      'access-control-allow-origin': 'http://127.0.0.1:3107',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        success: true,
        data: canonicalCatalogFixture,
      }),
    });
  });
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
  await expect(page.getByText('Ownership Costs', { exact: true })).toBeVisible();
  await expect(page.getByText('Plant Advisor', { exact: true })).toHaveCount(0);

  const ownershipCostsLink = page.getByRole('link', { name: /Ownership Costs/ });
  await expect(ownershipCostsLink).toHaveAttribute('href', /launchSurface=explore_tools/);
  await expect(ownershipCostsLink).toHaveAttribute('href', /contextVersion=tool-context-v2/);
});

test('cards, search, explanations, and feedback controls meet the accessibility gate', async ({ page }) => {
  await page.goto('/acceptance/tool-discovery');
  await waitForAcceptanceHydration(page);
  await page.addScriptTag({ content: axeCore.source });

  const results = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: {
        run: (
          root: Document,
          options: Record<string, unknown>,
        ) => Promise<{
          violations: Array<{
            id: string;
            impact: string | null;
            help: string;
            nodes: Array<{ target: string[]; failureSummary?: string }>;
          }>;
        }>;
      };
    }).axe;
    return axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
    });
  });
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);

  const headingLevels = await page
    .getByRole('heading')
    .evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1))));
  expect(headingLevels[0]).toBe(1);
  for (let index = 1; index < headingLevels.length; index += 1) {
    expect(headingLevels[index] - headingLevels[index - 1]).toBeLessThanOrEqual(1);
  }

  const search = page.getByLabel('Search home tools');
  await centerInViewport(search);
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.type('cost growth');
  await expect(page.getByText('Ownership Costs', { exact: true })).toBeVisible();

  const inline = page.getByTestId('inline-capability-coverage-options');
  await centerInViewport(inline);
  const notRelevant = inline.getByRole('button', { name: 'Not relevant' });
  const dismiss = inline.getByRole('button', { name: 'Dismiss' });
  await expect(notRelevant).toBeVisible();
  await notRelevant.focus();
  await expect(notRelevant).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Suggestion marked not relevant.')).toBeVisible();
  await dismiss.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Suggestion dismissed.')).toBeVisible();

  for (const control of [search, notRelevant, dismiss]) {
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  }
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

  const ownershipCostsLink = page.getByRole('link', { name: /Ownership Costs/ });
  await centerInViewport(ownershipCostsLink);
  await expect.poll(async () =>
    (await discoveredEvents(page))
      .filter((event) =>
        event.surface === 'explore_tools'
        && event.toolId === 'ownership-costs').length).toBe(1);

  await page.getByRole('heading', { name: 'Tool discovery acceptance' })
    .scrollIntoViewIfNeeded();
  await centerInViewport(ownershipCostsLink);
  await page.waitForTimeout(900);
  expect(
    (await discoveredEvents(page)).filter((event) =>
      event.surface === 'explore_tools'
      && event.toolId === 'ownership-costs'),
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
