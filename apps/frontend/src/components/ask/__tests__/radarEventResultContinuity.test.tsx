import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { RadarEventResultList } from '../RadarEventResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { RadarCanonicalDetail } from '@/types';

jest.mock('@/lib/api/client', () => ({ api: { getRadarEventDetail: jest.fn() } }));
const mockedGetRadarEventDetail = api.getRadarEventDetail as jest.MockedFunction<typeof api.getRadarEventDetail>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters: [],
  description: 'This is the same canonical feed the Home Event Radar page reads, grouped by source.',
  sections: [{ id: 'radar-weather', title: 'Weather', count: 1, items: [
    { id: 'match-0', title: 'severe thunderstorm warning', entityType: 'RADAR_MATCH', meta: ['high', 'National Weather Service'], description: 'A severe thunderstorm warning is in effect.', status: 'new', href: '/dashboard/properties/home/tools/home-event-radar?matchId=match-0' },
  ] }],
  actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: '/dashboard/properties/home/tools/home-event-radar', style: 'SECONDARY' }],
};

function execution(revision = 1): AskExecutionResponse {
  return { executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-22T00:00:0${revision}.000Z`,
    viewState: { resultId: 'home-event-radar-feed-result', revision, domainScopePhrase: 'home event radar', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}

function List({ response, onAccessLost = () => {} }: { response: AskExecutionResponse; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><RadarEventResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onAccessLost={onAccessLost} link={(href, content) => <a href={href}>{content}</a>} /></ResultViewContext.Provider>;
}

function canonicalDetail(overrides: Partial<RadarCanonicalDetail> = {}): RadarCanonicalDetail {
  return {
    id: 'match-0', propertyMatchId: 'match-0', eventId: 'event-0', eventType: 'SEVERE_THUNDERSTORM_WARNING',
    sourceFamily: 'weather', title: 'severe thunderstorm warning', summary: 'A severe thunderstorm warning is in effect for this area.',
    severity: 'high', impact: 'moderate', confidence: 'high', priorityBand: 'high', priorityScore: 0.82,
    matchLifecycleStatus: 'active', sourceFreshnessStatus: 'fresh', sourceFreshnessReason: null,
    isSourceStale: false, isMaterialUpdate: false, lifecycleStatus: 'active',
    effectiveAt: '2026-09-22T12:00:00.000Z', expiresAt: '2026-09-22T18:00:00.000Z',
    sourceName: 'National Weather Service', provider: 'NOAA', userState: 'new',
    geography: null,
    matchExplanation: { matcherVersion: 'v1', matchedAt: '2026-09-22T11:00:00.000Z', matchType: 'geofence', confidence: 'high', homeownerExplanation: 'This storm cell tracks over your recorded property location.', reasons: ['Within the active warning polygon'], propertyFactsUsed: ['property.location'] },
    impactSummary: 'Expect heavy rain and possible hail through this evening.',
    impactFactors: null, matchedSystems: [],
    recommendedActions: [{
      code: 'SECURE_OUTDOOR_ITEMS', label: 'Secure outdoor furniture and loose items', priority: 'high',
      registryVersion: 'radar-actions-v1', completionEvidence: 'user_attestation', safetyClassification: 'property_protection',
      targetCapability: null, supportedTaskOperations: [], taskLink: null,
      destination: { kind: 'informational', purpose: null, label: null, href: null },
    }],
    compoundInsights: [], canonicalUrl: null, observedAt: '2026-09-22T11:00:00.000Z',
    revision: { observedAt: '2026-09-22T11:00:00.000Z', receivedAt: '2026-09-22T11:00:00.000Z', materialUpdatedAt: null },
    sourceEvidence: { providerEventId: 'nws-123', providerRevision: '1', revisionIdentity: null },
    missingFacts: [], propertyGeographyVersion: 1, matcherVersion: 'v1',
    relatedIncident: null, relatedGuidance: null,
    resolutionContinuity: { state: 'not_started', incidentState: null, guidanceState: null, continueResolution: null },
    userFeedback: null,
    ...overrides,
  };
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('Home Event Radar feed titles dispatch through the registry and open canonical detail inline', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedGetRadarEventDetail.mockResolvedValueOnce(canonicalDetail());

  render(<BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'severe thunderstorm warning' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open Home Event Radar/ })).toHaveAttribute('href', '/dashboard/properties/home/tools/home-event-radar');
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));

  await waitFor(() => expect(screen.getByText(/heavy rain and possible hail/)).toBeInTheDocument());
  expect(mockedGetRadarEventDetail).toHaveBeenCalledWith('home', 'match-0');
  expect(window.location.pathname).toBe('/dashboard/ask');
});

test('detail renders full canonical fields: severity, impact, priority, source, recommended actions, and homeowner explanation', async () => {
  mockedGetRadarEventDetail.mockResolvedValueOnce(canonicalDetail());
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(screen.getByText(/heavy rain and possible hail/)).toBeInTheDocument());

  expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(2); // severity and priority
  expect(screen.getByText('Moderate')).toBeInTheDocument();
  expect(screen.getByText(/National Weather Service.*NOAA/)).toBeInTheDocument();
  expect(screen.getByText('Secure outdoor furniture and loose items')).toBeInTheDocument();
  expect(screen.getByText(/This storm cell tracks over your recorded property location/)).toBeInTheDocument();
});

test('radar event selection persists in result view state', async () => {
  mockedGetRadarEventDetail.mockResolvedValueOnce(canonicalDetail());
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(screen.getByText(/heavy rain and possible hail/)).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'home-event-radar-feed-result')).detailTaskId).toBe('match-0');
});

test('a genuinely removed monitored event is distinct from an access-loss failure', async () => {
  mockedGetRadarEventDetail.mockRejectedValueOnce({ status: 404, payload: { success: false, error: { message: 'Radar match not found', code: 'RADAR_MATCH_NOT_FOUND' } } });
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Event no longer exists'));
});

test('property access denial redacts the whole result instead of exposing a partial radar state', async () => {
  const onAccessLost = jest.fn();
  mockedGetRadarEventDetail.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a 401 also redacts the whole result', async () => {
  const onAccessLost = jest.fn();
  mockedGetRadarEventDetail.mockRejectedValueOnce({ status: 401, payload: { message: 'Unauthorized' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
});

test('a stale source is disclosed', async () => {
  mockedGetRadarEventDetail.mockResolvedValueOnce(canonicalDetail({ isSourceStale: true, sourceFreshnessReason: 'The upstream provider has not reported in 6 hours.' }));
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(screen.getByText('The upstream provider has not reported in 6 hours.')).toBeInTheDocument());
});

test('a related incident renders a working link', async () => {
  mockedGetRadarEventDetail.mockResolvedValueOnce(canonicalDetail({
    relatedIncident: { id: 'incident-1', status: 'ACTIVE', resolutionState: 'in_progress', title: 'Roof leak investigation', summary: null, resolvedAt: null, expiredAt: null, updatedAt: '2026-09-22T11:00:00.000Z', href: '/dashboard/properties/home/incidents/incident-1' },
  }));
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'Roof leak investigation' })).toHaveAttribute('href', '/dashboard/properties/home/incidents/incident-1'));
});

test('a monitored event leaving the refreshed result clears selection without choosing a substitute', () => {
  mockedGetRadarEventDetail.mockResolvedValueOnce(canonicalDetail());
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'severe thunderstorm warning' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], count: 0, items: block.sections[0].items.filter((item) => item.id !== 'match-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'home-event-radar-feed-result')).detailTaskId).toBeNull();
});
