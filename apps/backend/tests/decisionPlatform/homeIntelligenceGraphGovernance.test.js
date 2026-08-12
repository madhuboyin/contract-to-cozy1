const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  HOME_INTELLIGENCE_GRAPH_EDGES,
  validateHomeIntelligenceGraphEdges,
} = require('../../src/services/decisionPlatform/homeIntelligenceGraph.ts');

// This is a governance/source-shape test, not a DB integration test (there is
// no test database — see docs/product/decision-platform/README.md), mirroring
// decisionThreadServiceGovernance.test.js's pattern.

const source = readFileSync(resolve(__dirname, '../../src/services/decisionPlatform/homeIntelligenceGraph.ts'), 'utf8');

test('every HomeIntelligenceGraphEdge is complete and internally consistent (FRD §15.2)', () => {
  assert.deepEqual(validateHomeIntelligenceGraphEdges(), []);
  assert.deepEqual(Object.keys(HOME_INTELLIGENCE_GRAPH_EDGES).sort(), [
    'DECISION_THREAD_FACT_REFERENCE',
    'DECISION_THREAD_PRIMARY_ENTITY',
    'INVENTORY_ITEM_WARRANTY_AND_FUTURE_EXPENSE',
    'RECOMMENDATION_SNAPSHOT_FACT_LINEAGE',
  ]);
  for (const [key, edgeDef] of Object.entries(HOME_INTELLIGENCE_GRAPH_EDGES)) {
    assert.equal(edgeDef.edgeType, key);
    assert.ok(edgeDef.sourceEntityType);
    assert.ok(edgeDef.targetEntityType);
    assert.ok(edgeDef.canonicalSourceOwner);
    assert.ok(['DIRECT_FOREIGN_KEY', 'POLYMORPHIC_REFERENCE', 'JSON_LINEAGE_SCAN'].includes(edgeDef.derivationMethod));
    assert.ok(['FORWARD', 'BIDIRECTIONAL'].includes(edgeDef.direction));
  }
});

// FRD §15.2: every read function is defense-in-depth scoped by propertyId,
// even though every caller is already authorized upstream. Asserts each
// exported read function's Prisma `where` clause includes `propertyId` in
// the same block, without a live DB.
function functionBody(text, functionName) {
  const start = text.indexOf(`export async function ${functionName}(`);
  assert.ok(start >= 0, `expected to find export async function ${functionName}(`);
  const bodyStart = text.indexOf('{', text.indexOf(')', start));
  let depth = 0;
  for (let i = bodyStart; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading body of ${functionName}`);
}

test('every graph read function takes propertyId first and scopes every Prisma where clause with it', () => {
  for (const functionName of [
    'getFactReferencesForItem',
    'getDecisionThreadsForItem',
    'getSnapshotsReferencingFact',
    'getWarrantyAndFutureExpenseForItem',
  ]) {
    const signatureMatch = source.match(new RegExp(`export async function ${functionName}\\(\\s*propertyId: string`));
    assert.ok(signatureMatch, `${functionName} must take propertyId as its first parameter`);

    const body = functionBody(source, functionName);
    const whereBlocks = [...body.matchAll(/where:\s*\{/g)];
    assert.ok(whereBlocks.length > 0, `${functionName} has no Prisma where clause`);
    for (const match of whereBlocks) {
      const blockEnd = body.indexOf('\n      },', match.index);
      const windowEnd = blockEnd > match.index ? blockEnd : body.indexOf('},', match.index);
      const block = body.slice(match.index, windowEnd > match.index ? windowEnd : match.index + 200);
      assert.match(block, /propertyId/, `${functionName} has a where clause that does not reference propertyId: ${block}`);
    }
  }
});

test('getSnapshotsReferencingFact scopes its Json-containment query by propertyId, not just the fact identifiers', () => {
  const body = functionBody(source, 'getSnapshotsReferencingFact');
  assert.match(body, /propertyId,/);
  assert.match(body, /array_contains/);
});

test('getWarrantyAndFutureExpenseForItem documents both link kinds as optional (may be empty), not asserted present', () => {
  const body = functionBody(source, 'getWarrantyAndFutureExpenseForItem');
  assert.match(body, /\?\?\s*null/);
  assert.match(body, /\?\?\s*\[\]/);
});
