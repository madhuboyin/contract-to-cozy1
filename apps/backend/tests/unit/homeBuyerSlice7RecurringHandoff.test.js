const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  assertBuyerJourneyStageTransition,
  canTransitionBuyerJourneyStage,
} = require('../../src/productFramework/buyerJourneyLifecycle.contract.ts');

const backendRoot = path.resolve(__dirname, '../..');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerAcquisition.service.ts'), 'utf8');
const handoff = service.slice(service.indexOf('static async ensureRecurringHandoff'));
const client = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/lib/api/client.ts'), 'utf8');
const page = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');

test('day-91 handoff is gated by explicit persisted ownership rather than a scheduled date', () => {
  assert.match(handoff, /if \(!plan\.ownershipStartedAt/);
  assert.match(handoff, /reason: 'OWNERSHIP_NOT_CONFIRMED'/);
  assert.match(handoff, /plan\.ownershipStartedAt\.getTime\(\) \+ 90 \* DAY_MS/);
  assert.doesNotMatch(handoff, /ownershipStartedAt \?\? plan\.targetCloseDate/);
});

test('unresolved pre-close work blocks handoff without mutating or losing it', () => {
  assert.match(handoff, /homeBuyerTask\.count/);
  assert.match(handoff, /phase: \{ in: \['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP'\] \}/);
  assert.match(handoff, /reason: 'STRANDED_PRE_CLOSE_WORK'/);
  assert.match(client, /strandedTaskCount: number/);
  assert.match(page, /Resolve before handoff/);
  assert.match(page, /Not needed after close/);
});

test('post-close stages can make the terminal handoff transition', () => {
  for (const stage of ['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90']) {
    assert.equal(canTransitionBuyerJourneyStage(stage, 'HANDED_OFF'), true);
    assert.doesNotThrow(() => assertBuyerJourneyStageTransition(stage, 'HANDED_OFF'));
  }
  assert.equal(canTransitionBuyerJourneyStage('CLOSING_PREP', 'HANDED_OFF'), false);
});

test('handoff atomically claims the journey, materializes ownership work, and establishes the owner', () => {
  assert.match(handoff, /homeBuyerChecklist\.updateMany/);
  assert.match(handoff, /status: 'HANDED_OFF'/);
  assert.match(handoff, /stage: 'HANDED_OFF'/);
  assert.match(handoff, /completedAt: now/);
  assert.match(handoff, /BUYER_HANDOFF_TRANSITION_CONFLICT/);
  assert.match(handoff, /phase: \{ in: \['MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'\] \}/);
  assert.match(handoff, /ownershipState: 'ESTABLISHED_OWNER'/);
});
