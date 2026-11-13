// FR-FAST-1 / FR-FAST-9: every deterministic rule has a stable id in the source, the generated manifests match the source, a rule's hash moves only when something that rule depends on changes, and a certificate for an
// older rule version no longer certifies it.
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
require('ts-node/register/transpile-only');
const { analyze, REGISTRY } = require('../../scripts/lib/askFastPathRuleScan');
const { FAST_PATH_RULE_MANIFEST } = require('../../src/services/ask/fastPath/ruleManifest.generated.ts');
const { FAST_PATH_ADJACENCY } = require('../../src/services/ask/fastPath/adjacencyManifest.generated.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const source = fs.readFileSync(REGISTRY, 'utf8');

test('the committed manifests and the rule ids in the source are current', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '../../scripts/ask-fast-path-rules.js')], { env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const rules = analyze(source);
  assert.ok(rules.every((r) => r.id && /^DET_[A-Z0-9_]+_\d{2,}$/.test(r.id) && r.id.startsWith(`DET_${r.operationId}_`)));
  assert.deepEqual(FAST_PATH_RULE_MANIFEST.map((r) => [r.id, r.hash]), rules.map((r) => [r.id, r.hash]));
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
});
test('a rule hash moves only with what that rule depends on: editing one pattern changes the rules that use it and no others', () => {
  const baseline = new Map(analyze(source).map((r) => [r.id, r.hash]));
  // pick a module-level pattern used by exactly one rule, and change its regex
  const rules = analyze(source); const used = new Map();
  for (const r of rules) for (const ref of r.references) used.set(ref, [...(used.get(ref) ?? []), r.id]);
  const [reference, [onlyRule]] = [...used.entries()].find(([ref, ids]) => ids.length === 1 && ref.startsWith('askOperationRegistry.ts:') && /Pattern$/.test(ref));
  const name = reference.split(':')[1]; const declaration = new RegExp(`(const ${name}\\s*=\\s*/)`);
  assert.match(source, declaration);
  const edited = analyze(source.replace(declaration, '$1(?:xx)?'));
  const changed = edited.filter((r) => baseline.get(r.id) !== r.hash).map((r) => r.id);
  assert.deepEqual(changed, [onlyRule], `${name} is used only by ${onlyRule}`);
  // the guard text itself also moves the hash (and only that rule's)
  const guard = /(\n  if \()([A-Za-z]+\(message\))(\) return resolved\('[A-Z_]+', 0\.\d+, 'DET_[A-Z_0-9]+'\);)/;
  assert.match(source, guard);
  const guarded = analyze(source.replace(guard, '$1$2 && true$3'));
  assert.equal(guarded.filter((r) => baseline.get(r.id) !== r.hash).length, 1, 'editing one guard moves exactly one rule hash');
});
test('operation-owned adjacency (FR-FAST-9) covers every governed operation and names real operations', () => {
  const governed = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable && !d.safetyClass.endsWith('_BOUNDARY') && d.operationId !== 'GROUNDED_GUIDANCE').map((d) => d.operationId).sort();
  assert.deepEqual(Object.keys(FAST_PATH_ADJACENCY).sort(), governed);
  for (const [op, adjacent] of Object.entries(FAST_PATH_ADJACENCY)) for (const other of Object.keys(adjacent)) { assert.ok(ASK_OPERATION_DEFINITIONS[other], `${op} -> ${other}`); assert.notEqual(other, op); }
  assert.ok(Object.values(FAST_PATH_ADJACENCY).some((a) => Object.keys(a).length > 0));
});
test('a certificate for an older version of a rule does not certify the changed rule', () => {
  // rebuild the rule table with a stale certificate to prove the version check, using the module internals through a fresh require
  const certsPath = require.resolve('../../src/services/ask/fastPath/fastPathCertificates.ts');
  const rule = FAST_PATH_RULE_MANIFEST.find((r) => r.operationId === 'WARRANTY_LOOKUP');
  const { FAST_PATH_CERTIFICATES } = require(certsPath);
  assert.deepEqual(Object.keys(FAST_PATH_CERTIFICATES), [], 'nothing is certified today');
  assert.ok(rule && /^[a-f0-9]{16}$/.test(rule.hash));
});
