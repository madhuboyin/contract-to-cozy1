import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = '22222222-2222-4222-8222-222222222222';

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=property-intelligence-acceptance-token');
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'property-intelligence-acceptance-token',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
}

export async function installPropertyIntelligenceApi(
  page: Page,
  mode: 'CURRENT' | 'DEGRADED' = 'CURRENT',
) {
  let disposition = 'DEFAULT';
  let briefingOpened = false;
  let itemSeen = false;

  await page.route(`**/api/properties/${propertyId}/around-your-home`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: aroundYourHomeFixture(mode, disposition),
    });
  });
  await page.route(
    `**/api/properties/${propertyId}/around-your-home/match-nyc-zap/interaction`,
    async (route) => {
      assertAuthenticated(route.request());
      const body = route.request().postDataJSON() as { action: string };
      disposition =
        body.action === 'FOLLOW'
          ? 'FOLLOWING'
          : body.action === 'DISMISS'
            ? 'DISMISSED'
            : body.action === 'NOT_RELEVANT'
              ? 'NOT_RELEVANT'
              : disposition;
      await fulfillJson(route, {
        success: true,
        data: { disposition },
      });
    },
  );
  await page.route(`**/api/properties/${propertyId}/home-briefing`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: homeBriefingFixture(mode, briefingOpened, itemSeen),
    });
  });
  await page.route(
    `**/api/properties/${propertyId}/home-briefing/deliveries/delivery-pilot/open`,
    async (route) => {
      assertAuthenticated(route.request());
      briefingOpened = true;
      await fulfillJson(route, { success: true, data: { openedAt: new Date().toISOString() } });
    },
  );
  await page.route(
    `**/api/properties/${propertyId}/home-briefing/items/item-pilot/outcome`,
    async (route) => {
      assertAuthenticated(route.request());
      const body = route.request().postDataJSON() as { outcome: string };
      if (body.outcome === 'SEEN') itemSeen = true;
      await fulfillJson(route, { success: true, data: { outcome: body.outcome } });
    },
  );
  await page.route(
    `**/api/properties/${propertyId}/home-briefing/generate`,
    async (route) => {
      assertAuthenticated(route.request());
      await fulfillJson(route, {
        success: true,
        data: homeBriefingFixture(mode, true, itemSeen).current,
      });
    },
  );
}

function sourceCoverage(state: 'CURRENT' | 'DEGRADED') {
  return {
    source: {
      key: 'nyc-dcp-zap-projects',
      family: 'PLANNING',
      provider: 'New York City Department of City Planning',
      termsVersion: 'NYC Open Data Terms of Use reviewed 2026-07-30',
    },
    geography: { type: 'COUNTY', key: 'NEW YORK COUNTY' },
    state,
    checkedThrough: state === 'CURRENT' ? '2026-07-30T12:00:00.000Z' : null,
    limitations: [
      'Monthly public planning records matched at county/borough precision only.',
    ],
    reasonCodes: state === 'CURRENT' ? [] : ['SOURCE_CHECK_FAILED'],
  };
}

function aroundYourHomeFixture(
  mode: 'CURRENT' | 'DEGRADED',
  disposition: string,
) {
  return {
    property: {
      id: propertyId,
      name: 'Manhattan pilot home',
      city: 'New York',
      state: 'NY',
      zipCode: '10019',
      latitude: null,
      longitude: null,
    },
    coverage: {
      state: mode,
      comprehensive: false,
      sources: [sourceCoverage(mode)],
      limitations: mode === 'CURRENT'
        ? ['Reviewed Manhattan pilot only; this is not comprehensive coverage.']
        : ['The NYC Planning source check is degraded. This is not an all-clear.'],
    },
    items: mode === 'CURRENT' ? [{
      propertyMatchId: 'match-nyc-zap',
      observation: {
        externalId: '2026M0366',
        observationType: 'NYC_ZONING_APPLICATION',
        lifecycleStatus: 'PROPOSED',
        observedAt: '2026-04-22T00:00:00.000Z',
        effectiveFrom: '2026-04-22T00:00:00.000Z',
        effectiveTo: null,
        revision: 1,
        facts: {
          title: '301 E 71st Street Transit Easement Certification',
          summary: 'NYC Planning published a filed transit-easement application.',
          officialStatus: 'Filed · Active',
          projectType: 'ZC',
        },
      },
      geography: {
        type: 'COUNTY',
        key: 'NEW YORK COUNTY',
        precision: 'COUNTY',
        matchedGeography: 'NEW YORK COUNTY',
        point: null,
        distanceMiles: null,
      },
      source: {
        key: 'nyc-dcp-zap-projects',
        family: 'PLANNING',
        provider: 'New York City Department of City Planning',
        url: 'https://data.cityofnewyork.us/City-Government/Zoning-Application-Portal-ZAP-Project-Data/hgx4-8ukb',
        publishedAt: '2026-04-22T00:00:00.000Z',
        lastCheckedAt: '2026-07-30T12:00:00.000Z',
        termsVersion: 'NYC Open Data Terms of Use reviewed 2026-07-30',
      },
      possibleRelevance: {
        relevance: 'LOW',
        materiality: 'MEANINGFUL',
        confidence: 0.7,
        explanation: 'The source record shares the property county. Its effect on this home is unknown.',
        missingFacts: ['verified property coordinates'],
        boundary: 'County-level context is not evidence of distance, causation, or property impact.',
      },
      interaction: {
        disposition,
        seenAt: null,
        lastSeenRevision: null,
        hasMaterialUpdate: false,
      },
      hierarchyRank: 1,
    }] : [],
    map: {
      points: [],
      unplottedCount: mode === 'CURRENT' ? 1 : 0,
      precisionNote: 'County-level records remain in the list and are not plotted as exact points.',
    },
    interpretationBoundary:
      'Planning lifecycle facts do not predict property value, demand, insurance, or household impact.',
  };
}

