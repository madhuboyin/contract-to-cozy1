import {
  buildGuidanceOverviewHref,
  normalizeGuidanceOverviewSearchParams,
} from '@/lib/navigation/guidanceOverviewHref';

describe('normalizeGuidanceOverviewSearchParams', () => {
  test('promotes guidance aliases to canonical journey params', () => {
    const input = new URLSearchParams(
      'guidanceJourneyId=journey-7&guidanceStepKey=select_cleaning_type'
    );

    const normalized = normalizeGuidanceOverviewSearchParams(input);

    expect(normalized.get('journeyId')).toBe('journey-7');
    expect(normalized.get('stepKey')).toBe('select_cleaning_type');
    expect(normalized.get('guidanceJourneyId')).toBeNull();
    expect(normalized.get('guidanceStepKey')).toBeNull();
  });

  test('keeps canonical values when both canonical and alias params exist', () => {
    const input = new URLSearchParams(
      'journeyId=journey-1&stepKey=book_cleaning_provider&guidanceJourneyId=journey-7&guidanceStepKey=select_cleaning_type'
    );

    const normalized = normalizeGuidanceOverviewSearchParams(input);

    expect(normalized.get('journeyId')).toBe('journey-1');
    expect(normalized.get('stepKey')).toBe('book_cleaning_provider');
    expect(normalized.get('guidanceJourneyId')).toBeNull();
    expect(normalized.get('guidanceStepKey')).toBeNull();
  });
});

describe('buildGuidanceOverviewHref', () => {
  test('builds canonical pinned-journey guidance overview links', () => {
    const href = buildGuidanceOverviewHref({
      propertyId: 'property-1',
      journeyId: 'journey-1',
      stepKey: 'select_cleaning_type',
      issueType: 'get_quotes',
    });

    expect(href).toBe(
      '/dashboard/properties/property-1/tools/guidance-overview?journeyId=journey-1&stepKey=select_cleaning_type&issueType=get_quotes'
    );
  });
});
