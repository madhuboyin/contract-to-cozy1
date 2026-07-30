import { getRenovationNextAction, type RenovationWorkspaceCase } from '../renovationWorkspace';

function renovationCase(
  lifecycle: RenovationWorkspaceCase['lifecycle'],
  overrides: Partial<RenovationWorkspaceCase> = {},
): RenovationWorkspaceCase {
  return { id: 'case-1', name: 'Kitchen remodel', lifecycle, ...overrides };
}

describe('renovation workspace next action', () => {
  it.each([
    ['IDEA', 'explore', '/requirements'],
    ['SCOPE_DEFINITION', 'scope', '/requirements'],
    ['REQUIREMENTS_RESEARCH', 'requirements', '/requirements'],
    ['APPROVALS_IN_PROGRESS', 'approvals', '/compliance'],
    ['PREPARING_TO_START', 'readiness', '/readiness'],
    ['IN_EXECUTION', 'execution', '/projects'],
    ['INSPECTION_AND_CLOSEOUT', 'closeout', '/compliance'],
  ] as const)('maps %s to one %s action', (lifecycle, stage, hrefPart) => {
    const action = getRenovationNextAction(renovationCase(lifecycle), 'property-1');
    expect(action.stage).toBe(stage);
    expect(action.href).toContain(hrefPart);
    expect(action.question).toMatch(/\?$/);
    expect(action.title).toBeTruthy();
  });

  it('makes blocking readiness work the primary action', () => {
    const action = getRenovationNextAction(renovationCase('PREPARING_TO_START', {
      readinessSummary: { state: 'NOT_READY', blockingItems: 2 },
    }), 'property-1');

    expect(action.title).toBe('Resolve 2 blocking readiness items');
    expect(action.href.endsWith('/readiness')).toBe(true);
  });

  it('routes verified completion to the durable materials record', () => {
    const action = getRenovationNextAction(renovationCase('VERIFIED_COMPLETE'), 'property-1');
    expect(action.href).toBe('/dashboard/properties/property-1/materials');
  });
});
