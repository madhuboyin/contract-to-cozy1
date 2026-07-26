const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  mapGuidanceSignal,
} = require('../../src/services/guidanceEngine/guidanceMapper');

function signal(overrides = {}) {
  return {
    id: 'signal-1',
    propertyId: 'property-1',
    inventoryItemId: null,
    signalIntentFamily: 'weather_risk',
    issueDomain: 'SAFETY',
    decisionStage: 'AWARENESS',
    executionReadiness: 'READY',
    severity: 'HIGH',
    severityScore: 80,
    confidenceScore: 0.8,
    sourceToolKey: 'home-event-radar',
    sourceFeatureKey: 'incident-service',
    sourceEntityType: 'INCIDENT',
    sourceEntityId: 'incident-1',
    payloadJson: {
      propertyRadarMatchId: 'match-1',
      privateProviderPayload: 'must-not-be-returned',
    },
    status: 'ACTIVE',
    missingContextKeys: [],
    contextPrerequisites: [],
    ...overrides,
  };
}

test('Guidance projects only the safe Radar match reference for deep links', () => {
  const mapped = mapGuidanceSignal(signal());

  assert.equal(mapped.radarMatchId, 'match-1');
  assert.equal(mapped.sourceEntityId, 'incident-1');
  assert.equal('payloadJson' in mapped, false);
  assert.equal('privateProviderPayload' in mapped, false);
});

test('Guidance does not project arbitrary payload ids as Radar matches', () => {
  const mapped = mapGuidanceSignal(signal({ sourceToolKey: 'other-tool' }));
  assert.equal(mapped.radarMatchId, null);
});
