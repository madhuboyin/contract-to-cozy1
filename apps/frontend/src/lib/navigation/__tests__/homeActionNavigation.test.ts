import { resolveHomeActionPrimaryHref } from '../homeActionNavigation';
import type { RankedHomeActionDTO } from '@/types';

function action(overrides: Partial<RankedHomeActionDTO> = {}): RankedHomeActionDTO {
  return {
    id: 'system:risk:hvac',
    lineageId: 'risk:property-1:hvac',
    priority: 'SOON',
    state: 'OPEN',
    job: 'STAY_AHEAD',
    signal: 'Schedule service for HVAC Furnace',
    whyItMatters: 'Routine maintenance is recommended soon.',
    recommendedAction: 'Schedule service for HVAC Furnace',
    expectedOutcome: 'Service is scheduled.',
    timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Soon.' },
    evidence: [{ id: 'hvac', label: 'HVAC Furnace', source: 'Risk assessment', freshness: 'CURRENT', confidence: 0.9 }],
    assumptions: [],
    confidence: { score: 0.9, label: 'HIGH', missing: [] },
    primaryCta: { label: 'Schedule Service', href: '/dashboard/properties/property-1/fix' },
    secondaryCtas: [],
    source: { kind: 'SYSTEM', entityId: 'risk-hvac', version: 'phase2-v1' },
    governance: { safetyTier: 'LOW_CONSEQUENCE' },
    feedbackControls: ['COMPLETE'],
    ranking: {
      rank: 1,
      score: 50,
      explanation: 'Time-sensitive',
      components: {
        consequence: 12,
        urgency: 22,
        confidence: 9,
        householdRelevance: 8,
        actionability: 8,
        missingContextPenalty: 0,
      },
    },
    deduplication: { canonicalKey: 'signal:hvac', mergedActionIds: [] },
    ...overrides,
  };
}

describe('resolveHomeActionPrimaryHref', () => {
  it('replaces a legacy Fix destination with contextual HVAC provider search', () => {
    expect(resolveHomeActionPrimaryHref(action(), 'property-1')).toBe(
      '/dashboard/providers?propertyId=property-1&category=HVAC&serviceLabel=HVAC+Furnace&intent=service-booking&from=home-action&actionKey=risk%3Aproperty-1%3Ahvac',
    );
  });

  it('maps water-heater service to plumbing', () => {
    const href = resolveHomeActionPrimaryHref(action({
      signal: 'Schedule service for Water Heater',
      recommendedAction: 'Schedule service for Water Heater',
      evidence: [{ id: 'water', label: 'Water Heater', source: 'Risk assessment', freshness: 'CURRENT', confidence: 0.9 }],
    }), 'property-1');

    expect(href).toContain('category=PLUMBING');
    expect(href).toContain('serviceLabel=Water+Heater');
  });

  it('preserves a provider destination that already contains richer context', () => {
    const href = '/dashboard/providers?propertyId=property-1&category=HVAC&itemId=item-1';
    expect(resolveHomeActionPrimaryHref(action({ primaryCta: { label: 'Schedule Service', href } }), 'property-1')).toBe(href);
  });

  it('does not bypass safety escalation destinations', () => {
    const safetyHref = '/dashboard/properties/property-1/fix?mode=emergency';
    expect(resolveHomeActionPrimaryHref(action({
      governance: { safetyTier: 'SAFETY_EMERGENCY' },
      primaryCta: { label: 'Schedule Service', href: safetyHref },
    }), 'property-1')).toBe(safetyHref);
  });

  it('does not rewrite unrelated actions', () => {
    const href = '/dashboard/properties/property-1/inventory';
    expect(resolveHomeActionPrimaryHref(action({
      recommendedAction: 'Review HVAC Furnace',
      primaryCta: { label: 'Review item', href },
    }), 'property-1')).toBe(href);
  });
});
