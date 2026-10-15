const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

// Presentation Quality 5: the adoption ledger classifies every registered operation exactly once and its generated document is current.

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { buildAdoptionLedger, REVIEWED_OPERATIONS, ADOPTION_CLASSES, classifyAdoption } = require('../../src/services/ask/presentation/adoptionLedger.ts');

const LEDGER_DOC = path.resolve(__dirname, '../../../../docs/architecture/ask-cozy/presentation-audit/ASK_PRESENTATION_ADOPTION_LEDGER.md');

test('every registered operation has exactly one adoption class, and no operation is invented', () => {
  const ledger = buildAdoptionLedger();
  assert.deepEqual(ledger.map((entry) => entry.operationId).sort(), Object.keys(ASK_OPERATION_DEFINITIONS).sort());
  for (const entry of ledger) {
    assert.ok(ADOPTION_CLASSES.includes(entry.adoptionClass), entry.operationId);
    assert.ok(entry.reason.length > 20, `${entry.operationId} has no reason`);
  }
});

test('every reviewed operation is a registered operation, so evidence cannot outlive its operation', () => {
  for (const operationId of Object.keys(REVIEWED_OPERATIONS)) assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${operationId} is reviewed but not registered`);
});

test('the classes follow the registry facts they claim to', () => {
  const byId = Object.fromEntries(buildAdoptionLedger().map((entry) => [entry.operationId, entry]));
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) {
    if (REVIEWED_OPERATIONS[definition.operationId]) assert.equal(byId[definition.operationId].adoptionClass, 'ALREADY_COMPLIANT');
    else if (definition.family === 'COMMAND') {
      // Verified against what the command may emit, not its family alone.
      const mayCarryList = definition.allowedBlockTypes.some((type) => ['GROUPED_LIST', 'TABLE', 'TIMELINE', 'PRIORITY_LIST'].includes(type));
      assert.equal(byId[definition.operationId].adoptionClass, mayCarryList ? 'REQUIRES_COLLECTION_ADOPTION' : 'COMPACT_RECEIPT', definition.operationId);
    }
    else if (['UNSAFE_OR_RESTRICTED', 'OUT_OF_SCOPE'].includes(definition.family)) assert.equal(byId[definition.operationId].adoptionClass, 'NOT_APPLICABLE');
  }
  assert.throws(() => classifyAdoption('NOT_AN_OPERATION'), /Unknown Ask operation/);
});

test('the generated ledger document lists every operation under its class (regenerate with scripts/generate-ask-adoption-ledger.js)', () => {
  const doc = fs.readFileSync(LEDGER_DOC, 'utf8');
  assert.match(doc, new RegExp(`\\*\\*Operations:\\*\\* ${Object.keys(ASK_OPERATION_DEFINITIONS).length}\\b`));
  for (const entry of buildAdoptionLedger()) {
    const row = doc.split('\n').find((line) => line.startsWith(`| \`${entry.operationId}\` |`));
    assert.ok(row, `${entry.operationId} is missing from the ledger document; regenerate it`);
  }
});
