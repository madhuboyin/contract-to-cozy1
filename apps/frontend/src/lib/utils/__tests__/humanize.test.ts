import humanizeActionType from '../humanize';

describe('humanizeActionType', () => {
  it('returns known mapped labels', () => {
    expect(humanizeActionType('ROOF_SHINGLE')).toBe('Roof Shingle Inspection');
    expect(humanizeActionType('WATER_HEATER_TANK')).toBe('Water Heater Tank Service');
    expect(humanizeActionType('SAFETY_SMOKE_CO_DETECTOR')).toBe('Smoke & CO Detector Check');
  });

  it('falls back gracefully for unknown enum keys', () => {
    expect(humanizeActionType('UNKNOWN_TYPE')).toBe('Unknown Type');
    expect(humanizeActionType('custom_unknown_value')).toBe('Custom Unknown Value');
  });

  it('handles truncated enum keys', () => {
    expect(humanizeActionType('SAFETY_SMOKE_CO_DETECTO...')).toBe('Smoke & CO Detector Check');
  });

  it('returns safe fallback for empty/null/undefined', () => {
    expect(humanizeActionType('')).toBe('—');
    expect(humanizeActionType(undefined)).toBe('—');
    expect(humanizeActionType(null)).toBe('—');
  });
});
