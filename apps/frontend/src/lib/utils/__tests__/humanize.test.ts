import humanizeActionType from '../humanize';

describe('humanizeActionType', () => {
  it('returns known mapped labels', () => {
    expect(humanizeActionType('ROOF_SHINGLE')).toBe('Roof Shingle Inspection');
    expect(humanizeActionType('WATER_HEATER_TANK')).toBe('Water Heater Tank Service');
    expect(humanizeActionType('SAFETY_SMOKE_CO_DETECTOR')).toBe('Smoke & CO Detector Check');
    expect(humanizeActionType('SAFETY_RECALL_SIM_TEST_BATTERY')).toBe('Battery Safety Recall Check');
    expect(humanizeActionType('SAFETY_RECALL_SIMULATION_KITCHEN')).toBe('Kitchen Appliance Safety Recall');
  });

  it('falls back gracefully for unknown enum keys', () => {
    expect(humanizeActionType('UNKNOWN_TYPE')).toBe('Unknown Type');
    expect(humanizeActionType('custom_unknown_value')).toBe('Custom Unknown Value');
  });

  it('handles truncated enum keys', () => {
    expect(humanizeActionType('SAFETY_SMOKE_CO_DETECTO...')).toBe('Smoke & CO Detector Check');
    expect(humanizeActionType('SAFETY_RECALL_SIM_TEST_BATTER...')).toBe('Battery Safety Recall Check');
  });

  it('returns safe fallback for empty/null/undefined', () => {
    expect(humanizeActionType('')).toBe('—');
    expect(humanizeActionType(undefined)).toBe('—');
    expect(humanizeActionType(null)).toBe('—');
  });
});
