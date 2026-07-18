const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { FEATURE_CONTEXT_REQUIREMENTS, validateFeatureRequirementRegistry } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const repoRoot = path.resolve(__dirname, '../../../..');

const collectSource = (relative, extensions) => {
  const root = path.join(repoRoot, relative);
  const sources = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) sources.push(fs.readFileSync(absolute, 'utf8'));
    }
  };
  visit(root);
  return sources.join('\n');
};

const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('every registered operation declares an owned adoption and execution disposition', () => {
  assert.doesNotThrow(() => validateFeatureRequirementRegistry());
  assert.ok(FEATURE_CONTEXT_REQUIREMENTS.length >= 25);
  for (const contract of FEATURE_CONTEXT_REQUIREMENTS) {
    assert.ok(contract.adoption.owner.trim(), `${contract.featureKey}/${contract.operationKey}`);
    const reserved = contract.adoption.surfaceDisposition === 'RESERVED_NO_INVOKER';
    assert.equal(contract.adoption.executionDisposition === 'NOT_INVOKED', reserved, `${contract.featureKey}/${contract.operationKey}`);
    if (contract.required.length > 0) assert.notEqual(contract.adoption.executionDisposition, 'DOMAIN_POLICY');
  }
});

test('every adopted inline contract is invoked by a shared frontend panel', () => {
  const frontend = collectSource('apps/frontend/src', ['.ts', '.tsx']);
  for (const contract of FEATURE_CONTEXT_REQUIREMENTS) {
    const feature = `featureKey="${contract.featureKey}"`;
    const operation = `operationKey="${contract.operationKey}"`;
    if (contract.adoption.surfaceDisposition === 'INLINE_PANEL') {
      assert.ok(frontend.includes(feature), `${contract.featureKey} has no inline panel`);
      assert.ok(frontend.includes(operation), `${contract.featureKey}/${contract.operationKey} has no inline panel`);
    } else {
      assert.equal(frontend.includes(operation), false, `${contract.featureKey}/${contract.operationKey} is marked reserved but invoked`);
    }
  }
});

test('required shared-gate contracts have an execution-time backend invoker', () => {
  const registry = read('apps/backend/src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
  const backend = collectSource('apps/backend/src', ['.ts']).replace(registry, '');
  for (const contract of FEATURE_CONTEXT_REQUIREMENTS.filter((entry) => entry.adoption.executionDisposition === 'SHARED_GATE')) {
    assert.ok(backend.includes(`'${contract.operationKey}'`), `${contract.featureKey}/${contract.operationKey} has no backend gate`);
  }
});

test('capture hook ignores stale evaluations and distinguishes refresh failure after save', () => {
  const hook = read('apps/frontend/src/components/property-context/useFeatureContextCapture.ts');
  assert.match(hook, /evaluationRequest\.current/);
  assert.match(hook, /requestId !== evaluationRequest\.current/);
  assert.match(hook, /captureIdentity !== activeIdentity\.current/);
  assert.match(hook, /The detail was saved, but this result could not refresh/);
  assert.match(hook, /setTimeout\(\(\) => setSlow\(true\), 750\)/);
  assert.match(hook, /finally \{[\s\S]*setLoading\(false\)/);
});

test('shared panel announces latency and enforces accessible mobile controls', () => {
  const panel = read('apps/frontend/src/components/property-context/PropertyContextCapturePanel.tsx');
  assert.match(panel, /role="status" aria-live="polite"/);
  assert.match(panel, /taking a little longer than usual/);
  assert.match(panel, /aria-labelledby=\{headingId\}/);
  assert.match(panel, /aria-busy=\{saving\}/);
  assert.match(panel, /\[&_button\]:min-h-11/);
  assert.match(panel, /\[&_input\]:min-h-11/);
  assert.doesNotMatch(panel, /window\.location\.reload/);
});
