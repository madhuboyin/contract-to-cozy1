const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Owner decision D-O12 (inventory), MEASURED before deciding: how many starter destinations can a single answer's presented actions remove?
// A presentation identity is published only by an action that declares operationId + interactionType + a REGISTERED outcomeKey. This scans
// the production sources for every operation that declares such an outcome on a presented action, and compares them with the starter
// operations. It is a source scan plus the real collector, not an execution of every handler's result.

const { collectPresentationIdentities } = require('../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts');
const { suggestedNextActionSemanticKey } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { SUGGESTED_ACTION_OUTCOMES } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { seasonalHomeCareStarters } = require('../../src/services/ask/suggestedActions/starterCandidates.ts');

const ASK_DIR = path.join(__dirname, '../../src/services/ask');
const STARTER_OPERATIONS = new Set(['PROPERTY_SUMMARY', ...seasonalHomeCareStarters('p1').map((s) => s.operationId)]);

function operationsDeclaringOutcomeKeys() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!/graphify|suggestedActions/.test(entry.name)) walk(full); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(/\boutcomeKey\b\s*[:,}]/g)) {
        const segment = source.slice(Math.max(0, match.index - 500), match.index + 200);
        const ids = [...segment.matchAll(/operationId:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
        if (ids.length) found.add(ids[ids.length - 1]);
      }
    }
  };
  walk(ASK_DIR);
  return found;
}

test('response-level starter destinations declare outcomes so cross-surface duplicates can be removed', () => {
  const declaring = operationsDeclaringOutcomeKeys();
  const overlap = [...declaring].filter((operationId) => STARTER_OPERATIONS.has(operationId));
  assert.ok(overlap.includes('SEASONAL_HOME_CARE'), 'the source scan finds at least one starter operation; runtime assertions below cover both response actions without relying on source proximity');
  const blocks = [{ type: 'SUMMARY', id: 'next', actions: [
    { operationId: 'HOME_BASICS_GUIDE', outcomeKey: 'REVIEW_MONTHLY_ROUTINE', interactionType: 'START_WORKFLOW' },
    { operationId: 'SEASONAL_HOME_CARE', outcomeKey: 'REVIEW_THIS_SEASON', interactionType: 'START_WORKFLOW' },
  ] }];
  const identities = collectPresentationIdentities(blocks, 'p1');
  assert.equal(identities.size, 2);
  assert.ok(identities.has(suggestedNextActionSemanticKey({ operationId: 'HOME_BASICS_GUIDE', interactionType: 'START_WORKFLOW', propertyId: 'p1', entityType: null, entityId: null, outcomeKey: 'REVIEW_MONTHLY_ROUTINE' })));
});

test('a presented action publishes an identity only for a REGISTERED outcome: an unregistered one publishes none, and the registered starter outcomes are the only ones a future action could collide with', () => {
  const action = (operationId, outcomeKey) => [{ type: 'GROUPED_LIST', sections: [{ items: [{ id: 'i1', entityType: 'INVENTORY_ITEM', actions: [{ operationId, outcomeKey, interactionType: 'CONVERSATION_CONTINUE' }] }] }] }];
  assert.equal(collectPresentationIdentities(action('PROPERTY_SUMMARY', 'OPEN_SUMMARY'), 'p1').size, 0, 'an unregistered outcome publishes nothing');
  // PROPERTY_SUMMARY now has registered starter outcomes (D-O4), so an entity action declaring one WOULD publish an entity-scoped identity; no handler does
  // (the scan above), and an entity-scoped identity never equals an entity-less starter key.
  assert.deepEqual(SUGGESTED_ACTION_OUTCOMES.PROPERTY_SUMMARY, ['REVIEW_HOME_SUMMARY', 'REVIEW_COMPLETENESS', 'HANDOFF_REVIEW_PROPERTY']);
  assert.equal(collectPresentationIdentities(action('PROPERTY_SUMMARY', 'REVIEW_HOME_SUMMARY'), 'p1').size, 1);
});

test('the real collector with the realistic worst answer (an inventory item offering every correctable field) publishes entity identities that no starter shares', () => {
  const fields = ['ADD_PURCHASE_DATE', 'ADD_BRAND', 'ADD_MODEL', 'ADD_SERIAL_NUMBER'];
  const blocks = [{ type: 'GROUPED_LIST', sections: [{ items: [{ id: 'item-1', entityType: 'INVENTORY_ITEM', actions: fields.map((outcomeKey) => ({ operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey, interactionType: 'MUTATE_RECORD' })) }] }] }];
  const identities = collectPresentationIdentities(blocks, 'p1');
  assert.equal(identities.size, 4);
  for (const starter of seasonalHomeCareStarters('p1')) {
    const key = suggestedNextActionSemanticKey({ operationId: starter.operationId, interactionType: starter.interactionType, propertyId: 'p1', entityType: null, entityId: null, outcomeKey: starter.outcomeKey });
    assert.equal(identities.has(key), false);
  }
});
