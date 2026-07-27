import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = '11111111-1111-4111-8111-111111111111';

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=coverage-acceptance-token');
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'coverage-acceptance-token',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
}

export async function installMarketContextApi(
  page: Page,
  state: 'READY' | 'SOURCE_UNAVAILABLE' | 'STALE' = 'READY',
) {
  await page.route(`**/api/properties/${propertyId}/insurance-market-context`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: state === 'READY' ? readyContext() : unavailableContext(state),
    });
  });
}

function readyContext() {
  return {
    contractVersion: 'insurance-market-context-v1',
    classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE',
    jurisdictionCode: 'TN',
    state: 'READY',
    message: 'Observed market context, not a personal quote.',
    current: {
      value: 2400,
      currency: 'USD',
      geography: { type: 'STATE', code: 'TN' },
      period: {
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-06-30T23:59:59.000Z',
      },
      coverageBasis: {
        label: 'Owner-occupied HO-3 detached homes',
        policyForms: ['HO-3'],
        dwellingTypes: ['SINGLE_FAMILY'],
        limitations: [
          'Period aggregate; individual underwriting factors are excluded.',
          'Coverage limits, deductibles, endorsements, and claims history may differ.',
        ],
      },
      sampleSize: 1200,
      notes: null,
      retrievedAt: '2026-07-15T00:00:00.000Z',
      releaseVersion: '2026-Q2',
      source: {
        key: 'acceptance-reviewed-source',
        name: 'Reviewed market source',
        ownerName: 'Acceptance source owner',
        url: 'https://example.com/methodology',
      },
      methodologySummary: 'Observed written premium for the stated period and basis.',
    },
    previous: {
      value: 2000,
      currency: 'USD',
      geography: { type: 'STATE', code: 'TN' },
      period: {
        start: '2025-04-01T00:00:00.000Z',
        end: '2025-06-30T23:59:59.000Z',
      },
      coverageBasis: {
        label: 'Owner-occupied HO-3 detached homes',
        policyForms: ['HO-3'],
        dwellingTypes: ['SINGLE_FAMILY'],
        limitations: ['Period aggregate; individual underwriting factors are excluded.'],
      },
      sampleSize: 1100,
      notes: null,
      retrievedAt: '2025-07-15T00:00:00.000Z',
      releaseVersion: '2025-Q2',
      source: {
        key: 'acceptance-reviewed-source',
        name: 'Reviewed market source',
        ownerName: 'Acceptance source owner',
        url: 'https://example.com/methodology',
      },
      methodologySummary: 'Observed written premium for the stated period and basis.',
    },
    change: { absolute: 400, percent: 20 },
  };
}

function unavailableContext(state: 'SOURCE_UNAVAILABLE' | 'STALE') {
  const base = {
    contractVersion: 'insurance-market-context-v1',
    classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE',
    jurisdictionCode: 'TN',
    state,
    message: state === 'STALE'
      ? 'The latest matching market observation is stale and is not shown as current.'
      : 'The market source is temporarily unavailable. Saved policy facts are unaffected.',
  };
  return state === 'STALE'
    ? {
        ...base,
        lastRetrievedAt: '2025-07-15T00:00:00.000Z',
        expiredAt: '2026-01-15T00:00:00.000Z',
        source: {
          key: 'acceptance-reviewed-source',
          name: 'Reviewed market source',
          ownerName: 'Acceptance source owner',
          url: 'https://example.com/methodology',
        },
      }
    : base;
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}
