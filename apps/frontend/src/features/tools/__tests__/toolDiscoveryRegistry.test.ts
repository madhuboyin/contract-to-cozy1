import { getDiscoverableTools, TOOL_OUTCOME_CATEGORIES } from '../toolDiscoveryRegistry';

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
});
