const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

require('ts-node/register');

const {
  buildSkillPackageScaffold,
  createSkillPackage,
  validateSkillPackageScaffoldSpec,
} = require('../../src/services/skills/skillPackageScaffold.ts');

function spec() {
  return {
    id: 'home-readiness',
    domain: 'HOME_INTELLIGENCE',
    displayName: 'Home Readiness',
    description: 'Explain the bounded readiness state of the selected home.',
    owner: 'Homeowner Product / Home Intelligence',
    homeownerJobs: ['STAY_AHEAD'],
    supportedGoals: ['understand-home-readiness'],
    aliases: ['home readiness', 'readiness overview'],
    selectionExamples: [
      { mode: 'EXACT', message: 'Summarize my home readiness', operationId: 'PROPERTY_SUMMARY' },
      { mode: 'PARAPHRASED', message: 'What is known about this home?', operationId: 'PROPERTY_SUMMARY' },
      { mode: 'COLLOQUIAL', message: 'How ready is my place?', operationId: 'PROPERTY_SUMMARY' },
    ],
    exclusions: ['Do not infer safety or missing facts from absent records.'],
    operations: [{ operationId: 'PROPERTY_SUMMARY' }],
    consumerPolicy: [{ consumer: 'ASK', operations: ['PROPERTY_SUMMARY'] }],
    riskPolicy: { effects: ['READ'], materiality: 'LOW', riskDomains: ['PRIVACY'], reversibility: 'REVERSIBLE' },
    authorizationFloor: 'VIEWER',
    ambiguityExamples: [{ message: 'Show readiness or the existing property record', candidateSkillIds: ['home-readiness', 'property-record'] }],
    negativeExamples: ['Prove that this house is safe.'],
    prohibitedAdapters: ['maintenance.create'],
    prohibitedContextProviders: ['raw.document-corpus'],
    handoff: { suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status', reasonCodes: ['READINESS_REVIEWED'] },
  };
}

const unownedOperation = { operationOwner: () => undefined };

test('scaffolder generates the complete standard Skill package from one validated spec', () => {
  const scaffold = buildSkillPackageScaffold(spec(), unownedOperation);
  assert.equal(scaffold.directoryName, 'home-readiness');
  assert.deepEqual(Object.keys(scaffold.files).sort(), ['SKILL.md', 'index.ts', 'skill.evaluation.ts', 'skill.manifest.ts']);
  assert.match(scaffold.files['skill.manifest.ts'], /HOME_READINESS_SKILL/);
  assert.match(scaffold.files['skill.manifest.ts'], /"property\.summary"/);
  assert.match(scaffold.files['skill.evaluation.ts'], /"MODEL_DISABLED"|"modelDisabledCase"/);
  assert.match(scaffold.files['skill.evaluation.ts'], /"candidateSkillIds"/);
  assert.match(scaffold.files['SKILL.md'], /Peer Skill execution is prohibited/);
  assert.match(scaffold.registration.manifestImport, /home-readiness/);
  assert.equal(Object.isFrozen(scaffold), true);
});

test('default validation refuses operation ownership conflicts', () => {
  const issues = validateSkillPackageScaffoldSpec(spec());
  assert.ok(issues.some((issue) => issue.includes('already owned by Skill property-record')));
});

test('validation rejects incomplete semantics, unknown providers, and unsafe ambiguity declarations', () => {
  const invalid = spec();
  invalid.selectionExamples = invalid.selectionExamples.slice(0, 1);
  invalid.operations = [{ operationId: 'PROPERTY_SUMMARY', requiredContextProviders: [{ id: 'missing.provider', version: '1.0.0' }] }];
  invalid.ambiguityExamples = [{ message: 'Ambiguous', candidateSkillIds: ['home-readiness'] }];
  const issues = validateSkillPackageScaffoldSpec(invalid, unownedOperation);
  assert.ok(issues.some((issue) => issue.includes('missing paraphrased selection example')));
  assert.ok(issues.some((issue) => issue.includes('missing colloquial selection example')));
  assert.ok(issues.some((issue) => issue.includes('unknown context provider missing.provider@1.0.0')));
  assert.ok(issues.some((issue) => issue.includes('ambiguity examples require')));
});

test('scaffolder rejects unresolved required dependencies before writing files', () => {
  const invalid = spec();
  invalid.dependencies = [{ type: 'CANONICAL_SERVICE_CAPABILITY', id: 'missing-service', version: '^1.0', required: true }];
  const issues = validateSkillPackageScaffoldSpec(invalid, unownedOperation);
  assert.ok(issues.some((issue) => issue.includes('unresolved required dependency CANONICAL_SERVICE_CAPABILITY:missing-service@^1.0')));

  const valid = validateSkillPackageScaffoldSpec(invalid, {
    ...unownedOperation,
    resolveDependency: () => ({ version: '1.4' }),
  });
  assert.equal(valid.some((issue) => issue.includes('dependency')), false);
});

test('optional providers remain optional in generated declarations and dependencies', () => {
  const optional = spec();
  optional.operations = [{ operationId: 'PROPERTY_SUMMARY', optionalContextProviders: [{ id: 'fixture.context', version: '1.0.0' }] }];
  const scaffold = buildSkillPackageScaffold(optional, { operationOwner: () => undefined, resolveProvider: () => ({}) });
  const manifest = scaffold.files['skill.manifest.ts'];
  assert.match(manifest, /"requiredContextProviders": \[\]/);
  assert.match(manifest, /"optionalContextProviders": \[[\s\S]*"fixture\.context"/);
  assert.match(manifest, /"type": "CONTEXT_PROVIDER"[\s\S]*"fixture\.context"[\s\S]*"required": false/);
});

test('filesystem creation is atomic and never overwrites an existing Skill package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctc-skill-scaffold-'));
  try {
    const created = await createSkillPackage(root, spec(), unownedOperation);
    assert.equal(created.directory, join(root, 'home-readiness'));
    assert.deepEqual((await readdir(created.directory)).sort(), ['SKILL.md', 'index.ts', 'skill.evaluation.ts', 'skill.manifest.ts']);
    assert.match(await readFile(join(created.directory, 'SKILL.md'), 'utf8'), /# Home Readiness Skill/);
    await assert.rejects(createSkillPackage(root, spec(), unownedOperation));
    assert.deepEqual((await readdir(root)).sort(), ['home-readiness']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
