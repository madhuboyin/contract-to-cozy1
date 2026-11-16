const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { groundedReadVerdict } = require('../../src/services/ask/support/provisionalRead.ts');

function semanticWarrantyResult(question, projection) {
  const plan = parseDeterministicSemanticRequest(question);
  assert.equal(plan.outcome, 'MATCH');
  const agreement = { facet: plan.facets[0] };
  const answerVariantId = 'phase2a-inventory-summary';
  const count = 2;
  return {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY', id: answerVariantId,
      title: projection === 'COUNT' ? `${count} items have no linked warranty record` : 'Items without a warranty record',
      body: projection === 'COUNT' ? `Confirmed count: ${count} matching items.` : 'Dishwasher and furnace have no linked warranty record.',
      tone: 'DEFAULT', actions: [],
    }],
    suggestions: [],
    parameters: {
      semanticExecutionReceipt: {
        schemaVersion: '1.0.0', planVersion: '1.4.0', facetId: agreement.facet.id,
        requestClass: 'DATA_QUERY', target: { entityId: 'entity.inventory_item', operationAdapter: 'phase2a-slice-executor' },
        projection, predicateIds: [agreement.facet.relations[0].predicateId], resolvedRecordIds: ['item-1', 'item-2'],
        population: { confirmedCount: count, conflictedCount: 0, unknownCount: 0, totalMatchCount: count, displayedCount: projection === 'COUNT' ? 0 : count, truncated: projection === 'COUNT' },
        authorization: { propertyId: 'p1', role: 'OWNER', decision: 'ALLOWED' },
        provenance: { sourceType: 'PROPERTY_INVENTORY_AND_RELATIONS', observedAt: '2026-11-15T00:00:00.000Z' },
        answerVariantId,
      },
    },
  };
}

test('semantic warranty COUNT and DETAIL receipts pass provisional delivery without the legacy query-template marker', () => {
  const countQuestion = 'how many appliances are not having warranty';
  const detailQuestion = 'provide details of all items without warranty';
  assert.deepEqual(groundedReadVerdict(countQuestion, semanticWarrantyResult(countQuestion, 'COUNT')), {
    outcome: 'PASS', reasonCodes: ['PROVISIONAL_READ_GROUNDED'],
  });
  assert.deepEqual(groundedReadVerdict(detailQuestion, semanticWarrantyResult(detailQuestion, 'DETAIL')), {
    outcome: 'PASS', reasonCodes: ['PROVISIONAL_READ_GROUNDED'],
  });
});

test('semantic warranty delivery still fails closed when the answer variant is missing', () => {
  const question = 'how many appliances are not having warranty';
  const result = semanticWarrantyResult(question, 'COUNT');
  result.blocks[0].id = 'wrong-answer-variant';
  assert.deepEqual(groundedReadVerdict(question, result).reasonCodes, [
    'PROVISIONAL_READ_NOT_GROUNDED', 'SEMANTIC_RECEIPT_NOT_ENTAILED', 'ANSWER_VARIANT_MISSING',
  ]);
});
