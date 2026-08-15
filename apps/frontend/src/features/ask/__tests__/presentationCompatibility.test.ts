import { canCorrectHomeInformation, formatLegacyAskCurrency, formatLegacyAskMaintenanceItem, workflowProgressStatusLabel } from '../presentationCompatibility';

describe('saved Ask response presentation compatibility', () => {
  it('converts legacy integer-cent sentences to USD', () => {
    expect(formatLegacyAskCurrency('Estimated replacement cost: 120000 cents.')).toBe('Estimated replacement cost: $1,200.');
    expect(formatLegacyAskCurrency('Estimated next repair cost: 56160 cents.')).toBe('Estimated next repair cost: $561.60.');
  });

  it('humanizes legacy maintenance titles, descriptions, and metadata', () => {
    expect(formatLegacyAskMaintenanceItem({
      title: 'HIGH Risk: SAFETY_SMOKE_CO_DETECTORS',
      description: 'Add Home Warranty',
      meta: ['SAFETY_SMOKE_CO_DETECTORS', 'high priority'],
    })).toEqual({
      title: 'Smoke & CO Detector Check',
      description: 'Review coverage options for Smoke & CO Detector Check.',
      meta: ['Smoke & CO Detector Check', 'high priority'],
    });
  });
});

describe('workflow presentation compatibility', () => {
  it('describes completed create workflows as created', () => {
    expect(workflowProgressStatusLabel('Maintenance task created', 'COMPLETED')).toBe('CREATED');
    expect(workflowProgressStatusLabel('Maintenance task completed', 'COMPLETED')).toBe('COMPLETED');
  });

  it('does not offer home-record correction for command results', () => {
    expect(canCorrectHomeInformation('COMMAND')).toBe(false);
    expect(canCorrectHomeInformation('GUIDANCE')).toBe(true);
  });
});
