const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

require('ts-node/register');

// The read-only measurement of asset identity conflicts (FRD v1.177), and proof that it counts what the feed raises.

const { detectAssetIdentityConflict, isRiskActionable, riskRowIdentity } = require('../../src/services/riskRowIdentity.ts');
const { adaptOrchestratedActionToHomeAction } = require('../../src/services/orchestration.service.ts');

test('a conflict needs two known, different labels; an unresolvable label can never conflict', () => {
  assert.equal(detectAssetIdentityConflict('Washer', 'Dishwasher'), true);
  assert.equal(detectAssetIdentityConflict('Washer', 'Washer'), false);
  for (const [named, typed] of [[null, 'Dishwasher'], ['Washer', null], [null, null], [undefined, 'Washer'], ['', 'Washer']]) assert.equal(detectAssetIdentityConflict(named, typed), false);
});

test('every inventory major-appliance system type is inert, whatever the row is named', () => {
  for (const type of ['WASHER_DRYER', 'REFRIGERATOR', 'OVEN_RANGE', 'MICROWAVE_HOOD', 'DISHWASHER', 'WATER_SOFTENER', 'FRIDGE', 'WASHER', 'DRYER', 'RANGE', 'MICROWAVE', 'FREEZER']) {
    for (const assetName of ['DISHWASHER', 'WASHER', 'REFRIGERATOR', 'My washer']) {
      const identity = riskRowIdentity({ assetName, systemType: `MAJOR_APPLIANCE_${type}` });
      assert.equal(identity.typedLabel, null, `${type}`);
      assert.equal(identity.conflict, false, `${assetName} / ${type}`);
    }
  }
});

test('a bare, resolvable system type with a differently-named row is the only shape that conflicts', () => {
  assert.equal(riskRowIdentity({ assetName: 'WASHER', systemType: 'DISHWASHER' }).conflict, true);
  assert.equal(riskRowIdentity({ assetName: 'FRIDGE', systemType: 'REFRIGERATOR' }).conflict, false, 'two names for one label');
  assert.equal(riskRowIdentity({ assetName: 'DISHWASHER', systemType: 'DISHWASHER' }).conflict, false, 'config rows carry one string for both');
  // Fallbacks the feed applies: a missing system type falls back to the name; a missing name to the system type.
  assert.equal(riskRowIdentity({ assetName: 'WASHER' }).systemType, 'WASHER');
  assert.equal(riskRowIdentity({ systemType: 'DISHWASHER' }).title, 'DISHWASHER');
  assert.equal(riskRowIdentity({}).systemType, 'Unknown');
});

test('actionable rows are HIGH/CRITICAL, an action status, or carry a recommended action -- unchanged by the extraction', () => {
  assert.equal(isRiskActionable({ riskLevel: 'high' }), true);
  assert.equal(isRiskActionable({ severity: 'CRITICAL' }), true);
  assert.equal(isRiskActionable({ status: 'needs_review' }), true);
  assert.equal(isRiskActionable({ recommendedAction: '  Do a thing ' }), true);
  for (const quiet of [{ riskLevel: 'LOW' }, { riskLevel: 'MODERATE', status: 'OK' }, { recommendedAction: '   ' }, {}, null, undefined]) assert.equal(isRiskActionable(quiet), false);
});

test('parity: the feed raises the identity-conflict card exactly when the shared predicate says conflict', () => {
  const build = (d) => adaptOrchestratedActionToHomeAction({
    id: 'risk-row', actionKey: 'risk:row', source: 'RISK', propertyId: 'property-1', title: d.assetName, description: null, systemType: d.systemType,
    category: 'APPLIANCE', riskLevel: 'HIGH', coverage: { hasCoverage: false, type: 'NONE', expiresOn: null }, confidence: { score: 0.85, level: 'HIGH', explanation: [] },
    priority: 80, cta: { show: true, label: 'Schedule Service', reason: 'ACTION_REQUIRED' }, suppression: { suppressed: false, reasons: [] },
    signalSources: [], primarySignalSource: null, overdue: false, createdAt: new Date('2026-08-31T12:00:00.000Z'),
  });
  for (const d of [
    { assetName: 'WASHER', systemType: 'DISHWASHER' }, { assetName: 'DISHWASHER', systemType: 'DISHWASHER' }, { assetName: 'FRIDGE', systemType: 'REFRIGERATOR' },
    { assetName: 'WASHER', systemType: 'MAJOR_APPLIANCE_WASHER_DRYER' }, { assetName: 'MY_DRYER', systemType: 'MAJOR_APPLIANCE_REFRIGERATOR' }, { assetName: 'REFRIGERATOR', systemType: 'DRYER' },
  ]) {
    const raisedByFeed = build(d).primaryCta.label === 'Review asset details';
    assert.equal(raisedByFeed, riskRowIdentity(d).conflict, JSON.stringify(d));
  }
});

