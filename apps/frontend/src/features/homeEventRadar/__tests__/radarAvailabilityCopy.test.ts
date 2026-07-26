import {
  formatRadarLastCheck,
  getRadarEmptyStateCopy,
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
});
