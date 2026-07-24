import {
  appendCapabilityLaunchContext,
  capabilityCatalogSource,
  capabilitySearchTerms,
  evaluateCapabilityReadiness,
} from '../capabilityCatalog';
import type { CapabilityCatalogItem } from '../capabilityTypes';

const materialSpecs: CapabilityCatalogItem = {
  id: 'material-specs',
  version: 1,
  label: 'Material Specs',
  shortDescription: 'Record finishes and products.',
  longDescription: 'Create a durable record of paint, flooring, finishes, and suppliers.',
  iconName: 'layers',
  outcomeCategory: 'UNDERSTAND_HOME',
  primaryJob: 'STAY_AHEAD',
  primaryDestination: 'HOME_RECORD',
  intentAliases: ['what paint did I use', 'match a repair finish'],
  supportedContext: ['PROPERTY', 'PROJECT', 'ROOM'],
  readinessRequirements: [
    { kind: 'PROPERTY', reason: 'Select a property first.' },
    {
      kind: 'SOURCE_CONTEXT',
      contextType: 'PROJECT',
      reason: 'Choose a project, room, or repair context.',
    },
  ],
  expectedOutput: 'A durable material record.',
  routeTemplate: '/dashboard/properties/[id]/materials',
  href: '/dashboard/properties/property-1/materials',
  workflowOnly: false,
  releaseStage: 'ACTIVE',
  badges: [],
};

describe('canonical capability catalog helpers', () => {
  it('indexes homeowner language, descriptions, outcome, job, destination, and contexts', () => {
    const terms = capabilitySearchTerms(materialSpecs).join(' ').toLowerCase();
    expect(terms).toContain('what paint did i use');
    expect(terms).toContain('match a repair finish');
    expect(terms).toContain('understand home');
    expect(terms).toContain('stay ahead');
    expect(terms).toContain('home record');
    expect(terms).toContain('project');
    expect(terms).toContain('room');
  });

  it('preserves launch attribution on canonical destinations', () => {
    const href = appendCapabilityLaunchContext(materialSpecs.href, {
      launchSurface: 'explore_tools',
      sourceActionId: 'action-1',
      contextVersion: 'context-v3',
    });
    expect(href).toContain('launchSurface=explore_tools');
    expect(href).toContain('sourceActionId=action-1');
    expect(href).toContain('contextVersion=context-v3');
  });

  it('reports missing property and specialist context without hiding the capability', () => {
    expect(evaluateCapabilityReadiness(materialSpecs)).toEqual({
      state: 'NEEDS_CONTEXT',
      reasons: [
        'Select a property first.',
        'Choose a project, room, or repair context.',
      ],
    });
  });

  it('defaults to canonical and preserves the explicit legacy rollback', () => {
    const previous = process.env.NEXT_PUBLIC_CAPABILITY_CATALOG_SOURCE;
    delete process.env.NEXT_PUBLIC_CAPABILITY_CATALOG_SOURCE;
    expect(capabilityCatalogSource()).toBe('canonical');
    process.env.NEXT_PUBLIC_CAPABILITY_CATALOG_SOURCE = 'legacy';
    expect(capabilityCatalogSource()).toBe('legacy');
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CAPABILITY_CATALOG_SOURCE;
    else process.env.NEXT_PUBLIC_CAPABILITY_CATALOG_SOURCE = previous;
  });
});
