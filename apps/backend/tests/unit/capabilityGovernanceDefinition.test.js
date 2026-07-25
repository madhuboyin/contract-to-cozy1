const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canonicalCapabilityRegistry,
  validateCapabilityGovernanceDefinition,
} = require('../../src/productFramework/capabilities/index.ts');

function capability(id) {
  return structuredClone(canonicalCapabilityRegistry.getById(id));
}

test('CAP-903 validates every canonical definition and exposes unresolved commercial terms', () => {
  const results = canonicalCapabilityRegistry.capabilities.map((definition) => ({
    capabilityId: definition.id,
    ...validateCapabilityGovernanceDefinition(definition),
  }));
  const invalid = results.filter((result) => !result.valid);

  assert.deepEqual(invalid, [{
    capabilityId: 'financing',
    valid: false,
    issues: ['COMMERCIAL_RELATIONSHIP_NOT_RECORDED'],
  }]);
});

test('CAP-903 material and regulated definitions require professional boundaries', () => {
  const material = capability('break-even');
  material.governance.professionalBoundary = null;
  assert.deepEqual(
    validateCapabilityGovernanceDefinition(material).issues,
    ['MATERIAL_PROFESSIONAL_BOUNDARY_MISSING'],
  );

  const regulated = capability('coverage-options');
  regulated.governance.professionalBoundary = null;
  regulated.governance.jurisdictionPolicy = 'NOT_REQUIRED';
  assert.deepEqual(
    validateCapabilityGovernanceDefinition(regulated).issues,
    [
      'REGULATED_PROFESSIONAL_BOUNDARY_MISSING',
      'REGULATED_JURISDICTION_POLICY_MISSING',
    ],
  );
});

test('CAP-903 safety definitions require conservative fallback and escalation', () => {
  const emergency = capability('emergency');
  emergency.governance.conservativeFallback = null;
  emergency.governance.emergencyEscalation = null;

  assert.deepEqual(
    validateCapabilityGovernanceDefinition(emergency).issues,
    ['SAFETY_FALLBACK_MISSING', 'SAFETY_ESCALATION_MISSING'],
  );
});

test('CAP-903 commercial definitions require recorded terms and an alternative', () => {
  const financing = capability('financing');
  financing.governance.commercialDisclosure.nonCommercialAlternative = null;

  assert.deepEqual(
    validateCapabilityGovernanceDefinition(financing).issues,
    [
      'COMMERCIAL_RELATIONSHIP_NOT_RECORDED',
      'COMMERCIAL_ALTERNATIVE_MISSING',
    ],
  );
});

test('CAP-903 rejects privacy classification below inferred record sensitivity', () => {
  const digitalWill = capability('home-digital-will');
  digitalWill.governance.privacy.dataSensitivity = 'STANDARD';

  assert.deepEqual(
    validateCapabilityGovernanceDefinition(digitalWill).issues,
    ['PRIVACY_CLASSIFICATION_TOO_LOW'],
  );
});
