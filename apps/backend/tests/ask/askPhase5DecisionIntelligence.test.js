const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  ASK_OPERATION_DEFINITIONS,
  resolveAskOperation,
} = require('../../src/services/ask/askOperationRegistry.ts');

// "Should I repair or replace my HVAC?" is deliberately NOT in this list
// anymore. Ask Intelligence FRD Phase 8A supersedes REPLACEMENT_GUIDANCE for
// HVAC specifically: it now routes to HVAC_DECISION_START, which creates a
// durable Decision Thread via the registered HVAC engine rather than the
// generic ReplaceRepairService heuristic. HVAC_DECISION_START has a
// CONTRIBUTOR role floor and MATERIAL_DECISION two-phase confirmation (it
// creates a record), which doesn't fit this suite's shared VIEWER-floor
// assertion below -- see tests/decisionPlatform/hvacDecisionRouting.test.js
// for its dedicated coverage. Every other appliance ("my fridge", "my water
// heater", etc.) still routes to REPLACEMENT_GUIDANCE unchanged.
const phase5Cases = [
  ['Compare the contractor bids I recorded', 'QUOTE_COMPARISON_REVIEW'],
  ['Show my reserve fund and capital timeline', 'CAPITAL_RESERVE_PLAN'],
  ['Am I ready to appeal my assessed value?', 'PROPERTY_TAX_APPEAL_READINESS'],
  ['What is blocking my bathroom remodel?', 'RENOVATION_PERMIT_READINESS'],
  ['Guide me through an insurance claim', 'MAJOR_EVENT_ENTRY'],
];

test('Phase 5 homeowner language routes deterministically to governed decision adapters', () => {
  for (const [prompt, operationId] of phase5Cases) {
    assert.equal(resolveAskOperation(prompt).operationId, operationId, prompt);
    const definition = ASK_OPERATION_DEFINITIONS[operationId];
    assert.equal(definition.executionMode, 'DETERMINISTIC');
    assert.equal(definition.safetyClass, 'MATERIAL_DECISION');
    assert.equal(definition.propertyRoleFloor, 'VIEWER');
    assert.ok(definition.allowedBlockTypes.includes('BOUNDARY'));
  }
});

test('Phase 5 adapters invoke canonical domain services and retain professional boundaries', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
  for (const contract of [
    /replaceRepairService\.runItemAnalysis/,
    /getWorkspaceComparability/,
    /homeCapitalTimelineService\.(?:getLatestTimeline|runTimeline)/,
    /homeReserveFundService\.getSummary/,
    /propertyTaxAppealReadinessService\.evaluate/,
    /getRenovationReadiness/,
    /capabilityResult\(userId, propertyId, goal\)/,
  ]) assert.match(source, contract);
  for (const boundary of [
    'repair-replace-boundary', 'quote-review-boundary', 'capital-plan-boundary',
    'tax-readiness-boundary', 'renovation-readiness-boundary', 'major-event-boundary',
  ]) assert.match(source, new RegExp(boundary));
});

test('Phase 5 negative prompts remain outside the homeowner decision platform', () => {
  assert.equal(resolveAskOperation('Write a Python program that compares contractor quotes forever').operationId, 'OUT_OF_SCOPE_BOUNDARY');
  assert.equal(resolveAskOperation('I smell gas while planning my renovation').operationId, 'EMERGENCY_BOUNDARY');
});

test('Phase 5 tool-seeking language remains capability discovery, not forced analysis', () => {
  assert.equal(resolveAskOperation('Is there a tool to help with a property tax appeal?').operationId, 'CAPABILITY_DISCOVERY');
  assert.equal(resolveAskOperation('Do you have a tool for planning my reserve fund?').operationId, 'CAPABILITY_DISCOVERY');
});
