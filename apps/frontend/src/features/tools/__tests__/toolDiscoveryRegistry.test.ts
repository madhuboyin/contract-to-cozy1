import {
  canonicalizeDiscoverableToolId,
  getDiscoverableTool,
} from '../toolDiscoveryRegistry';

describe('toolDiscoveryRegistry', () => {
  it('normalizes legacy workflow instrumentation to canonical tool IDs', () => {
    expect(canonicalizeDiscoverableToolId('do-nothing')).toBe('do-nothing-simulator');
    expect(canonicalizeDiscoverableToolId('hoa')).toBe('hoa-compliance');
    expect(canonicalizeDiscoverableToolId('maintenance')).toBeNull();
  });

  it('maps legacy coverage tools to one canonical presentation', () => {
    expect(getDiscoverableTool('coverage-options')).toMatchObject({
      id: 'coverage-intelligence',
      label: 'Coverage & Premium Review',
    });
    expect(canonicalizeDiscoverableToolId('insurance-trend')).toBe('coverage-intelligence');
    expect(canonicalizeDiscoverableToolId('risk-premium-optimizer')).toBe('coverage-intelligence');
    expect(getDiscoverableTool('quote-comparison')).toMatchObject({
      id: 'quote-comparison',
      workflowOnly: true,
    });
  });

  it('preserves safe recommendation context in property-aware links', () => {
    const tool = getDiscoverableTool('coverage-intelligence')!;
    const href = tool.buildHref('property-1', {
      launchSurface: 'unified_home',
      sourceActionId: 'action-1',
      sourceEntityId: 'furnace-1',
      contextVersion: 'context-v2',
      recommendationReason: 'COVERAGE_GAPS_PRESENT',
      recommendationVersion: 'capability-recommendation-v1',
    });

    expect(href).toContain('/dashboard/properties/property-1/tools/coverage-intelligence');
    expect(href).toContain('launchSurface=unified_home');
    expect(href).toContain('sourceActionId=action-1');
    expect(href).toContain('sourceEntityId=furnace-1');
    expect(href).toContain('contextVersion=context-v2');
    expect(href).toContain('recommendationReason=COVERAGE_GAPS_PRESENT');
    expect(href).toContain('recommendationVersion=capability-recommendation-v1');
  });
});
