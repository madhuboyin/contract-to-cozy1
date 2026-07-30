import { expect, type BrowserContext, type Page, type Route } from '@playwright/test';

export const propertyId = 'property-renovation-acceptance';
export const caseId = 'renovation-case-acceptance';
const apiOrigin = 'http://localhost:8080';

type FixtureOptions = {
  empty?: boolean;
  readinessFailure?: boolean;
  complianceFailure?: boolean;
  requirementsFailures?: number;
};

const property = {
  id: propertyId,
  homeownerProfileId: 'profile-renovation-acceptance',
  name: 'Acceptance Home',
  address: '100 Renovation Way',
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
};

const renovationCase = {
  id: caseId,
  propertyId,
  name: 'Kitchen and electrical remodel',
  objective: 'Improve accessibility while replacing the electrical panel.',
  caseType: 'REMODEL',
  lifecycle: 'PREPARING_TO_START',
  outcomeStatus: 'OPEN',
  governanceTier: 'COMPLIANCE_SENSITIVE',
  responsibilityContext: 'HOMEOWNER',
  currentScopeVersionId: 'scope-renovation-acceptance',
  readinessSummary: {
    state: 'NOT_READY',
    totalItems: 4,
    openItems: 2,
    blockingItems: 2,
    acknowledgedOpenItems: 0,
    evaluatedAt: '2026-07-29T12:00:00.000Z',
  },
  currentScopeVersion: {
    id: 'scope-renovation-acceptance',
    version: 2,
    approvalStatus: 'APPROVED',
  },
  links: [
    { id: 'link-project', linkType: 'PROJECT', targetId: 'project-renovation-acceptance' },
    { id: 'link-permit', linkType: 'PERMIT', targetId: 'permit-renovation-acceptance' },
  ],
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-29T12:00:00.000Z',
};

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(status < 400
      ? { success: true, data }
      : { success: false, message: typeof data === 'string' ? data : 'Fixture request failed' }),
  });
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'renovation-browser-token',
    url: apiOrigin,
    httpOnly: true,
    sameSite: 'Strict',
  }]);
  expect((await context.cookies(apiOrigin)).find((cookie) => cookie.name === 'ctc.at')?.value)
    .toBe('renovation-browser-token');
  await context.addInitScript(() => {
    window.localStorage.setItem('ctc_cookie_consent', 'essential');
  });
}

export async function installRenovationApi(page: Page, options: FixtureOptions = {}) {
  const requests: string[] = [];
  let remainingRequirementsFailures = options.requirementsFailures ?? 0;

  await page.route(`${apiOrigin}/api/**`, async (route) => {
    const request = route.request();
    const requestPath = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${requestPath}`);

    if (requestPath === '/api/csrf-token') {
      await fulfillJson(route, { csrfToken: 'renovation-browser-csrf' });
      return;
    }
    if (requestPath === '/api/auth/me') {
      await fulfillJson(route, {
        id: 'user-renovation-acceptance',
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
      await fulfillJson(route, { properties: [property] });
      return;
    }
    if (requestPath === `/api/properties/${propertyId}`) {
      await fulfillJson(route, property);
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
    if (requestPath === `/api/properties/${propertyId}/renovation-cases`) {
      await fulfillJson(route, options.empty ? [] : [renovationCase]);
      return;
    }
    if (requestPath === `/api/properties/${propertyId}/renovation-cases/${caseId}`) {
      await fulfillJson(route, renovationCase);
      return;
    }
    if (
      request.method() === 'GET'
      && requestPath === `/api/properties/${propertyId}/renovation-cases/${caseId}/requirements`
    ) {
      if (remainingRequirementsFailures > 0) {
        remainingRequirementsFailures -= 1;
        await fulfillJson(route, 'Requirements source temporarily unavailable', 503);
        return;
      }
      await fulfillJson(route, []);
      return;
    }
    if (requestPath === `/api/properties/${propertyId}/renovation-cases/${caseId}/readiness`) {
      if (options.readinessFailure) {
        await fulfillJson(route, 'Readiness source unavailable', 503);
        return;
      }
      await fulfillJson(route, {
        summary: {
          ...renovationCase.readinessSummary,
          disclaimer: 'This readiness assessment organizes project records and does not establish legal compliance.',
        },
        items: [
          { id: 'readiness-permit', status: 'OPEN', isBlocking: true, title: 'Permit issuance' },
          { id: 'readiness-panel', status: 'OPEN', isBlocking: true, title: 'Electrical provider' },
        ],
        project: null,
      });
      return;
    }
    if (requestPath === `/api/properties/${propertyId}/renovation-cases/${caseId}/compliance-workflow`) {
      if (options.complianceFailure) {
        await fulfillJson(route, 'Compliance source unavailable', 503);
        return;
      }
      await fulfillJson(route, {
        requirements: [{ id: 'requirement-permit', family: 'PERMIT', determination: 'APPLIES' }],
        conditions: [{ id: 'condition-panel', status: 'OPEN', isBlocking: true }],
        permits: [{ id: 'permit-renovation-acceptance', status: 'APPLICATION_PREP' }],
        hoaApprovals: [],
      });
      return;
    }
    if (
      requestPath.endsWith('/tool-discovery/events')
      || requestPath.endsWith('/tool-lifecycle/events')
      || requestPath.includes('/capability-')
      || requestPath.endsWith('/related-capabilities')
    ) {
      await fulfillJson(route, { accepted: 1, suggestions: [] });
      return;
    }

    await fulfillJson(route, {});
  });

  return { requests };
}
