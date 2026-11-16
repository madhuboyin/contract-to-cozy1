const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register/transpile-only');

const {
  buildRegistryDriftSnapshot,
  compareRegistryDrift,
  ASK_REGISTRY_DRIFT_SNAPSHOT_VERSION,
} = require('../../src/services/ask/semantic/governance/registryDrift.ts');

const SNAPSHOT_PATH = path.join(__dirname, '../../src/services/ask/semantic/governance/registryDriftSnapshot.generated.json');
const committed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('the generated entity/field registries and lexicon match the committed snapshot (FR-ONT-6)', () => {
  const findings = compareRegistryDrift(committed, buildRegistryDriftSnapshot());
  assert.deepEqual(
    findings,
    [],
    `Registry drift. Run "npx prisma generate" if the schema changed, review, then "node scripts/ask-semantic-registry-drift.js --write":\n${findings.map((f) => `  [${f.kind}] ${f.subject}: ${f.detail}`).join('\n')}`,
  );
});

test('the snapshot is deterministic and versioned', () => {
  const a = buildRegistryDriftSnapshot();
  const b = buildRegistryDriftSnapshot();
  assert.equal(a.digest, b.digest);
  assert.equal(a.snapshotVersion, ASK_REGISTRY_DRIFT_SNAPSHOT_VERSION);
  assert.equal(committed.digest, a.digest);
  assert.ok(Object.keys(a.entities).length >= 20 && Object.keys(a.fields).length >= 100);
});

test('a schema column type or nullability change behind a registered field is reported as drift', () => {
  const live = buildRegistryDriftSnapshot();
  const mutated = clone(live);
  const fieldId = Object.keys(mutated.fields)[0];
  mutated.fields[fieldId].prismaType = 'SomeOtherType';
  mutated.fields[fieldId].nullableInSchema = !mutated.fields[fieldId].nullableInSchema;
  const findings = compareRegistryDrift(mutated, live);
  const hit = findings.find((f) => f.kind === 'FIELD_CHANGED' && f.subject === fieldId);
  assert.ok(hit);
  assert.match(hit.detail, /prismaType/);
  assert.match(hit.detail, /nullableInSchema/);
});

test('an enum vocabulary change is reported, and vocabularies are order-independent (sorted) so reordering is never false drift', () => {
  const live = buildRegistryDriftSnapshot();
  const enumFieldId = Object.keys(live.fields).find((id) => Array.isArray(live.fields[id].enumVocabulary) && live.fields[id].enumVocabulary.length > 1);
  assert.ok(enumFieldId, 'expected at least one registered enum field');
  for (const field of Object.values(live.fields)) {
    if (field.enumVocabulary) assert.deepEqual(field.enumVocabulary, [...field.enumVocabulary].sort());
  }
  const removedValue = clone(live);
  removedValue.fields[enumFieldId].enumVocabulary.pop();
  const findings = compareRegistryDrift(removedValue, live);
  assert.ok(findings.some((f) => f.kind === 'FIELD_CHANGED' && f.subject === enumFieldId && /enumVocabulary/.test(f.detail)));
});

test('a real change to the Prisma datamodel (not a hand-edited snapshot) surfaces as drift against the committed snapshot', () => {
  const { Prisma } = require('@prisma/client');
  const entityModel = Object.values(committed.entities)[0].prismaModel;
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === entityModel);
  const column = model.fields.find((f) => f.kind === 'scalar');
  const original = column.type;
  column.type = 'TotallyDifferentType';
  try {
    const findings = compareRegistryDrift(committed, buildRegistryDriftSnapshot());
    assert.ok(findings.some((f) => f.kind === 'ENTITY_CHANGED' && /schemaColumns/.test(f.detail)), 'a column type change behind a registered entity must be reported');
  } finally {
    column.type = original;
  }
  assert.deepEqual(compareRegistryDrift(committed, buildRegistryDriftSnapshot()), []);
});

test('added and removed registered entities, fields and a new schema column are all reported', () => {
  const live = buildRegistryDriftSnapshot();

  const lessFields = clone(live);
  const droppedField = Object.keys(lessFields.fields)[0];
  delete lessFields.fields[droppedField];
  assert.ok(compareRegistryDrift(lessFields, live).some((f) => f.kind === 'FIELD_ADDED' && f.subject === droppedField));

  const extraEntity = clone(live);
  extraEntity.entities['entity.ghost'] = { prismaModel: 'Ghost', domainId: 'domain.inventory', supportedFieldIds: [], supportedRelationIds: [], schemaColumns: [] };
  assert.ok(compareRegistryDrift(extraEntity, live).some((f) => f.kind === 'ENTITY_REMOVED' && f.subject === 'entity.ghost'));

  const newColumn = clone(live);
  const entityId = Object.keys(newColumn.entities)[0];
  newColumn.entities[entityId].schemaColumns = newColumn.entities[entityId].schemaColumns.slice(1);
  const hit = compareRegistryDrift(newColumn, live).find((f) => f.kind === 'ENTITY_CHANGED' && f.subject === entityId);
  assert.ok(hit);
  assert.match(hit.detail, /schemaColumns/);
});

test('a lexicon change and a changed domain set or relation path set are reported', () => {
  const live = buildRegistryDriftSnapshot();
  const lexicon = clone(live);
  lexicon.lexicon.digest = 'stale';
  assert.ok(compareRegistryDrift(lexicon, live).some((f) => f.kind === 'LEXICON_CHANGED'));

  const domains = clone(live);
  domains.domains = domains.domains.slice(1);
  assert.ok(compareRegistryDrift(domains, live).some((f) => f.kind === 'DOMAIN_SET_CHANGED'));

  const paths = clone(live);
  paths.relationPaths = paths.relationPaths.slice(1);
  assert.ok(compareRegistryDrift(paths, live).some((f) => f.kind === 'RELATION_PATHS_CHANGED'));
});
