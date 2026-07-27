import {
  formatRadarLastCheck,
  getRadarEmptyStateCopy,
  getRadarReadinessPresentation,
  isRadarFamilyFilterAvailable,
  RADAR_COVERAGE_LABELS,
  RADAR_MONITORING_PRESENTATION,
} from '../radarAvailabilityCopy';

describe('Home Event Radar coverage-aware copy', () => {
  it('uses confirmed-clear copy only for active monitoring', () => {
    const copy = getRadarEmptyStateCopy({
      filtered: false,
      monitoringState: 'ACTIVE',
      feedState: 'CONFIRMED_CLEAR',
    });

    expect(copy.title).toBe('No active events detected');
    expect(copy.description).toContain('sources currently covering this home');
  });

  it.each([
    ['PARTIAL', 'PARTIAL_COVERAGE'],
    ['DEGRADED', 'DEGRADED'],
    ['UNCOVERED', 'UNCOVERED'],
  ] as const)('never turns %s into an all-clear', (monitoringState, feedState) => {
    const copy = getRadarEmptyStateCopy({ filtered: false, monitoringState, feedState });
    expect(copy.description).toMatch(/not (a complete all-clear|confirmation|evidence)/);
  });

  it('presents every monitoring and coverage state explicitly', () => {
    expect(RADAR_MONITORING_PRESENTATION.SETUP_NEEDED.label).toBe('Setup needed');
    expect(RADAR_MONITORING_PRESENTATION.DEGRADED.description).toContain('stale or failing');
    expect(RADAR_COVERAGE_LABELS.not_covered).toBe('Not available here');
    expect(RADAR_COVERAGE_LABELS.disabled).toBe('Coming later');
    expect(isRadarFamilyFilterAvailable('not_covered')).toBe(false);
    expect(isRadarFamilyFilterAvailable('stale')).toBe(true);
  });

  it('does not call a state clear when events are hidden from the current view', () => {
    const copy = getRadarEmptyStateCopy({
      filtered: false,
      monitoringState: 'ACTIVE',
      feedState: 'HAS_EVENTS',
    });
    expect(copy.title).toBe('No current events to review');
    expect(copy.description).toContain('dismissed or filtered');
  });

  it('formats last-success freshness without inventing a timestamp', () => {
    const now = new Date('2026-07-26T12:00:00.000Z');
    expect(formatRadarLastCheck(null, now)).toBe('No successful check recorded');
    expect(formatRadarLastCheck('2026-07-26T11:45:00.000Z', now)).toBe(
      'Last successful check 15 min ago',
    );
  });

  it('names the exact homeowner-correctable location requirements', () => {
    const copy = getRadarReadinessPresentation({
      monitoringState: 'SETUP_NEEDED',
      readiness: {
        state: 'PROPERTY_SETUP_REQUIRED',
        reasonCode: 'PROPERTY_LOCATION_INCOMPLETE',
        missingLocationFields: ['state', 'postal_or_locality'],
      },
    });

    expect(copy?.title).toBe('Help Radar locate this home');
    expect(copy?.description).toContain('state and ZIP code or city/county');
    expect(copy?.action).toBe('edit_property');
    expect(copy?.actionLabel).toBe('Update home address');
  });

  it('does not blame homeowner setup when the first coverage check is missing', () => {
    const copy = getRadarReadinessPresentation({
      monitoringState: 'UNCOVERED',
      readiness: {
        state: 'MONITORING_NOT_INITIALIZED',
        reasonCode: 'COVERAGE_EVALUATION_NOT_RECORDED',
        missingLocationFields: [],
      },
    });

    expect(copy?.title).toBe('We’re setting up monitoring');
    expect(copy?.description).toContain('No action is needed right now');
    expect(copy?.action).toBe('retry');
    expect(copy?.actionLabel).toBe('Refresh status');
  });
});
