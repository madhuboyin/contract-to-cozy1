import {
  MOBILE_HOME_TOOL_GROUPS,
  MOBILE_HOME_TOOL_LINKS,
} from '../mobileToolCatalog';

describe('mobileToolCatalog home tool links', () => {
  it('has a unique key for every tool', () => {
    const keys = MOBILE_HOME_TOOL_LINKS.map((tool) => tool.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('assigns every tool to a defined group', () => {
    const groupKeys = new Set(MOBILE_HOME_TOOL_GROUPS.map((group) => group.key));
    for (const tool of MOBILE_HOME_TOOL_LINKS) {
      expect(groupKeys).toContain(tool.group);
    }
  });

  it('surfaces every non-workflow tool through the grouped tool pages', () => {
    const surfacedKeys = MOBILE_HOME_TOOL_GROUPS.flatMap((group) =>
      MOBILE_HOME_TOOL_LINKS.filter((tool) => tool.group === group.key && !tool.workflowOnly).map(
        (tool) => tool.key
      )
    );
    const expectedKeys = MOBILE_HOME_TOOL_LINKS.filter((tool) => !tool.workflowOnly).map(
      (tool) => tool.key
    );
    expect(surfacedKeys.sort()).toEqual(expectedKeys.sort());
  });

  it('has no group without at least one visible tool', () => {
    for (const group of MOBILE_HOME_TOOL_GROUPS) {
      const visible = MOBILE_HOME_TOOL_LINKS.filter(
        (tool) => tool.group === group.key && !tool.workflowOnly
      );
      expect(visible.length).toBeGreaterThan(0);
    }
  });
});
