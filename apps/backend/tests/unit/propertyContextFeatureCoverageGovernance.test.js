const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Home Intelligence Functional Completeness FRD Phase 3 review finding 6:
// "Inline Property Context capture is only configured for repair/replace."
// Wires propertyContextFeature into the two producers that already have a
// matching, pre-existing Property Context feature registration
// (featureRequirementRegistry.ts) — CAPITAL_TIMELINE/RUN_TIMELINE and
// COVERAGE_INTELLIGENCE/ASSESS_PROPERTY_COVERAGE. Refinance, ownership-cost,
// savings-benefit, and sell/hold/rent have no registered feature/operation
// pair to wire to at all — building new capture requirements for those
// domains from scratch is separate, larger product work, out of scope here.

const source = readFileSync(resolve(__dirname, '../../src/services/homeActionSourcePromotion.service.ts'), 'utf8');
const registrySource = readFileSync(resolve(__dirname, '../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts'), 'utf8');

function producerBlock(startMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} not found`);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end);
}

test('loadHomeCapitalTimelineMaterialWindowActions declares propertyContextFeature against a registered feature/operation pair', () => {
  const block = producerBlock('async function loadHomeCapitalTimelineMaterialWindowActions');
  assert.match(block, /propertyContextFeature:\s*\{\s*featureKey:\s*'CAPITAL_TIMELINE',\s*operationKey:\s*'RUN_TIMELINE',/);
  assert.match(registrySource, /featureKey:\s*'CAPITAL_TIMELINE',\s*\n\s*operationKey:\s*'RUN_TIMELINE',/, 'CAPITAL_TIMELINE/RUN_TIMELINE must actually be registered in featureRequirementRegistry.ts');
});

test('loadCoverageActions declares propertyContextFeature against a registered feature/operation pair', () => {
  const block = producerBlock('async function loadCoverageActions');
  assert.match(block, /propertyContextFeature:\s*\{\s*featureKey:\s*'COVERAGE_INTELLIGENCE',\s*operationKey:\s*'ASSESS_PROPERTY_COVERAGE',/);
  assert.match(registrySource, /featureKey:\s*'COVERAGE_INTELLIGENCE',\s*\n\s*operationKey:\s*'ASSESS_PROPERTY_COVERAGE',/, 'COVERAGE_INTELLIGENCE/ASSESS_PROPERTY_COVERAGE must actually be registered in featureRequirementRegistry.ts');
});
