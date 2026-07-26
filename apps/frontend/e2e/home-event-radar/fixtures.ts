import { expect, type BrowserContext, type Page, type Route } from '@playwright/test';

export const propertyId = '11111111-1111-4111-8111-111111111111';
export const apiOrigin = 'http://localhost:3111';

export type MonitoringState =
  | 'ACTIVE'
  | 'PARTIAL'
  | 'DEGRADED'
  | 'UNCOVERED'
  | 'SETUP_NEEDED';

type RadarState = 'new' | 'seen' | 'saved' | 'dismissed' | 'acted_on';
type FeedbackType =
  | 'helpful'
  | 'wrong_location'
  | 'not_relevant'
  | 'duplicate'
  | 'stale'
  | 'other';

const timestamps = {
  now: '2026-07-26T12:00:00.000Z',
  checked: '2026-07-26T11:55:00.000Z',
  observed: '2026-07-26T11:50:00.000Z',
};

function feedItem(input: {
  id: string;
  title: string;
  family: string;
  eventType: string;
  lifecycle: 'now' | 'upcoming' | 'recently_ended';
  state: RadarState;
  severity?: string;
}) {
  return {
    id: input.id,
    propertyMatchId: input.id,
    eventId: `event-${input.id}`,
    eventType: input.eventType,
    sourceFamily: input.family,
    title: input.title,
    summary: `${input.title} may affect this property.`,
    severity: input.severity ?? 'high',
    impact: input.lifecycle === 'recently_ended' ? 'low' : 'moderate',
    confidence: 'high',
    priorityBand: input.lifecycle === 'now' ? 'high' : 'medium',
    priorityScore: input.lifecycle === 'now' ? 82 : 55,
    matchLifecycleStatus: input.lifecycle,
    sourceFreshnessStatus: 'fresh',
    sourceFreshnessReason: null,
    isSourceStale: false,
    isMaterialUpdate: input.id === 'match-weather',
    lifecycleStatus: input.lifecycle === 'recently_ended' ? 'resolved' : 'active',
    effectiveAt: input.lifecycle === 'upcoming'
      ? '2026-07-27T13:00:00.000Z'
      : '2026-07-26T10:00:00.000Z',
    expiresAt: input.lifecycle === 'recently_ended'
      ? '2026-07-26T11:00:00.000Z'
      : '2026-07-27T18:00:00.000Z',
    sourceName: input.family === 'weather' ? 'NWS Alerts' : 'Local Utility',
    provider: input.family === 'weather' ? 'National Weather Service' : 'Fixture Energy',
    userState: input.state,
  };
}

const initialItems = [
  feedItem({
    id: 'match-weather',
    title: 'Severe thunderstorm warning',
    family: 'weather',
    eventType: 'wind',
    lifecycle: 'now',
    state: 'new',
    severity: 'severe',
  }),
  feedItem({
    id: 'match-utility',
    title: 'Planned utility maintenance',
    family: 'utility',
    eventType: 'utility_outage',
    lifecycle: 'upcoming',
    state: 'saved',
  }),
  feedItem({
    id: 'match-ended',
    title: 'Freeze advisory ended',
    family: 'weather',
    eventType: 'freeze',
    lifecycle: 'recently_ended',
    state: 'seen',
    severity: 'moderate',
  }),
  feedItem({
    id: 'match-dismissed',
    title: 'Dismissed wind advisory',
    family: 'weather',
    eventType: 'wind',
    lifecycle: 'now',
    state: 'dismissed',
  }),
];

