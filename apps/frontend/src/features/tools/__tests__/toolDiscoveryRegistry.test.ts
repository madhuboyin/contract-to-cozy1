import {
  canonicalizeDiscoverableToolId,
  evaluateToolReadiness,
  getDiscoverableTool,
  getDiscoverableTools,
  TOOL_OUTCOME_CATEGORIES,
} from '../toolDiscoveryRegistry';

describe('toolDiscoveryRegistry', () => {
  it('combines the Home and AI catalogs without duplicate entries', () => {
    const tools = getDiscoverableTools();
    const ids = tools.map((tool) => tool.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('coverage-options');
    expect(ids).toContain('replace-repair');
    expect(ids).not.toContain('view-all');
  });

  it('keeps workflow-only utilities out of general discovery', () => {
    expect(getDiscoverableTools().map((tool) => tool.id)).not.toContain('quote-comparison');
    expect(getDiscoverableTools({ includeWorkflowOnly: true }).map((tool) => tool.id)).toContain('quote-comparison');
  });

  it('assigns every discoverable tool to a homeowner outcome', () => {
    const categories = new Set(TOOL_OUTCOME_CATEGORIES.map((category) => category.key));
    expect(getDiscoverableTools().every((tool) => categories.has(tool.outcomeCategory))).toBe(true);
  });

  it('assigns every discoverable tool a release gate and completion contract', () => {
    const tools = getDiscoverableTools({ includeWorkflowOnly: true, includeUnavailable: true });
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => Boolean(tool.rolloutKey))).toBe(true);
    expect(tools.every((tool) => Boolean(tool.completionKind))).toBe(true);
  });

  it('normalizes legacy workflow instrumentation to canonical tool IDs', () => {
    expect(canonicalizeDiscoverableToolId('do-nothing')).toBe('do-nothing-simulator');
    expect(canonicalizeDiscoverableToolId('hoa')).toBe('hoa-compliance');
    expect(canonicalizeDiscoverableToolId('maintenance')).toBeNull();
  });

  it('enforces explicit disablement and rollout cohorts only when configured', () => {
    const coverage = getDiscoverableTool('coverage-options')!;
    const eventRadar = getDiscoverableTool('home-event-radar')!;
    const availability = {
      enabled: true,
      enforceReleaseGates: true,
      disabledToolIds: ['coverage-options'],
      rollouts: {
        HOME_EVENT_RADAR: { enabled: false, cohort: 'BETA' as const, rolloutPct: 25 },
      },
      generatedAt: '2026-07-20T00:00:00.000Z',
    };

    expect(getDiscoverableTools({ availability }).map((tool) => tool.id)).not.toContain(coverage.id);
    expect(getDiscoverableTools({ availability }).map((tool) => tool.id)).not.toContain(eventRadar.id);
  });

  it('preserves safe recommendation context in property-aware links', () => {
    const tool = getDiscoverableTool('coverage-options')!;
    const href = tool.buildHref('property-1', {
      launchSurface: 'unified_home',
      sourceActionId: 'action-1',
      sourceEntityId: 'furnace-1',
      contextVersion: 'context-v2',
      recommendationReason: 'COVERAGE_GAPS_PRESENT',
      recommendationVersion: 'capability-recommendation-v1',
    });

    expect(href).toContain('/dashboard/properties/property-1/tools/coverage-options');
    expect(href).toContain('launchSurface=unified_home');
    expect(href).toContain('sourceActionId=action-1');
    expect(href).toContain('sourceEntityId=furnace-1');
    expect(href).toContain('contextVersion=context-v2');
    expect(href).toContain('recommendationReason=COVERAGE_GAPS_PRESENT');
    expect(href).toContain('recommendationVersion=capability-recommendation-v1');
  });

  it('reports missing inputs without hiding a released tool', () => {
    const tool = getDiscoverableTool('capital-timeline')!;
    expect(evaluateToolReadiness(tool, { propertyId: 'property-1', trackedSystems: 0 })).toEqual({
      state: 'NEEDS_CONTEXT',
      reasons: ['Add at least one home system.'],
    });
  });
});
