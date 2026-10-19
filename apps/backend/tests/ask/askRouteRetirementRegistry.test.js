const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join, relative, sep } = require('node:path');

require('ts-node/register');

const {
  ASK_ROUTE_RETIREMENT_REGISTRY,
  buildAskOperationInventory,
  buildHomeownerRouteInventory,
  validateAskRouteRetirementRegistry,
} = require('../../src/services/ask/governance/askRouteRetirementRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const appRoot = join(__dirname, '../../../frontend/src/app');
function pages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pages(path) : entry.name === 'page.tsx' ? [path] : [];
  });
}
function homeownerRoutes() {
  return pages(appRoot)
    .map((file) => relative(appRoot, file).split(sep).filter((part) => !/^\(.+\)$/.test(part)).slice(0, -1))
    .filter((parts) => parts[0] === 'dashboard')
    .filter((parts) => parts[1] !== 'admin' && !['analytics-admin', 'knowledge-admin', 'worker-jobs'].includes(parts[1] || ''))
    .map((parts) => `/${parts.join('/')}`);
}

test('route-retirement registry is structurally valid and retires nothing in Phase 0', () => {
  assert.deepEqual(validateAskRouteRetirementRegistry(), []);
  assert.ok(ASK_ROUTE_RETIREMENT_REGISTRY.length > 0);
  assert.equal(ASK_ROUTE_RETIREMENT_REGISTRY.some((entry) => entry.state === 'RETIRED'), false);
});

test('every current homeowner page has exactly one explicit retirement disposition', () => {
  const sourceRoutes = homeownerRoutes();
  const inventory = buildHomeownerRouteInventory(sourceRoutes);
  assert.deepEqual(inventory.issues, []);
  assert.equal(inventory.rows.length, new Set(sourceRoutes).size);
  for (const row of inventory.rows) {
    assert.ok(row.owner);
    assert.ok(row.successorDestination);
    assert.notEqual(row.state, 'RETIRED');
  }
});

test('operation inventory is generated directly from ASK_OPERATION_DEFINITIONS', () => {
  const inventory = buildAskOperationInventory();
  assert.equal(inventory.length, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.deepEqual(inventory.map((entry) => entry.operationId), Object.keys(ASK_OPERATION_DEFINITIONS).sort((left, right) => left.localeCompare(right)));
});

test('certified or retired claims without evidence fail closed', () => {
  const baseline = ASK_ROUTE_RETIREMENT_REGISTRY[0];
  const uncertified = { ...baseline, id: 'bad-certified', state: 'ASK_CERTIFIED', evidenceTests: [] };
  const retired = { ...baseline, id: 'bad-retired', state: 'RETIRED', evidenceTests: ['test'], deepLinkRule: 'PRESERVE_UNTIL_CERTIFIED' };
  assert.match(validateAskRouteRetirementRegistry([uncertified]).join('\n'), /requires evidence tests/);
  assert.match(validateAskRouteRetirementRegistry([retired]).join('\n'), /exact Ask deep-link mapping/);
});

test('duplicate ids and route patterns, missing owners, invalid patterns, and unknown operations are rejected', () => {
  const baseline = ASK_ROUTE_RETIREMENT_REGISTRY[0];
  const issues = validateAskRouteRetirementRegistry([
    baseline,
    { ...baseline, owner: '', askOperationIds: ['NOT_AN_OPERATION'] },
    { ...baseline, id: 'bad-pattern', routePattern: '[' },
  ]).join('\n');
  assert.match(issues, /duplicate or empty id/);
  assert.match(issues, /duplicate route pattern/);
  assert.match(issues, /missing owner/);
  assert.match(issues, /unknown operation/);
  assert.match(issues, /invalid route pattern/);
});