function homeBriefingFixture(
  mode: 'CURRENT' | 'DEGRADED',
  opened: boolean,
  seen: boolean,
) {
  const item = {
    id: 'item-pilot',
    propertyChangeId: 'change-pilot',
    canonicalActionId: null,
    canonicalEventId: null,
    topic: 'LOCAL_CHANGE',
    title: 'A NYC planning application was filed in Manhattan',
    summary: 'NYC Planning published a new county-level project record in the reviewed pilot scope.',
    materiality: 'MEANINGFUL',
    primaryDeepLink:
      `/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`,
    sourceLineage: {
      sourceType: 'INTELLIGENCE_OBSERVATION',
      sourceEntityId: 'nyc-dcp-zap-projects:2026M0366',
      sourceRevision: '1',
      changeType: 'SOURCE_RECORD_CREATED',
      detectedAt: '2026-07-30T12:00:00.000Z',
      occurredAt: '2026-04-22T00:00:00.000Z',
      confidence: 0.7,
      source: {
        provider: 'New York City Department of City Planning',
        url: 'https://data.cityofnewyork.us/City-Government/Zoning-Application-Portal-ZAP-Project-Data/hgx4-8ukb',
        lastVerifiedAt: '2026-07-30T12:00:00.000Z',
        lifecycleStatus: 'PROPOSED',
      },
    },
    shareEligible: true,
    openedAt: opened ? '2026-07-30T12:01:00.000Z' : null,
    seenAt: seen ? '2026-07-30T12:02:00.000Z' : null,
    actedAt: null,
    dismissedAt: null,
    notUsefulAt: null,
  };
  const current = {
    id: 'delivery-pilot',
    cadence: 'WEEKLY',
    channels: ['IN_APP'],
    windowStart: '2026-07-23T12:00:00.000Z',
    windowEnd: '2026-07-30T12:00:00.000Z',
    status: opened ? 'OPENED' : 'DELIVERED',
    itemCount: mode === 'CURRENT' ? 1 : 0,
    sourceHealthSnapshot: {
      comprehensive: false,
      capturedAt: '2026-07-30T12:00:00.000Z',
      sources: [sourceCoverage(mode)],
      scopeLimitations: mode === 'CURRENT'
        ? ['Reviewed Manhattan pilot only; this is not comprehensive coverage.']
        : ['The NYC Planning source check is degraded. This is not an all-clear.'],
    },
    quietReasonCodes: mode === 'DEGRADED' ? ['SOURCE_COVERAGE_DEGRADED'] : [],
    baselineVersion: 'home-briefing-deterministic-v1',
    generatedAt: '2026-07-30T12:00:00.000Z',
    deliveredAt: '2026-07-30T12:00:00.000Z',
    openedAt: opened ? '2026-07-30T12:01:00.000Z' : null,
    items: mode === 'CURRENT' ? [item] : [],
  };
  return {
    preference: {
      enabled: true,
      cadence: 'WEEKLY',
      topics: ['LOCAL_CHANGE'],
      channels: ['IN_APP'],
    },
    current,
    archive: [],
    unreadMaterialCount: mode === 'CURRENT' && !seen ? 1 : 0,
    archiveBoundary: 'Delivery history is not property history.',
    editorialBoundary: 'Facts and source lineage remain deterministic.',
  };
}
