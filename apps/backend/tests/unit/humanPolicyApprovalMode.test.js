const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

function setEnv(value) {
  if (value === undefined) delete process.env.ENFORCE_HUMAN_POLICY_APPROVALS;
  else process.env.ENFORCE_HUMAN_POLICY_APPROVALS = value;
}

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('human policy approvals are advisory by default and enforced only by exact opt-in', () => {
  const original = process.env.ENFORCE_HUMAN_POLICY_APPROVALS;
  const { areHumanPolicyApprovalsEnforced, humanPolicyGateAllows } = require('../../src/config/appConfig.ts');
  try {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      setEnv(value);
      assert.equal(areHumanPolicyApprovalsEnforced(), false);
    }
    setEnv('true');
    assert.equal(areHumanPolicyApprovalsEnforced(), true);
    assert.equal(humanPolicyGateAllows(false), false);
    assert.equal(humanPolicyGateAllows(true), true);
    setEnv('false');
    assert.equal(humanPolicyGateAllows(false), true);
  } finally {
    setEnv(original);
  }
});

test('deployment keeps beta advisory mode centrally configurable from app-config', () => {
  const configMap = read('../../../../infrastructure/kubernetes/base/configmap.yaml');
  const deployment = read('../../../../infrastructure/kubernetes/apps/backend/deployment.yaml');
  const compose = read('../../../../docker-compose.yml');
  assert.match(configMap, /ENFORCE_HUMAN_POLICY_APPROVALS: "false"/);
  assert.match(deployment, /name: ENFORCE_HUMAN_POLICY_APPROVALS[\s\S]+key: ENFORCE_HUMAN_POLICY_APPROVALS/);
  assert.match(compose, /ENFORCE_HUMAN_POLICY_APPROVALS: \$\{ENFORCE_HUMAN_POLICY_APPROVALS:-false\}/);
});

test('approval bypass is limited to human attestations, not technical safety contracts', () => {
  const catalogService = read('../../src/services/personalizationCatalogAdmin.service.ts');
  const newHomeService = read('../../src/services/newHomeSetup.service.ts');
  const governanceContract = read('../../src/productFramework/recommendationGovernance.contract.ts');
  assert.match(catalogService, /humanPolicyGateAllows\(readiness\.ready/);
  assert.match(newHomeService, /humanPolicyGateAllows\(assessment\.admissionDecision === 'ADMITTED'/);
  for (const invariant of [
    'professional boundary',
    'verified jurisdiction check',
    'conservative fallback',
    'escalation instruction',
    'Commercial relationships must be recorded',
  ]) assert.match(governanceContract, new RegExp(invariant, 'i'));
});
