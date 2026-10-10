const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Confirmation receipts used to end with an "Open <page>" button to a desktop page. Ask never links out (FRD v1.248), so each receipt now offers an
// ordinary question that opens the same record inside Ask. These tests prove those questions land on the right answer, and that no receipt
// producer goes back to building a link.
const { RECEIPT_FOLLOW_UPS, receiptFollowUpAction, isReceiptFollowUpAction } = require('../../src/services/ask/support/receiptFollowUps.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

test('every receipt follow-up question routes deterministically to the in-Ask answer it names', () => {
  for (const [key, { message, operationId }] of Object.entries(RECEIPT_FOLLOW_UPS)) {
    assert.ok(ASK_OPERATION_DEFINITIONS[operationId], `${key}: ${operationId} is a registered operation`);
    assert.equal(ASK_OPERATION_DEFINITIONS[operationId].messageRoutable, true, `${key}: the destination can be reached by a message`);
    assert.equal(resolveAskOperation(message).operationId, operationId, `${key}: "${message}"`);
  }
});

const RECEIPT_PRODUCERS = [
  'handlers/recordConfirm.handler.ts', 'handlers/maintenanceConfirm.handler.ts', 'handlers/buyerConfirm.handler.ts', 'handlers/captureConfirm.handler.ts',
  'handlers/radarConfirm.handler.ts', 'handlers/workflowConfirm.handler.ts', 'support/capture.ts',
];

test('the confirmation receipt producers build no "Open <page>" action and no desktop navigation', () => {
  for (const file of RECEIPT_PRODUCERS) {
    const source = readFileSync(resolve(__dirname, '../../src/services/ask', file), 'utf8');
    assert.doesNotMatch(source, /id: 'open-[a-z-]+'/, `${file} still builds an open-* link action`);
    assert.doesNotMatch(source, /navigation: \{ label: 'Open/, `${file} still builds a desktop navigation`);
  }
});

test('the receipts that name a record offer the follow-up for that record', () => {
  const expectations = [
    ['handlers/recordConfirm.handler.ts', ['TIMELINE', 'WARRANTIES', 'ROOMS', 'DOCUMENTS', 'HOME_ACTIONS']],
    ['handlers/maintenanceConfirm.handler.ts', ['MAINTENANCE']],
    ['handlers/buyerConfirm.handler.ts', ['BUYER_PLAN', 'BUYER_INSPECTION']],
    ['handlers/captureConfirm.handler.ts', ['PROPERTY_RECORD', 'TIMELINE', 'WARRANTIES']],
    ['handlers/workflowConfirm.handler.ts', ['CLAIMS', 'INSPECTION_FINDINGS', 'RECALLS', 'SELLER_PREP', 'GUIDED_PLANS', 'QUOTES']],
    ['handlers/homeEventRadar.handler.ts', ['RADAR']],
    ['support/capture.ts', ['TIMELINE']],
  ];
  for (const [file, keys] of expectations) {
    const source = readFileSync(resolve(__dirname, '../../src/services/ask', file), 'utf8');
    for (const key of keys) assert.match(source, new RegExp(`receiptFollowUpAction\\('${key}'\\)`), `${file} offers ${key}`);
  }
});

test('a receipt follow-up is a typed in-Ask action: it carries no href, matches exactly, and any change to it is refused', () => {
  for (const key of Object.keys(RECEIPT_FOLLOW_UPS)) {
    const action = receiptFollowUpAction(key);
    assert.equal(action.interactionType, 'START_WORKFLOW');
    assert.equal(action.href, undefined);
    assert.equal(isReceiptFollowUpAction(action), true, key);
    assert.equal(isReceiptFollowUpAction({ ...action, operationId: 'ROOM_CREATE' }), false, `${key}: another operation`);
    assert.equal(isReceiptFollowUpAction({ ...action, message: 'Add a room to my home record.' }), false, `${key}: another message`);
    assert.equal(isReceiptFollowUpAction({ ...action, href: '/dashboard/x' }), false, `${key}: a link`);
  }
  assert.equal(isReceiptFollowUpAction({ id: 'receipt-show-timeline', label: 'x', interactionType: 'START_WORKFLOW', message: 'Show my home timeline', operationId: 'HOME_TIMELINE_EVENTS' }), false, 'label is part of the match');
});

test('the answer checker keeps a receipt\'s follow-up on any confirmed operation, and still removes a link and an unrelated action', () => {
  const receipt = (actions) => ({
    status: 'COMPLETED', reasonCode: 'ROOM_RENAMED', suggestions: [],
    parameters: { audiencePresentation: { householdRole: 'OWNER' } },
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'room-renamed-1', title: 'Room renamed', status: 'COMPLETED', description: 'Done.', details: [], actions }],
  });
  const check = (actions) => validateAskAnswerTrust({
    question: 'Rename this room', operationId: 'ROOM_RENAME', propertyId: 'p1',
    result: attachAskAuthoritativeSourceEvidence(receipt(actions), [completedAskAuthoritativeSourceEvidence('ROOM_RENAME')]),
  }).result.blocks[0].actions.map((action) => action.id);
  assert.deepEqual(check([receiptFollowUpAction('ROOMS')]), ['receipt-show-rooms']);
  assert.deepEqual(check([receiptFollowUpAction('ROOMS'), { id: 'open-rooms', label: 'Open Rooms', href: '/dashboard/properties/p1/rooms', style: 'PRIMARY' }]), ['receipt-show-rooms']);
  assert.deepEqual(check([{ ...receiptFollowUpAction('ROOMS'), message: 'Delete everything.' }]), [], 'a tampered follow-up is not trusted');
});
