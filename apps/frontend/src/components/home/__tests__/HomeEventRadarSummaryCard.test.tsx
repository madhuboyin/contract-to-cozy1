import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { api } from '@/lib/api/client';
import {
  HomeEventRadarSummaryCard,
  radarHomeEmptyCopy,
} from '@/components/home/HomeEventRadarSummaryCard';
import type { RadarOverview } from '@/types';

jest.mock('@/lib/api/client', () => ({
  api: {
    getRadarOverview: jest.fn(),
  },
}));

const overview: RadarOverview = {
  propertyId: 'property-1',
  generatedAt: '2026-07-26T12:00:00.000Z',
  monitoringState: 'ACTIVE',
  readiness: {
    state: 'READY',
    reasonCode: null,
    missingLocationFields: [],
  },
  lastSuccessfulCheckAt: '2026-07-26T11:55:00.000Z',
  coverage: [],
  counts: {
    active: 2,
    new: 1,
    upcoming: 0,
    recentlyEnded: 0,
    saved: 0,
    dismissed: 0,
  },
  homeSummary: {
    activeMaterialEventCount: 2,
    mostUrgentMatch: {
      propertyMatchId: 'match-1',
      eventId: 'event-1',
      title: 'Severe thunderstorm warning',
      explanation: 'Exposed outdoor components may need attention.',
      sourceFamily: 'weather',
      sourceName: 'NWS Alerts',
      severity: 'severe',
      impact: 'moderate',
      confidence: 'high',
      priorityBand: 'urgent',
      effectiveAt: '2026-07-26T12:00:00.000Z',
      expiresAt: '2026-07-26T16:00:00.000Z',
      href: '/dashboard/properties/property-1/tools/home-event-radar?view=now&family=weather&matchId=match-1&launchSurface=unified_home',
    },
  },
  propertyContext: {
    propertyId: 'property-1',
    contextVersion: 'context-v1',
    decision: {
      status: 'APPLICABLE',
      reasonCodes: [],
      usedFactKeys: ['property.location'],
      missingFactKeys: [],
      conflictedFactKeys: [],
      validUntil: null,
    },
  },
};

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeEventRadarSummaryCard propertyId="property-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HomeEventRadarSummaryCard', () => {
  it('shows the active material count, explainable urgent match, and canonical deep link', async () => {
    jest.mocked(api.getRadarOverview).mockResolvedValue(overview);
    renderCard();

    expect(await screen.findByText('Severe thunderstorm warning')).toBeInTheDocument();
    expect(screen.getByText(/Stay ahead of weather, air-quality, disaster/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('events need attention')).toBeInTheDocument();
    expect(screen.getByText('Exposed outdoor components may need attention.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review event' })).toHaveAttribute(
      'href',
      expect.stringContaining('matchId=match-1'),
    );
    expect(screen.getByRole('link', { name: 'Review event' })).toHaveAttribute(
      'href',
      expect.stringContaining('launchSurface=unified_home'),
    );
  });

  it('surfaces degraded monitoring and never presents it as an all-clear', async () => {
    jest.mocked(api.getRadarOverview).mockResolvedValue({
      ...overview,
      monitoringState: 'DEGRADED',
      homeSummary: {
        activeMaterialEventCount: 0,
        mostUrgentMatch: null,
      },
    });
    renderCard();

    expect(await screen.findByText('Monitoring delayed')).toBeInTheDocument();
    expect(screen.getByText(/may not have the latest local events/i)).toBeInTheDocument();
    expect(screen.queryByText(/all clear/i)).not.toBeInTheDocument();
  });

  it('does not contradict a nonzero count when no explainable match is ready', async () => {
    jest.mocked(api.getRadarOverview).mockResolvedValue({
      ...overview,
      homeSummary: {
        activeMaterialEventCount: 1,
        mostUrgentMatch: null,
      },
    });
    renderCard();

    expect(await screen.findByText(/1 event needs attention, but the details are still loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing needs your attention/i)).not.toBeInTheDocument();
  });

  it('keeps overview failures explicit instead of fabricating a zero state', async () => {
    jest.mocked(api.getRadarOverview).mockRejectedValue(new Error('offline'));
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Radar summary is unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('not an all-clear');
  });

  it('links directly to property editing and names missing location fields', async () => {
    jest.mocked(api.getRadarOverview).mockResolvedValue({
      ...overview,
      monitoringState: 'SETUP_NEEDED',
      readiness: {
        state: 'PROPERTY_SETUP_REQUIRED',
        reasonCode: 'PROPERTY_LOCATION_INCOMPLETE',
        missingLocationFields: ['state', 'postal_or_locality'],
      },
      lastSuccessfulCheckAt: null,
      homeSummary: {
        activeMaterialEventCount: 0,
        mostUrgentMatch: null,
      },
    });
    renderCard();

    expect(await screen.findByText('Help Radar locate this home')).toBeInTheDocument();
    expect(screen.getAllByText(/state and ZIP code or city\/county/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Update home address/i })).toHaveAttribute(
      'href',
      '/dashboard/properties/property-1/edit',
    );
    expect(screen.queryByText('No successful check recorded')).not.toBeInTheDocument();
  });

  it('waits automatically when coverage initialization—not property data—is missing', async () => {
    jest.mocked(api.getRadarOverview).mockResolvedValue({
      ...overview,
      monitoringState: 'UNCOVERED',
      readiness: {
        state: 'MONITORING_NOT_INITIALIZED',
        reasonCode: 'COVERAGE_EVALUATION_NOT_RECORDED',
        missingLocationFields: [],
      },
      lastSuccessfulCheckAt: null,
      homeSummary: {
        activeMaterialEventCount: 0,
        mostUrgentMatch: null,
      },
    });
    renderCard();

    expect(await screen.findByText('We’re setting up monitoring')).toBeInTheDocument();
    expect(screen.getAllByText(/No action is needed right now/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Refresh status' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Radar monitors' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('Setup needed')).not.toBeInTheDocument();
  });
});

describe('radarHomeEmptyCopy', () => {
  it('qualifies partial, degraded, uncovered, and setup states', () => {
    expect(radarHomeEmptyCopy('PARTIAL')).toContain('Some event types are not available');
    expect(radarHomeEmptyCopy('DEGRADED')).toContain('may not have the latest');
    expect(radarHomeEmptyCopy('UNCOVERED')).toContain('not available');
    expect(radarHomeEmptyCopy('SETUP_NEEDED')).toContain('until setup is complete');
  });
});
