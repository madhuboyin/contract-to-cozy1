const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  mapGuidanceEvent,
  mapGuidanceJourney,
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

test('HVAC Guidance serialization removes every nested generic repair-or-replace verdict', () => {
  const mapped = mapGuidanceJourney({
    id: 'journey-1',
    propertyId: 'property-1',
    inventoryItemId: 'item-1',
    inventoryItem: { name: 'Heat pump', category: 'HVAC' },
    issueDomain: 'ASSET_LIFECYCLE',
    decisionStage: 'DECISION',
    executionReadiness: 'NEEDS_CONTEXT',
    status: 'ACTIVE',
    steps: [{
      id: 'step-1',
      journeyId: 'journey-1',
      stepOrder: 1,
      stepKey: 'repair_replace_decision',
      label: 'Repair or replace',
      status: 'COMPLETED',
      toolKey: 'replace-repair',
      producedDataJson: { proofType: 'repair_replace_analysis', verdict: 'REPLACE_NOW' },
    }],
    derivedSnapshotJson: {
      byStep: {
        repair_replace_decision: {
          toolKey: 'replace-repair',
          raw: { proofType: 'repair_replace_analysis', verdict: 'REPLACE_NOW' },
        },
      },
      byTool: { 'replace-repair': { data: { replaceRepairVerdict: 'REPLACE_NOW' } } },
      latest: { replaceRepairVerdict: 'REPLACE_NOW', unrelatedValue: 7 },
    },
    sourceVerdict: 'REPLACE_NOW',
  });

  assert.equal(mapped.steps[0].producedData, null);
  assert.deepEqual(mapped.derivedSnapshot.byStep, {});
  assert.deepEqual(mapped.derivedSnapshot.byTool, {});
  assert.deepEqual(mapped.derivedSnapshot.latest, { unrelatedValue: 7 });
  assert.equal(mapped.sourceVerdict, null);
});

test('HVAC Guidance event serialization suppresses historical generic verdict payloads', () => {
  const mapped = mapGuidanceEvent({
    id: 'event-1',
    payloadJson: { proofType: 'repair_replace_analysis', verdict: 'REPLACE_NOW' },
  }, { suppressGenericRepairReplace: true });

  assert.equal(mapped.payload, null);
});
