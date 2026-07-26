import {
  getRadarEmptyStateCopy,
  RADAR_INTERIM_COVERAGE,
  RADAR_INTERIM_MONITORING_COPY,
} from '../radarAvailabilityCopy';

describe('Home Event Radar interim availability copy', () => {
  it('does not turn an empty feed into a no-hazard claim', () => {
    const copy = getRadarEmptyStateCopy(false);

    expect(copy.title).toBe('No Radar events available');
    expect(copy.description).toContain('does not confirm that no local hazards exist');
    expect(copy.description).toContain('Incidents');
  });

  it('states that the feed is limited to configured sources', () => {
    expect(RADAR_INTERIM_MONITORING_COPY).toContain('configured Radar sources');
    expect(RADAR_INTERIM_MONITORING_COPY).toContain('Incidents');
  });

  it('makes unsupported source families explicit', () => {
    expect(RADAR_INTERIM_COVERAGE).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'utility', status: 'Not connected' }),
        expect.objectContaining({ key: 'insurance', status: 'Not connected' }),
        expect.objectContaining({ key: 'tax', status: 'Limited' }),
      ]),
    );
  });
});