function detail(item: ReturnType<typeof feedItem>, feedback: Record<string, unknown> | null) {
  return {
    ...item,
    geography: {
      type: 'postal_code',
      countryCode: 'US',
      postalCode: '08536',
    },
    matchExplanation: {
      matcherVersion: 'acceptance-geo-v1',
      matchedAt: timestamps.observed,
      matchType: 'postal_code',
      confidence: 'high',
      homeownerExplanation: 'This property is inside the provider coverage area.',
      reasons: ['The event and property share postal code 08536.'],
      propertyFactsUsed: ['property.zipCode'],
    },
    impactSummary: 'Review the event and protect exposed areas.',
    impactFactors: {
      drivers: [{
        code: 'EXPOSED_EXTERIOR',
        effect: 'increase',
        description: 'Exposed outdoor components may need attention.',
      }],
    },
    matchedSystems: [{ type: 'roof', relevance: 'high' }],
    recommendedActions: [{
      code: 'SECURE_OUTDOOR_ITEMS',
      label: 'Secure or bring in loose outdoor items',
      priority: 'high',
      responsibilityScope: 'exteriorActions',
      responsibleParty: 'OWNER',
      applicability: 'owner_action',
      registryVersion: 'radar-actions-v1',
      completionEvidence: 'user_attestation',
      safetyClassification: 'property_protection',
      targetCapability: null,
      supportedTaskOperations: [
        'create_task',
        'create_reminder',
        'link_existing_task',
      ],
      taskLink: null,
      destination: {
        kind: 'informational',
        purpose: null,
        label: null,
        href: null,
      },
    }],
    canonicalUrl: 'https://www.weather.gov/',
    observedAt: timestamps.observed,
    revision: {
      observedAt: timestamps.observed,
      receivedAt: '2026-07-26T11:51:00.000Z',
      materialUpdatedAt: item.isMaterialUpdate ? '2026-07-26T11:52:00.000Z' : null,
    },
    sourceEvidence: {
      providerEventId: `provider-${item.eventId}`,
      providerRevision: 'revision-2',
      revisionIdentity: `revision-${item.eventId}`,
    },
    missingFacts: [],
    propertyGeographyVersion: 3,
    matcherVersion: 'acceptance-geo-v1',
    relatedIncident: null,
    relatedGuidance: null,
    userFeedback: feedback,
  };
}

function coverageFor(state: MonitoringState) {
  const weatherStatus = state === 'ACTIVE'
    ? 'covered'
    : state === 'DEGRADED'
      ? 'stale'
      : state === 'SETUP_NEEDED'
        ? 'unknown'
        : state === 'UNCOVERED'
          ? 'not_covered'
          : 'covered';
  return [
    {
      family: 'weather',
      status: weatherStatus,
      sourceDefinitionIds: ['source-weather'],
      sourceNames: ['NWS Alerts'],
      detail: weatherStatus === 'covered' ? 'Weather alerts are active.' : 'Weather monitoring is not fully active.',
      evaluatedAt: timestamps.checked,
      dataFreshThrough: weatherStatus === 'covered' ? timestamps.checked : null,
    },
    {
      family: 'utility',
      status: state === 'ACTIVE' ? 'covered' : 'not_covered',
      sourceDefinitionIds: ['source-utility'],
      sourceNames: ['Fixture Energy'],
      detail: state === 'ACTIVE' ? 'Utility monitoring is active.' : 'Utility monitoring is unavailable.',
      evaluatedAt: timestamps.checked,
      dataFreshThrough: state === 'ACTIVE' ? timestamps.checked : null,
    },
    {
      family: 'insurance',
      status: 'disabled',
      sourceDefinitionIds: ['source-insurance'],
      sourceNames: ['Insurance pilot'],
      detail: 'Insurance monitoring is not configured.',
      evaluatedAt: timestamps.checked,
      dataFreshThrough: null,
    },
  ];
}

function feedStateFor(state: MonitoringState, count: number) {
  if (count > 0) return 'HAS_EVENTS';
  if (state === 'ACTIVE') return 'CONFIRMED_CLEAR';
  if (state === 'PARTIAL') return 'PARTIAL_COVERAGE';
  if (state === 'DEGRADED') return 'DEGRADED';
  return 'UNCOVERED';
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'radar-acceptance-token',
    url: apiOrigin,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  await expect.poll(async () => (
    (await context.cookies(apiOrigin)).some((cookie) => (
      cookie.name === 'ctc.at' && cookie.value === 'radar-acceptance-token'
    ))
  )).toBe(true);
}

