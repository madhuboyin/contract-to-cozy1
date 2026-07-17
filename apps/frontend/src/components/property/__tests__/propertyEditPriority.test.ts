import { defaultResponsibilityParties } from '@/lib/property/propertyContextForm';
import { getPropertyEditPriorityState } from '../propertyEditPriority';

function state(responsibilities: Record<string, string>) {
  return getPropertyEditPriorityState({ responsibilities }, 'occupancy');
}

describe('property edit responsibility completeness', () => {
  test('all canonical scopes must have a known party', () => {
    const responsibilities = defaultResponsibilityParties('OWNER');
    expect(state(responsibilities).missingFields.map((field) => field.key)).not.toContain('responsibilities');

    responsibilities.ROOF = 'UNKNOWN';
    expect(state(responsibilities).missingFields.map((field) => field.key)).toContain('responsibilities');
  });

  test('mixed owner and association responsibility is complete', () => {
    const responsibilities = defaultResponsibilityParties('OWNER');
    responsibilities.ROOF = 'ASSOCIATION';
    responsibilities.BUILDING_EXTERIOR = 'ASSOCIATION';
    responsibilities.LANDSCAPING = 'SHARED';

    expect(state(responsibilities).missingFields.map((field) => field.key)).not.toContain('responsibilities');
  });

  test('responsibility recommendation targets the rendered responsibility section', () => {
    const priority = state(defaultResponsibilityParties('UNKNOWN'));
    const field = priority.missingFields.find((candidate) => candidate.key === 'responsibilities');

    expect(field?.fieldRefId).toBe('responsibility');
  });
});
