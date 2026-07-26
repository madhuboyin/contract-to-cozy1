import type { CapabilitySuggestionDTO } from '@/types';
import { appendCapabilityLaunchContext } from '../capabilityCatalog';
import {
  capabilitySuggestionLaunchContext,
  normalizeToolLaunchSurface,
  parseToolLaunchContext,
} from '../capabilitySuggestionLaunchContext';

function suggestion(
  kind: CapabilitySuggestionDTO['source']['kind'],
  overrides: Partial<CapabilitySuggestionDTO['source']> = {},
): CapabilitySuggestionDTO {
  return {
    suggestionId: `material-specs:${kind}:source-1:context-v3`,
    capabilityId: 'material-specs',
    manifestVersion: 1,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v3',
    rank: 1,
    scoreBand: 'HIGH',
    label: 'Material Specs',
    shortDescription: 'Record finishes and products.',
    iconName: 'LAYERS',
    outcomeCategory: 'UNDERSTAND_HOME',
    reasonCode: 'PROJECT_CONTEXT_PRESENT',
    whyNow: 'A project is active.',
    expectedOutcome: 'A durable material record.',
    readiness: {
      state: 'READY',
      reasonCodes: [],
      missingFactKeys: [],
      explanations: [],
    },
    evidence: {
      mode: 'STRUCTURED_ONLY',
      summary: 'Based on authorized project context.',
      sourceObservedAt: '2026-07-24T12:00:00.000Z',
      actionConfidence: null,
      contextWarningCodes: [],
    },
    source: {
      kind,
      id: 'source-1',
      actionId: 'action-1',
      journeyId: 'journey-1',
      entityType: 'INVENTORY_ITEM',
      entityId: 'item-1',
      sourceVersion: 'source-v2',
      observedAt: '2026-07-24T12:00:00.000Z',
      ...overrides,
    },
    launch: {
      label: 'Open Material Specs',
      href: '/dashboard/properties/property-1/materials',
    },
  };
}

describe('server suggestion launch context', () => {
  it.each([
    'HOME_ACTION',
    'JOURNEY',
    'PROJECT',
    'PROPERTY_CONTEXT',
    'PERSONALIZATION',
    'COMPLETION',
  ] as const)('round trips every lineage field for %s suggestions', (kind) => {
    const context = capabilitySuggestionLaunchContext(
      suggestion(kind),
      kind === 'HOME_ACTION' ? 'unified_home' : 'property_detail',
    );
    const href = appendCapabilityLaunchContext('/tool', context);
    const parsed = parseToolLaunchContext(new URL(href, 'https://contracttocozy.test').searchParams);

    expect(parsed).toEqual({
      launchSurface: kind === 'HOME_ACTION' ? 'unified_home' : 'property_detail',
      sourceActionId: 'action-1',
      sourceEntityType: 'INVENTORY_ITEM',
      sourceEntityId: 'item-1',
      contextVersion: 'context-v3',
      recommendationReason: 'PROJECT_CONTEXT_PRESENT',
      recommendationVersion: 'capability-recommendation-v1',
      journeyId: 'journey-1',
      guidanceStepKey: null,
      guidanceSignalIntentFamily: null,
      itemId: 'item-1',
      radarMatchId: null,
      radarEventId: null,
      incidentId: null,
    });
  });

  it('does not invent item context for a non-inventory entity', () => {
    const context = capabilitySuggestionLaunchContext(
      suggestion('PROJECT', { entityType: 'PROJECT', entityId: 'project-1' }),
      'property_detail',
    );

    expect(context.sourceEntityId).toBe('project-1');
    expect(context.itemId).toBeNull();
  });

  it('preserves every supported surface and safely normalizes unrecognized input', () => {
    const surfaces = [
      'unified_home',
      'property_detail',
      'explore_tools',
      'command_palette',
      'workflow',
      'guidance',
      'home_tools',
      'dashboard',
      'home_event_radar',
    ] as const;
    for (const surface of surfaces) {
      expect(normalizeToolLaunchSurface(surface)).toBe(surface);
    }
    expect(normalizeToolLaunchSurface('future_surface')).toBe('unknown');
    expect(normalizeToolLaunchSurface(null)).toBe('direct');
  });
});