export async function installRadarApi(
  page: Page,
  options: {
    monitoringState?: MonitoringState;
    detailFailures?: number;
    overviewFailures?: number;
    emptyFeed?: boolean;
  } = {},
) {
  let monitoringState = options.monitoringState ?? 'ACTIVE';
  let remainingDetailFailures = options.detailFailures ?? 0;
  let remainingOverviewFailures = options.overviewFailures ?? 0;
  let emptyFeed = options.emptyFeed ?? false;
  const items = initialItems.map((item) => ({ ...item }));
  const feedbackByMatch = new Map<string, Record<string, unknown>>();
  const eventQueries: URLSearchParams[] = [];
  const stateBodies: Array<Record<string, unknown>> = [];
  const feedbackBodies: Array<Record<string, unknown>> = [];
  let detailAttempts = 0;
  let overviewAttempts = 0;

  await page.route('http://localhost:3111/acceptance/home-event-radar**', async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    const contentSecurityPolicy = headers['content-security-policy'];
    if (contentSecurityPolicy) {
      headers['content-security-policy'] = contentSecurityPolicy
        .replace(/\s*upgrade-insecure-requests;?/g, '');
    }
    await route.fulfill({ response, headers });
  });

  await page.route(`${apiOrigin}/api/csrf-token`, async (route) => {
    await fulfillJson(route, { csrfToken: 'radar-acceptance-csrf' });
  });

  await page.route(`${apiOrigin}/api/properties/${propertyId}`, async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        id: propertyId,
        address: '94 Ashford Dr',
        city: 'Plainsboro Township',
        state: 'NJ',
        zipCode: '08536',
      },
    });
  });

  await page.route(`${apiOrigin}/api/properties/${propertyId}/radar/overview`, async (route) => {
    overviewAttempts += 1;
    if (remainingOverviewFailures > 0) {
      remainingOverviewFailures -= 1;
      await fulfillJson(route, { success: false, message: 'Fixture overview failure' }, 503);
      return;
    }
    const countableItems = emptyFeed ? [] : items;
    const dismissed = countableItems.filter((item) => item.userState === 'dismissed').length;
    const saved = countableItems.filter((item) => item.userState === 'saved').length;
    const active = countableItems.filter((item) => item.matchLifecycleStatus === 'now').length;
    await fulfillJson(route, {
      success: true,
      data: {
        propertyId,
        generatedAt: timestamps.now,
        monitoringState,
        lastSuccessfulCheckAt: monitoringState === 'SETUP_NEEDED' ? null : timestamps.checked,
        coverage: coverageFor(monitoringState),
        counts: {
          active,
          new: countableItems.filter((item) => item.userState === 'new').length,
          upcoming: countableItems.filter((item) => item.matchLifecycleStatus === 'upcoming').length,
          recentlyEnded: countableItems.filter((item) => item.matchLifecycleStatus === 'recently_ended').length,
          saved,
          dismissed,
        },
        propertyContext: {
          propertyId,
          contextVersion: 'acceptance-context-v3',
          isStale: false,
          decision: {
            status: 'APPLICABLE',
            reasonCodes: ['PROPERTY_CONTEXT_READY'],
            usedFactKeys: ['location.zipCode'],
            missingFactKeys: [],
            conflictedFactKeys: [],
            validUntil: null,
            correctionPaths: [],
          },
        },
      },
    });
  });

  await page.route(`${apiOrigin}/api/properties/${propertyId}/radar/events**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const suffix = url.pathname.slice(
      `/api/properties/${propertyId}/radar/events`.length,
    );
    const match = suffix.match(/^\/([^/]+)$/);
    const stateMatch = suffix.match(/^\/([^/]+)\/state$/);
    const feedbackMatch = suffix.match(/^\/([^/]+)\/feedback$/);

    if (request.method() === 'GET' && match) {
      detailAttempts += 1;
      if (remainingDetailFailures > 0) {
        remainingDetailFailures -= 1;
        await fulfillJson(route, { success: false, message: 'Fixture detail failure' }, 503);
        return;
      }
      const item = items.find((candidate) => candidate.propertyMatchId === match[1]);
      if (!item) {
        await fulfillJson(route, { success: false, message: 'Radar match not found' }, 404);
        return;
      }
      await fulfillJson(route, {
        success: true,
        data: detail(item, feedbackByMatch.get(item.propertyMatchId) ?? null),
      });
      return;
    }

    if (request.method() === 'PATCH' && stateMatch) {
      expect(request.headers()['x-csrf-token']).toBe('radar-acceptance-csrf');
      const body = request.postDataJSON() as Record<string, unknown>;
      stateBodies.push(body);
      const item = items.find((candidate) => candidate.propertyMatchId === stateMatch[1]);
      if (!item) {
        await fulfillJson(route, { success: false, message: 'Radar match not found' }, 404);
        return;
      }
      item.userState = body.state as RadarState;
      await fulfillJson(route, {
        success: true,
        data: {
          state: {
            id: `state-${item.propertyMatchId}`,
            propertyRadarMatchId: item.propertyMatchId,
            state: item.userState,
            createdAt: timestamps.observed,
            updatedAt: timestamps.now,
          },
        },
      });
      return;
    }

    if (request.method() === 'POST' && feedbackMatch) {
      expect(request.headers()['x-csrf-token']).toBe('radar-acceptance-csrf');
      const body = request.postDataJSON() as {
        feedbackType: FeedbackType;
        comment: string | null;
      };
      feedbackBodies.push(body);
      const feedback = {
        feedbackType: body.feedbackType,
        comment: body.comment,
        createdAt: timestamps.now,
        updatedAt: timestamps.now,
      };
      feedbackByMatch.set(feedbackMatch[1], feedback);
      await fulfillJson(route, { success: true, data: { feedback } });
      return;
    }

    if (request.method() === 'GET' && suffix === '') {
      eventQueries.push(new URLSearchParams(url.searchParams));
      const lifecycle = url.searchParams.get('lifecycle');
      const family = url.searchParams.get('sourceFamily');
      const allowedStates = url.searchParams.get('state')?.split(',') ?? null;
      let filtered = (emptyFeed ? [] : items).filter((item) => (
        (!lifecycle || item.matchLifecycleStatus === lifecycle)
        && (!family || item.sourceFamily === family)
        && (!allowedStates || allowedStates.includes(item.userState))
      ));
      const cursor = url.searchParams.get('cursor');
      const pageItems = cursor ? filtered.slice(2) : filtered.slice(0, 2);
      filtered = filtered.slice();
      await fulfillJson(route, {
        success: true,
        data: {
          propertyId,
          items: pageItems,
          pageInfo: {
            hasNextPage: !cursor && filtered.length > 2,
            endCursor: !cursor && filtered.length > 2 ? 'acceptance-cursor-2' : null,
          },
          totalCount: filtered.length,
          appliedFilters: {
            lifecycle: lifecycle ? [lifecycle] : [],
            sourceFamily: family ? [family] : [],
            severity: [],
            impact: [],
            confidence: [],
            state: allowedStates ?? [],
            attention: [],
          },
          feedState: feedStateFor(monitoringState, filtered.length),
          asOf: timestamps.now,
        },
      });
      return;
    }

    await fulfillJson(route, { success: false, message: 'Unhandled Radar fixture route' }, 501);
  });

  await page.route(
    `${apiOrigin}/api/properties/${propertyId}/radar/analytics-events`,
    async (route) => {
      await fulfillJson(route, { success: true, data: { recorded: true } });
    },
  );

  return {
    eventQueries,
    feedbackBodies,
    stateBodies,
    detailAttempts: () => detailAttempts,
    overviewAttempts: () => overviewAttempts,
    setMonitoringState: (value: MonitoringState) => {
      monitoringState = value;
    },
    failNextDetails: (count: number) => {
      remainingDetailFailures = count;
    },
    failNextOverview: (count: number) => {
      remainingOverviewFailures = count;
    },
    setEmptyFeed: (value: boolean) => {
      emptyFeed = value;
    },
  };
}
