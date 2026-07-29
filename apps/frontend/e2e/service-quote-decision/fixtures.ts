import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = 'property-service-quote-acceptance';
export const workspaceId = 'workspace-service-quote-acceptance';
const apiOrigin = 'http://localhost:8080';

function lineItems() {
  return [
    {
      id: 'line-equipment',
      kind: 'EQUIPMENT',
      description: 'Air handler replacement',
      quantity: 1,
      unit: 'each',
      unitPrice: 7000,
      total: 7000,
      confirmationStatus: 'CONFIRMED',
    },
    {
      id: 'line-labor',
      kind: 'LABOR',
      description: 'Installation labor',
      quantity: 8,
      unit: 'hour',
      unitPrice: 150,
      total: 1200,
      confirmationStatus: 'CONFIRMED',
    },
  ];
}

function terms() {
  return [
    { id: 'term-inclusion', type: 'INCLUSION', label: null, value: 'Equipment and installation', included: true, confirmationStatus: 'CONFIRMED' },
    { id: 'term-exclusion', type: 'EXCLUSION', label: null, value: 'Electrical panel upgrades', included: false, confirmationStatus: 'CONFIRMED' },
    { id: 'term-warranty', type: 'WARRANTY', label: null, value: '10-year parts, 1-year labor', included: null, confirmationStatus: 'CONFIRMED' },
    { id: 'term-payment', type: 'PAYMENT', label: null, value: '20% deposit; balance on completion', included: null, confirmationStatus: 'CONFIRMED' },
  ];
}

function quote(input: {
  id: string;
  vendorName: string;
  quoteAmount: number;
  expirationDate: string;
}) {
  return {
    id: input.id,
    vendorName: input.vendorName,
    quoteAmount: input.quoteAmount,
    currency: 'USD',
    serviceCategory: 'HVAC',
    serviceLabelRaw: 'Air handler replacement',
    quoteDate: '2026-07-01T12:00:00.000Z',
    expirationDate: input.expirationDate,
    serviceLocation: 'Attic',
    scopeKind: 'REPLACEMENT',
    scopeSummary: 'Replace the attic air handler.',
    notes: null,
    sourceType: 'UPLOADED_QUOTE',
    sourceReferenceId: null,
    decision: 'UNDECIDED',
    isSelected: false,
    readinessStage: 'COMPARISON_READY',
    readinessScore: 100,
    missingFactsJson: [],
    ambiguitiesJson: [],
    homeownerConfirmedAt: '2026-07-02T12:00:00.000Z',
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-02T12:00:00.000Z',
    lineItems: lineItems().map((item) => ({ ...item, id: `${input.id}-${item.id}` })),
    terms: terms().map((term) => ({ ...term, id: `${input.id}-${term.id}` })),
    extractions: [{
      id: `${input.id}-extraction`,
      status: 'CONFIRMED',
      provider: 'document-intelligence',
      model: 'parser-v2',
      schemaVersion: 'quote-proposal-v1',
      completedAt: '2026-07-01T12:00:00.000Z',
      confirmedAt: '2026-07-02T12:00:00.000Z',
      document: { id: `${input.id}-document`, name: `${input.vendorName}.pdf`, mimeType: 'application/pdf' },
    }],
    clarifications: [],
  };
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'service-quote-browser-token',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
  await context.addInitScript(() => {
    window.localStorage.setItem('ctc_cookie_consent', 'essential');
  });
}

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=service-quote-browser-token');
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data }),
  });
}

