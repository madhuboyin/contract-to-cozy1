import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RadarCanonicalDetail, RadarCanonicalFeedItem } from '@/types';
import { api } from '@/lib/api/client';
import { formatRadarGeography, RadarDetailSheet } from '../RadarDetailSheet';

jest.mock('@/lib/api/client', () => ({
  api: {
    getRadarEventDetail: jest.fn(),
    trackHomeEventRadarEvent: jest.fn().mockResolvedValue(undefined),
    updateRadarMatchState: jest.fn().mockResolvedValue(undefined),
    submitRadarMatchFeedback: jest.fn().mockResolvedValue({
      feedbackType: 'wrong_location',
      comment: 'The alert is for another county.',
      createdAt: '2026-07-26T12:00:00.000Z',
      updatedAt: '2026-07-26T12:00:00.000Z',
    }),
    createOrLinkRadarTask: jest.fn().mockResolvedValue({
      deduped: false,
      link: {
        id: 'link-1',
        actionCode: 'SECURE_OUTDOOR_ITEMS',
        operation: 'create_task',
        dueAt: '2026-07-26T18:00:00.000Z',
        dueDateSource: 'event_effective',
        task: {
          id: 'task-1',
          title: 'Secure loose items',
          status: 'PENDING',
          nextDueDate: '2026-07-26T18:00:00.000Z',
          assignedToUserId: null,
          href: '/dashboard/maintenance?taskId=task-1',
        },
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
    }),
    getRadarTaskCandidates: jest.fn().mockResolvedValue([]),
    listHouseholdMembers: jest.fn().mockResolvedValue([]),
  },
}));

const item: RadarCanonicalFeedItem = {
  id: 'match-1',
  propertyMatchId: 'match-1',
  eventId: 'event-1',
  eventType: 'wind',
  sourceFamily: 'weather',
  title: 'Wind advisory',
  summary: 'Strong wind is expected.',
  severity: 'severe',
  impact: 'low',
  confidence: 'medium',
  priorityBand: 'high',
  priorityScore: 72,
  matchLifecycleStatus: 'now',
  sourceFreshnessStatus: 'fresh',
  sourceFreshnessReason: null,
  isSourceStale: false,
  isMaterialUpdate: true,
  lifecycleStatus: 'updated',
  effectiveAt: '2026-07-26T14:00:00.000Z',
  expiresAt: '2026-07-26T20:00:00.000Z',
  sourceName: 'NWS',
  provider: 'National Weather Service',
  userState: 'seen',
};

const detail: RadarCanonicalDetail = {
  ...item,
  geography: { type: 'postal_code', countryCode: 'US', postalCode: '08536' },
  matchExplanation: {
    matcherVersion: 'geo-v1',
    matchedAt: '2026-07-26T12:00:00.000Z',
    matchType: 'postal_code',
    confidence: 'medium',
    homeownerExplanation: 'Your home is inside the advisory postal area.',
    reasons: ['The property and event share postal code 08536.'],
    propertyFactsUsed: ['property.zipCode'],
  },
  impactSummary: 'Secure loose outdoor objects.',
  impactFactors: {
    drivers: [{
      code: 'WIND',
      effect: 'increase',
      description: 'Strong wind can affect exposed roof components.',
    }],
  },
  matchedSystems: [{ type: 'roof', relevance: 'high' }],
  recommendedActions: [{
    code: 'SECURE_OUTDOOR_ITEMS',
    label: 'Secure loose items',
    priority: 'high',
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
    destination: { kind: 'informational', href: null },
  }],
  canonicalUrl: 'https://www.weather.gov/example',
  observedAt: '2026-07-26T11:30:00.000Z',
  revision: {
    observedAt: '2026-07-26T11:30:00.000Z',
    receivedAt: '2026-07-26T11:31:00.000Z',
    materialUpdatedAt: '2026-07-26T11:35:00.000Z',
  },
  sourceEvidence: {
    providerEventId: 'provider-event-1',
    providerRevision: 'revision-1',
    revisionIdentity: 'identity-1',
  },
  missingFacts: [{
    factKey: 'property.roofReplacementYear',
    reasonCode: 'ROOF_AGE_UNKNOWN',
    detail: 'Roof replacement year is missing or unverified.',
    correctionPath: '/dashboard/properties/property-1/edit',
  }],
  propertyGeographyVersion: 3,
  matcherVersion: 'geo-v1',
  relatedIncident: {
    id: 'incident-1',
    status: 'ACTIVE',
    title: 'Wind preparation',
    summary: 'Prepare exposed areas.',
    updatedAt: '2026-07-26T11:40:00.000Z',
    href: '/dashboard/properties/property-1/incidents/incident-1',
  },
  relatedGuidance: {
    id: 'journey-1',
    status: 'ACTIVE',
    currentStepKey: 'secure-items',
    updatedAt: '2026-07-26T11:42:00.000Z',
    href: '/dashboard/properties/property-1/guidance/step?journeyId=journey-1',
  },
  userFeedback: null,
};

function renderSheet(selectedItem: RadarCanonicalFeedItem = item) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RadarDetailSheet
        item={selectedItem}
        propertyId="property-1"
        onClose={jest.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RadarDetailSheet', () => {
  it('renders canonical source, timing, match, impact, action, and resolution evidence', async () => {
    jest.mocked(api.getRadarEventDetail).mockResolvedValue(detail);
    renderSheet();

    expect(await screen.findByText('Official event details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open official source/i })).toHaveAttribute(
      'href',
      'https://www.weather.gov/example',
    );
    expect(screen.getByText('Your home is inside the advisory postal area.')).toBeInTheDocument();
    expect(screen.getByText('Strong wind can affect exposed roof components.')).toBeInTheDocument();
    expect(screen.getByText('Roof replacement year is missing or unverified.')).toBeInTheDocument();
    expect(screen.getByText('Roof · high')).toBeInTheDocument();
    expect(screen.getByText('Secure loose items')).toBeInTheDocument();
    expect(screen.getByText('Informational recommendation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wind preparation/i })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1/incidents/incident-1',
    );
    expect(screen.getByRole('link', { name: /Open guidance/i })).toBeInTheDocument();
  });

  it('renders only the destination behavior declared by the action registry', async () => {
    jest.mocked(api.getRadarEventDetail).mockResolvedValue({
      ...detail,
      recommendedActions: [
        {
          ...detail.recommendedActions[0],
          code: 'GET_QUOTES',
          label: 'Compare reviewed coverage options',
          completionEvidence: 'downstream_capability',
          safetyClassification: 'financial_review',
          targetCapability: 'coverage-options',
          destination: {
            kind: 'internal',
            href: '/dashboard/properties/property-1/tools/coverage-options?radarMatchId=match-1',
          },
        },
        {
          ...detail.recommendedActions[0],
          code: 'MONITOR_SITUATION',
          label: 'Monitor official updates',
          completionEvidence: 'official_source_view',
          safetyClassification: 'official_instruction',
          targetCapability: null,
          destination: {
            kind: 'external',
            href: 'https://alerts.weather.gov/example',
          },
        },
      ],
    });
    renderSheet();

    expect(await screen.findByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1/tools/coverage-options?radarMatchId=match-1',
    );
    expect(screen.getByRole('link', { name: /Open official instructions/i })).toHaveAttribute(
      'href',
      'https://alerts.weather.gov/example',
    );
    expect(screen.getByRole('link', { name: /Open official instructions/i })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('creates a maintenance task from a reviewed Radar action', async () => {
    jest.mocked(api.getRadarEventDetail).mockResolvedValue(detail);
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: 'Plan this action' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    await waitFor(() => expect(api.createOrLinkRadarTask).toHaveBeenCalledWith(
      'property-1',
      'match-1',
      'SECURE_OUTDOOR_ITEMS',
      { operation: 'create_task', dueAt: null, assigneeUserId: null },
    ));
  });

  it('loads active maintenance tasks and links the selected task', async () => {
    jest.mocked(api.getRadarEventDetail).mockResolvedValue(detail);
    jest.mocked(api.getRadarTaskCandidates).mockResolvedValue([{
      id: 'existing-task',
      title: 'Inspect roof',
      status: 'PENDING',
      priority: 'MEDIUM',
      nextDueDate: null,
      assignedToUserId: null,
    }]);
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: 'Plan this action' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link existing' }));
    fireEvent.change(await screen.findByLabelText('Existing maintenance task'), {
      target: { value: 'existing-task' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link selected task' }));

    await waitFor(() => expect(api.createOrLinkRadarTask).toHaveBeenCalledWith(
      'property-1',
      'match-1',
      'SECURE_OUTDOOR_ITEMS',
      {
        operation: 'link_existing_task',
        maintenanceTaskId: 'existing-task',
        assigneeUserId: null,
      },
    ));
  });

  it('keeps detail failures explicit and offers retry', async () => {
    jest.mocked(api.getRadarEventDetail).mockRejectedValue(new Error('offline'));
    renderSheet();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load event details');
    fireEvent.click(screen.getByRole('button', { name: 'Retry details' }));
    await waitFor(() => expect(jest.mocked(api.getRadarEventDetail).mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('restores a dismissed event through the persisted state endpoint', async () => {
    const dismissedItem = { ...item, userState: 'dismissed' as const };
    jest.mocked(api.getRadarEventDetail).mockResolvedValue({
      ...detail,
      userState: 'dismissed',
    });
    renderSheet(dismissedItem);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.updateRadarMatchState).toHaveBeenCalledWith(
      'property-1',
      'match-1',
      'seen',
      {
        guidanceJourneyId: undefined,
        guidanceStepKey: undefined,
        guidanceSignalIntentFamily: undefined,
      },
    ));
  });

  it('persists seen state when a new event is opened directly', async () => {
    const newItem = { ...item, userState: 'new' as const };
    jest.mocked(api.getRadarEventDetail).mockResolvedValue({
      ...detail,
      userState: 'new',
    });
    renderSheet(newItem);

    await waitFor(() => expect(api.updateRadarMatchState).toHaveBeenCalledWith(
      'property-1',
      'match-1',
      'seen',
      {
        guidanceJourneyId: undefined,
        guidanceStepKey: undefined,
        guidanceSignalIntentFamily: undefined,
      },
    ));
  });

  it('submits a bounded structured feedback reason with an optional comment', async () => {
    jest.mocked(api.getRadarEventDetail).mockResolvedValue(detail);
    renderSheet();

    fireEvent.click(await screen.findByRole('radio', { name: 'Wrong location' }));
    fireEvent.change(screen.getByLabelText('Comment (optional)'), {
      target: { value: 'The alert is for another county.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save feedback' }));

    await waitFor(() => expect(api.submitRadarMatchFeedback).toHaveBeenCalledWith(
      'property-1',
      'match-1',
      'wrong_location',
      'The alert is for another county.',
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Feedback saved');
  });
});

describe('formatRadarGeography', () => {
  it('explains postal, radius, polygon, and missing geography without raw provider data', () => {
    expect(formatRadarGeography({
      type: 'postal_code',
      countryCode: 'US',
      postalCode: '08536',
    })).toBe('Matched to postal code 08536.');
    expect(formatRadarGeography({
      type: 'radius',
      center: { latitude: 40.3, longitude: -74.5 },
      radiusMeters: 16_093.44,
    })).toContain('10 mile');
    expect(formatRadarGeography({
      type: 'polygon',
      geoJson: { type: 'Polygon' },
    })).toContain('inside the provider-defined event area');
    expect(formatRadarGeography(null)).toContain('did not supply');
  });
});
