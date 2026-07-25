const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');
const {
  reviewCapabilityCopy,
} = require('../../src/productFramework/capabilities/capabilityCopyReview.ts');

test('CAP-909 reviews every canonical capability and homeowner copy field', () => {
  const report = reviewCapabilityCopy(
    canonicalCapabilityRegistry,
    new Date('2026-07-25T12:00:00.000Z'),
  );

  assert.equal(report.contractVersion, 'capability-copy-review-v1');
  assert.equal(report.capabilityCount, canonicalCapabilityRegistry.capabilities.length);
  assert.equal(report.capabilities.length, report.capabilityCount);
  assert.ok(report.reviewedFieldCount > report.capabilityCount * 4);
  assert.deepEqual(report.issues, []);
  assert.equal(report.passed, true);
});

test('CAP-909 rejects promotional, pressured, and unreviewed template copy', () => {
  const capability = structuredClone(
    canonicalCapabilityRegistry.capabilities[0],
  );
  capability.presentation.shortDescription = 'Act now for the best guaranteed result!';
  capability.recommendation.reasonTemplates = {
    TEST_REASON: 'Use {{rawPropertyValue}} for an exclusive result.',
  };
  const registry = {
    version: 'copy-test',
    capabilities: [capability],
  };
  const report = reviewCapabilityCopy(registry);
  const codes = report.issues.map(({ code }) => code);

  assert.ok(codes.includes('PROMOTIONAL_LANGUAGE'));
  assert.ok(codes.includes('PRESSURE_LANGUAGE'));
  assert.ok(codes.includes('EXCLAMATION'));
  assert.ok(codes.includes('UNAPPROVED_TEMPLATE_PARAMETER'));
  assert.equal(report.passed, false);
});