// The script itself, executed with only the Prisma client stubbed (and the stub allows nothing but the one read).
const backend = resolve(__dirname, '../..');
function runScript(args, reports) {
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-r', resolve(backend, 'tests/helpers/riskReportsPreload.js'), 'scripts/measure-asset-identity-conflicts.ts', ...args], {
    cwd: backend, encoding: 'utf8', timeout: 120000, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', FIXTURE_REPORTS: JSON.stringify(reports) },
  });
  return { ...result, out: `${result.stdout}${result.stderr}` };
}
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const reports = [
  { propertyId: 'p1', lastCalculatedAt: daysAgo(2), details: [
    { assetName: 'REFRIGERATOR', systemType: 'MAJOR_APPLIANCE_REFRIGERATOR', riskLevel: 'HIGH' },
    { assetName: 'DISHWASHER', systemType: 'DISHWASHER', riskLevel: 'LOW' },
  ] },
  { propertyId: 'p2', lastCalculatedAt: daysAgo(90), details: [
    { assetName: 'WASHER', systemType: 'DISHWASHER', riskLevel: 'HIGH' },
    { assetName: 'WASHER', systemType: 'DISHWASHER', riskLevel: 'LOW' },
    { assetName: 'FRIDGE', systemType: 'REFRIGERATOR', recommendedAction: 'Service it' },
  ] },
  { propertyId: 'p3', lastCalculatedAt: daysAgo(5), details: 'not-an-array' },
];

test('script: counts rows, inert major-appliance rows, all conflicts and the ones the feed would raise, and only reads', () => {
  const { out, status } = runScript([], reports);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /READ-ONLY VIOLATION/);
  assert.match(out, /Properties with a stored risk report : 3\s+\(1 with unreadable details\)/);
  assert.match(out, /1 older than 30 days/);
  assert.match(out, /Risk rows\s+: 5\s+\(3 actionable\)/);
  assert.match(out, /MAJOR_APPLIANCE_\* rows \(inert\)\s+: 1/);
  assert.match(out, /Rows whose name and type conflict\s+: 2/);
  assert.match(out, /ACTIONABLE CONFLICTS \(cards raised\)\s+: 1\s+across 1 properties/);
  assert.match(out, /2 rows \(1 actionable\)\s+WASHER \[Washer\]\s+vs\s+DISHWASHER \[Dishwasher\]/);
  assert.match(out, /property=p2\s+calculated=\d{4}-\d{2}-\d{2}\s+actionable=true\s+WASHER \[Washer\]/);
  assert.match(out, /Verdict: 1 identity-conflict card\(s\) would be raised today/);
  assert.match(out, /DISCONNECTED/);
});

test('script: with nothing conflicting it says so plainly, and --property scopes the single query', () => {
  const clean = runScript([], [reports[0]]);
  assert.match(clean.out, /ACTIONABLE CONFLICTS \(cards raised\)\s+: 0/);
  assert.match(clean.out, /Verdict: no identity-conflict cards are being raised/);
  assert.doesNotMatch(clean.out, /Distinct conflicting pairs/);
  const scoped = runScript(['--property=p2'], reports);
  assert.match(scoped.out, /FINDMANY_ARGS .*"propertyId":"p2"/);
  assert.match(scoped.out, /Limited to property p2/);
});