export async function installServiceQuoteDecisionApi(page: Page) {
  let quotes = [
    quote({
      id: 'quote-current',
      vendorName: 'Current HVAC',
      quoteAmount: 8200,
      expirationDate: '2026-09-15T12:00:00.000Z',
    }),
    quote({
      id: 'quote-expired',
      vendorName: 'Expired HVAC',
      quoteAmount: 7600,
      expirationDate: '2026-07-15T12:00:00.000Z',
    }),
  ];
  const mutationBodies: Array<{ path: string; body: Record<string, unknown> }> = [];

  const workspace = () => ({
    id: workspaceId,
    status: 'DRAFT',
    journeyStage: 'COMPARISON',
    outcome: 'OPEN',
    serviceCategory: 'HVAC',
    inventoryItemId: null,
    selectedQuoteId: null,
    selectedQuote: null,
    negotiationCase: null,
    priceFinalization: null,
    booking: null,
    transitions: [
      {
        id: 'transition-1',
        fromStage: 'QUOTE_INTAKE',
        toStage: 'SCOPE_REVIEW',
        outcome: 'OPEN',
        reason: 'Proposal facts were reviewed.',
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 'transition-2',
        fromStage: 'SCOPE_REVIEW',
        toStage: 'COMPARISON',
        outcome: 'OPEN',
        reason: 'Two proposals are comparison ready.',
        relatedEntityType: null,
        relatedEntityId: null,
        createdAt: '2026-07-02T12:00:00.000Z',
      },
    ],
    contextLinks: [],
    quotes,
  });

  await page.route(`${apiOrigin}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname;

    if (requestPath === '/api/csrf-token') {
      await fulfillJson(route, { csrfToken: 'service-quote-csrf' });
      return;
    }
    assertAuthenticated(request);

    if (requestPath === '/api/auth/me') {
      await fulfillJson(route, {
        id: 'user-service-quote-acceptance',
        email: 'homeowner@example.com',
        firstName: 'Acceptance',
        lastName: 'Homeowner',
        role: 'HOMEOWNER',
        emailVerified: true,
        status: 'ACTIVE',
        createdAt: '2026-01-01T12:00:00.000Z',
      });
      return;
    }
    if (requestPath === '/api/notifications/unread-count') {
      await fulfillJson(route, { count: 0 });
      return;
    }
    if (requestPath === '/api/properties') {
      await fulfillJson(route, {
        properties: [{
          id: propertyId,
          homeownerProfileId: 'profile-service-quote-acceptance',
          name: 'Main Home',
          address: '100 Acceptance Way',
          city: 'Hoboken',
          state: 'NJ',
          zipCode: '07030',
          isPrimary: true,
          dwellingType: 'SINGLE_FAMILY_DETACHED',
          ownershipForm: 'SOLE_OWNER',
          propertyUse: 'PRIMARY_RESIDENCE',
          occupancyStatus: 'OWNER_OCCUPIED',
          propertySize: 1900,
          yearBuilt: 1995,
        }],
      });
      return;
    }
    if (requestPath === `/api/properties/${propertyId}`) {
      await fulfillJson(route, {
        id: propertyId,
        homeownerProfileId: 'profile-service-quote-acceptance',
        name: 'Main Home',
        address: '100 Acceptance Way',
        city: 'Hoboken',
        state: 'NJ',
        zipCode: '07030',
        isPrimary: true,
        dwellingType: 'SINGLE_FAMILY_DETACHED',
        ownershipForm: 'SOLE_OWNER',
        propertyUse: 'PRIMARY_RESIDENCE',
        occupancyStatus: 'OWNER_OCCUPIED',
        propertySize: 1900,
        yearBuilt: 1995,
      });
      return;
    }
    if (requestPath === `/api/properties/${propertyId}/onboarding/status`) {
      await fulfillJson(route, {
        propertyId,
        status: 'COMPLETED',
        currentStep: 5,
        dismissedAt: null,
        setupScore: 100,
        steps: [],
        recommendedNextStep: 5,
      });
      return;
    }
    if (requestPath.endsWith('/related-capabilities')) {
      await fulfillJson(route, {
        registryVersion: 'service-quote-acceptance-v1',
        recommendationVersion: 'capability-related-v1',
        contextVersion: 'service-quote-context-v1',
        currentCapabilityId: 'quote-comparison',
        suggestions: [],
      });
      return;
    }
    if (requestPath.endsWith('/capability-suggestions')) {
      await fulfillJson(route, {
        contractVersion: 'capability-suggestions-v1',
        registryVersion: 'service-quote-acceptance-v1',
        recommendationVersion: 'capability-recommendation-v1',
        contextVersion: 'service-quote-context-v1',
        generatedAt: '2026-07-28T12:00:00.000Z',
        surface: 'WORKFLOW',
        suggestions: [],
      });
      return;
    }
    if (requestPath.endsWith('/tool-discovery/events')) {
      await fulfillJson(route, { accepted: 1 });
      return;
    }
    if (requestPath.endsWith('/service-price-radar/checks')) {
      await fulfillJson(route, { items: [] });
      return;
    }
    if (requestPath.endsWith('/context/project-compliance')) {
      await fulfillJson(route, {
        propertyId,
        contextVersion: 'service-quote-context-v1',
        isStale: false,
        decision: {
          status: 'APPLICABLE',
          reasonCodes: ['QUOTE_CONTEXT_READY'],
          usedFactKeys: ['property.id'],
          missingFactKeys: [],
          conflictedFactKeys: [],
          validUntil: null,
        },
      });
      return;
    }
    if (
      requestPath.endsWith('/quote-comparison/workspaces')
      && request.method() === 'POST'
    ) {
      await fulfillJson(route, { workspace: workspace(), reused: true });
      return;
    }
    if (requestPath.endsWith(`/quote-comparison/workspaces/${workspaceId}/comparability`)) {
      await fulfillJson(route, {
        comparability: {
          status: 'COMPARABLE',
          eligibleQuoteIds: quotes.map((item) => item.id),
          reasons: ['The confirmed proposals share the same category, work type, location, and itemized scope.'],
        },
      });
      return;
    }
    if (
      requestPath.endsWith(`/quote-comparison/workspaces/${workspaceId}`)
      && request.method() === 'GET'
    ) {
      await fulfillJson(route, { workspace: workspace() });
      return;
    }
    if (requestPath.endsWith('/disposition') && request.method() === 'POST') {
      const body = request.postDataJSON();
      mutationBodies.push({ path: requestPath, body });
      const quoteId = requestPath.split('/').at(-2);
      quotes = quotes.map((item) => item.id === quoteId
        ? { ...item, decision: body.decision }
        : item);
      await fulfillJson(route, { workspace: workspace() });
      return;
    }
    if (request.method() === 'PATCH' && requestPath.includes('/quotes/')) {
      const body = request.postDataJSON();
      mutationBodies.push({ path: requestPath, body });
      const quoteId = requestPath.split('/').at(-1);
      quotes = quotes.map((item) => item.id === quoteId
        ? { ...item, ...body, homeownerConfirmedAt: null, readinessStage: 'REVIEW_READY' }
        : item);
      await fulfillJson(route, { quote: quotes.find((item) => item.id === quoteId) });
      return;
    }

    await fulfillJson(route, {});
  });

  return {
    mutationBodies,
  };
}
