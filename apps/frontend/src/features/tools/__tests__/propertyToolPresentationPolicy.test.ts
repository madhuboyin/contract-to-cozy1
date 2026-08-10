import { getPropertyToolPresentations } from '../propertyToolPresentationPolicy';

describe('Property Record tool presentation policy', () => {
  it('uses deterministic registry-backed ordering and preserves section return context', () => {
    const returnTo = '/dashboard/properties/property-1#property-documents';
    const tools = getPropertyToolPresentations({
      propertyId: 'property-1',
      returnTo,
      contextVersion: 'context-v1',
      section: 'DOCUMENTS',
    });

    expect(tools.map((tool) => tool.toolId)).toEqual(['home-digital-will', 'property-brief']);
    for (const tool of tools) {
      const url = new URL(tool.href, 'https://contracttocozy.test');
      expect(url.searchParams.get('backTo')).toBe(returnTo);
      expect(url.searchParams.get('returnTo')).toBe(returnTo);
      expect(url.searchParams.get('contextVersion')).toBe('context-v1');
      expect(tool.label).toBeTruthy();
      expect(tool.releaseStage).toMatch(/ACTIVE|BETA/);
    }
  });

  it('limits the systems section to tools with a systems relationship', () => {
    const tools = getPropertyToolPresentations({
      propertyId: 'property-1',
      returnTo: '/dashboard/properties/property-1#property-systems',
      section: 'SYSTEMS',
    });
    expect(tools.map((tool) => tool.toolId)).toEqual(['capital-timeline', 'status-board']);
  });
});
