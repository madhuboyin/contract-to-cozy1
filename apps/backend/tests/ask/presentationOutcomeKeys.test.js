require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { RECEIPT_FOLLOW_UPS, RECEIPT_FOLLOW_UP_OUTCOME_KEYS, receiptFollowUpAction } = require('../../src/services/ask/support/receiptFollowUps.ts');
const { isRegisteredOutcome } = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { collectPresentationIdentities } = require('../../src/services/ask/suggestedActions/suggestedNextActionPresentationIdentities.ts');
const { suggestedNextActionSemanticKey } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { diyTemplateBrowseFromItems } = require('../../src/services/ask/handlers/diyProjectStart.handler.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const template = (over = {}) => ({
  id: 't1', title: 'Repaint a hallway', shortDescription: 'Paint the walls and trim.', category: 'PAINTING', difficultyLevel: 'EASY', estimatedMinutes: 120, safetyLevel: 'LOW',
  revisionId: 'r1', stepCount: 4, toolCount: 3, openProjectId: null, ...over,
});

test('every receipt button either publishes a registered outcome for its own destination or is explicitly presentation-only', () => {
  for (const key of Object.keys(RECEIPT_FOLLOW_UPS)) {
    const action = receiptFollowUpAction(key);
    const outcomeKey = RECEIPT_FOLLOW_UP_OUTCOME_KEYS[key];
    if (!outcomeKey) { assert.equal(action.outcomeKey, undefined, `${key}: presentation-only`); continue; }
    assert.equal(action.outcomeKey, outcomeKey, key);
    assert.ok(isRegisteredOutcome(action.operationId, outcomeKey), `${key}: ${action.operationId}:${outcomeKey} is not a registered outcome`);
  }
  for (const key of Object.keys(RECEIPT_FOLLOW_UP_OUTCOME_KEYS)) assert.ok(key in RECEIPT_FOLLOW_UPS, `${key}: outcome mapping outlived the receipt entry`);
});

test('a receipt button now publishes the identity that suppresses its equivalent compact chip', () => {
  const block = { type: 'WORKFLOW_PROGRESS', id: 'receipt', actions: [receiptFollowUpAction('WARRANTIES')] };
  const identities = collectPresentationIdentities([block], PROPERTY);
  assert.ok(identities.has(suggestedNextActionSemanticKey({ operationId: 'WARRANTY_LOOKUP', interactionType: 'START_WORKFLOW', propertyId: PROPERTY, entityType: null, entityId: null, outcomeKey: 'REVIEW_WARRANTIES' })));
  // Without an outcomeKey the same button published nothing.
  const bare = { ...receiptFollowUpAction('WARRANTIES') }; delete bare.outcomeKey;
  assert.equal(collectPresentationIdentities([{ ...block, actions: [bare] }], PROPERTY).size, 0);
});

test('the DIY template card\'s start action publishes the reviewed-project identity for its template', () => {
  const card = diyTemplateBrowseFromItems({ items: [template()], hasMore: false }, PROPERTY, true);
  const identities = collectPresentationIdentities(card.blocks, PROPERTY);
  const started = [...identities].filter((key) => key.includes('START_REVIEWED_PROJECT'));
  assert.equal(started.length, 1, 'the row start action must publish one identity');
  assert.ok(started[0].includes('t1'), 'bound to the template it starts');
});
