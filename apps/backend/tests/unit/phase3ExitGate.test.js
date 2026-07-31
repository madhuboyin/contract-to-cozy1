const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateProtectionContext } = require('../../src/services/protection/applicabilityPolicy.ts');
const { reconcileProtectionIssues } = require('../../src/services/protection/issueReconciliation.ts');
const { PROTECTION_FEATURE_SCOPES } = require('../../src/services/protection/context.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'test-version',
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('representative Phase 3 archetypes route responsibility correctly', () => {
  const archetypes = [
    { name: 'detached owner', roof: 'OWNER', plumbing: 'OWNER', roofStatus: 'APPLICABLE', plumbingStatus: 'APPLICABLE' },
    { name: 'condo association-managed', roof: 'ASSOCIATION', plumbing: 'OWNER', roofStatus: 'NOT_APPLICABLE', plumbingStatus: 'APPLICABLE' },
    { name: 'townhome shared', roof: 'SHARED', plumbing: 'OWNER', roofStatus: 'APPLICABLE', plumbingStatus: 'APPLICABLE' },
    { name: 'rental landlord-managed', roof: 'LANDLORD', plumbing: 'LANDLORD', roofStatus: 'NOT_APPLICABLE', plumbingStatus: 'NOT_APPLICABLE' },
    { name: 'vacant owner-managed', roof: 'OWNER', plumbing: 'OWNER', roofStatus: 'APPLICABLE', plumbingStatus: 'APPLICABLE' },
    { name: 'association exterior with owner interior', roof: 'ASSOCIATION', plumbing: 'OWNER', roofStatus: 'NOT_APPLICABLE', plumbingStatus: 'APPLICABLE' },
  ];

  for (const archetype of archetypes) {
    const decisions = evaluateProtectionContext(snapshot({
      'responsibility.roof': archetype.roof,
      'responsibility.buildingExterior': archetype.roof,
      'responsibility.plumbing': archetype.plumbing,
      'responsibility.hvac': archetype.plumbing,
      'responsibility.commonSafety': archetype.roof,
    }));
    assert.equal(decisions.roofActions.status, archetype.roofStatus, archetype.name);
    assert.equal(decisions.plumbingActions.status, archetype.plumbingStatus, archetype.name);
  }
});

test('Phase 3 features declare bounded scopes without optional household data', () => {
  for (const [feature, scopes] of Object.entries(PROTECTION_FEATURE_SCOPES)) {
    assert.ok(scopes.length > 0, feature);
    assert.equal(scopes.includes('OPTIONAL_HOUSEHOLD'), false, feature);
    assert.equal(scopes.includes('PRODUCT_CONTEXT'), false, feature);
  }
  assert.ok(PROTECTION_FEATURE_SCOPES.EVENT_RADAR.includes('RESPONSIBILITY'));
  assert.ok(PROTECTION_FEATURE_SCOPES.RISK_PREMIUM_OPTIMIZER.includes('COVERAGE'));
});

test('missing responsibility and location facts expose correction paths', () => {
  const decisions = evaluateProtectionContext(snapshot({ 'location.state': 'NJ' }));
  assert.equal(decisions.roofActions.status, 'UNKNOWN');
  assert.ok(decisions.roofActions.correctionPaths.includes('/dashboard/properties/property-1/edit#responsibility'));
  assert.ok(decisions.climateRisk.correctionPaths.includes('/dashboard/properties/property-1/edit#address'));
});

test('resolved sources and duplicate guidance signals are reconciled out', () => {
  const reconciliation = reconcileProtectionIssues(snapshot({
    'recalls.unresolvedMatches': [{ id: 'recall-active' }],
    'inspection.openFindings': [],
    'risk.activeIncidents': [{ id: 'incident-active' }],
    'coverage.activeClaims': [],
    'guidance.activeSignals': [
      { id: 'signal-active', sourceEntityType: 'RecallMatch', sourceEntityId: 'recall-active', dedupeKey: 'recall:one' },
      { id: 'signal-duplicate', sourceEntityType: 'RecallMatch', sourceEntityId: 'recall-active', dedupeKey: 'recall:one' },
      { id: 'signal-resolved', sourceEntityType: 'RecallMatch', sourceEntityId: 'recall-resolved', dedupeKey: 'recall:two' },
    ],
  }));
  assert.deepEqual(reconciliation.suppressedGuidanceSignalIds.sort(), ['signal-duplicate', 'signal-resolved']);
  assert.equal(reconciliation.suppressionReasons['signal-resolved'], 'SOURCE_ISSUE_RESOLVED_OR_CLOSED');
});

test('generation, notification, and UI paths enforce the completion boundary', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  assert.match(read('../../src/services/riskPremiumOptimizer.service.ts'), /generatedContextVersion/);
  const replayRoutes = read('../../src/routes/homeRiskReplay.routes.ts');
  assert.match(replayRoutes, /LEGACY_RISK_REPLAY_RETIRED/);
  assert.match(replayRoutes, /past-hazard-exposure/);
  assert.match(read('../../src/services/incidents/integrations/incidentNotification.service.ts'), /incidentNotifications/);
  assert.match(read('../../../workers/src/recalls/recallFollowups.service.ts'), /inspectionFindings/);
  assert.match(read('../../../frontend/src/components/property-context/PropertyContextStatusNotice.tsx'), /correctionPaths/);
});
