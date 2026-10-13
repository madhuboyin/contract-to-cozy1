const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  canTransitionServiceQuoteDecision,
} = require('../../src/services/serviceQuoteDecisionTransitions.ts');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('allows explicit forward stages and bounded negotiation loops', () => {
  assert.equal(canTransitionServiceQuoteDecision('QUOTE_INTAKE', 'SCOPE_REVIEW'), true);
  assert.equal(canTransitionServiceQuoteDecision('COMPARISON', 'NEGOTIATION'), true);
  assert.equal(canTransitionServiceQuoteDecision('NEGOTIATION', 'COMPARISON'), true);
  assert.equal(canTransitionServiceQuoteDecision('FINALIZATION', 'BOOKING'), true);
  assert.equal(canTransitionServiceQuoteDecision('BOOKING', 'COMPLETED'), true);
});

test('does not allow a closed decision to reopen or a booking to return to intake', () => {
  assert.equal(canTransitionServiceQuoteDecision('CLOSED', 'QUOTE_INTAKE'), false);
  assert.equal(canTransitionServiceQuoteDecision('BOOKING', 'QUOTE_INTAKE'), false);
  assert.equal(canTransitionServiceQuoteDecision('FINALIZATION', 'SCOPE_REVIEW'), false);
});

test('schema uses one durable identity for negotiation, finalization, and booking', () => {
  const schema = source('../../prisma/schema.prisma');

  assert.match(schema, /journeyStage\s+ServiceQuoteDecisionStage/);
  assert.match(schema, /model ServiceQuoteDecisionTransition\s*\{/);
  assert.match(schema, /model ServiceQuoteDecisionContextLink\s*\{/);
  assert.match(schema, /quoteDecisionWorkspaceId String\?\s+@unique/);
  assert.match(schema, /quoteComparisonWorkspaceId String\? @unique/);
  assert.match(schema, /selectedQuoteId\s+String\?\s+@unique/);
});

test('linked records, not manual status claims, advance material stages', () => {
  const quoteService = source('../../src/services/quoteComparison.service.ts');
  const negotiation = source('../../src/services/negotiationShield.service.ts');
  const finalization = source('../../src/services/priceFinalization.service.ts');
  const booking = source('../../src/services/booking.service.ts');

  assert.match(quoteService, /SERVICE_QUOTE_MANUAL_TRANSITION_NOT_ALLOWED/);
  assert.match(negotiation, /toStage: 'NEGOTIATION'/);
  assert.match(finalization, /toStage: 'FINALIZATION'/);
  assert.match(finalization, /toStage: 'BOOKING'/);
  assert.match(booking, /toStage: 'SCHEDULED'/);
  assert.match(booking, /toStage: 'COMPLETED'/);
});

test('meaningful terminal stages create idempotent home-timeline events', () => {
  const journey = source('../../src/services/serviceQuoteDecisionJourney.service.ts');

  assert.match(journey, /SERVICE_QUOTE_DECISION_ACCEPTED/);
  assert.match(journey, /SERVICE_QUOTE_BOOKED/);
  assert.match(journey, /SERVICE_QUOTE_WORK_COMPLETED/);
  assert.match(journey, /idempotencyKey = `service-quote-decision:/);
});

test('canonical property page presents the unified decision journey', () => {
  const client = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonWorkspaceClient.tsx',
  );

  assert.match(client, /title="Service Quote Decision"/);
  assert.match(client, /One workspace identity is preserved across every stage/);
  assert.match(client, /Prepare negotiation/);
  assert.match(client, /Prepare final terms/);
  assert.match(client, /Defer decision/);
  assert.doesNotMatch(client, /Recommended quote/);
});

// Slice 1b of the Quote Comparison Home Record import design: the advance can run on a transaction the caller owns, behaviour unchanged.
const { prisma } = require('../../src/lib/prisma.ts');
const journey = require('../../src/services/serviceQuoteDecisionJourney.service.ts');
const analytics = require('../../src/services/serviceQuoteDecisionAnalytics.service.ts');

function fakeTx(workspace) {
  const writes = [];
  const state = { ...workspace };
  const tx = {
    quoteComparisonWorkspace: {
      findFirst: async () => state,
      update: async (args) => { writes.push(['workspace.update', args.data.journeyStage]); state.journeyStage = args.data.journeyStage; return state; },
      findUnique: async () => ({ ...state, transitions: [], contextLinks: [] }),
    },
    serviceQuoteDecisionTransition: { create: async (args) => { writes.push(['transition', args.data.fromStage, args.data.toStage]); return {}; } },
    serviceQuoteDecisionContextLink: { upsert: async (args) => { writes.push(['link', args.create.entityType, args.create.entityId]); return {}; } },
    homeEvent: { findFirst: async () => null, create: async () => ({}) },
  };
  return { tx, writes };
}
const base = { id: 'ws-1', journeyStage: 'SCOPE_REVIEW', outcome: 'OPEN', inventoryItemId: null, guidanceJourneyId: null };
const input = { propertyId: 'prop-1', workspaceId: 'ws-1', actorUserId: 'u1', toStage: 'COMPARISON', reason: 'x' };

test('the in-transaction advance writes on the caller\'s transaction, opens none of its own and emits no analytics', async () => {
  const { tx, writes } = fakeTx(base);
  const savedTx = prisma.$transaction; const savedEmit = analytics.emitServiceQuoteDecisionAnalytics;
  let opened = 0; const emitted = [];
  prisma.$transaction = async () => { opened += 1; throw new Error('must not open a transaction'); };
  analytics.emitServiceQuoteDecisionAnalytics = (event) => emitted.push(event);
  try {
    const out = await journey.advanceServiceQuoteDecisionInTransaction(tx, { ...input, relatedEntityType: 'DOCUMENT', relatedEntityId: 'doc-1' });
    assert.equal(out.transitionRecorded, true);
    assert.deepEqual(writes, [['workspace.update', 'COMPARISON'], ['transition', 'SCOPE_REVIEW', 'COMPARISON'], ['link', 'DOCUMENT', 'doc-1']]);
    assert.equal(opened, 0);
    assert.equal(emitted.length, 0, 'analytics wait for the caller\'s commit');
    journey.emitServiceQuoteDecisionAdvanceAnalytics(input, out.result, out.transitionRecorded);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].eventName, analytics.ServiceQuoteDecisionEvent.COMPARISON_REACHED);
  } finally { prisma.$transaction = savedTx; analytics.emitServiceQuoteDecisionAnalytics = savedEmit; }
});

test('the exported advance still runs in one transaction and emits analytics once, after it', async () => {
  const { tx, writes } = fakeTx(base);
  const savedTx = prisma.$transaction; const savedEmit = analytics.emitServiceQuoteDecisionAnalytics;
  const order = [];
  prisma.$transaction = async (fn) => { order.push('transaction'); const value = await fn(tx); order.push('committed'); return value; };
  analytics.emitServiceQuoteDecisionAnalytics = () => order.push('analytics');
  try {
    const result = await journey.advanceServiceQuoteDecision(input);
    assert.equal(result.journeyStage, 'COMPARISON');
    assert.deepEqual(order, ['transaction', 'committed', 'analytics']);
    assert.equal(writes.length, 2);
  } finally { prisma.$transaction = savedTx; analytics.emitServiceQuoteDecisionAnalytics = savedEmit; }
});

test('a repeat to the same stage and outcome records nothing and emits no analytics; an invalid move throws before any write', async () => {
  let fake = fakeTx({ ...base, journeyStage: 'COMPARISON' });
  const same = await journey.advanceServiceQuoteDecisionInTransaction(fake.tx, input);
  assert.equal(same.transitionRecorded, false);
  assert.equal(fake.writes.length, 0);
  fake = fakeTx({ ...base, journeyStage: 'CLOSED', outcome: 'DECLINED' });
  await assert.rejects(() => journey.advanceServiceQuoteDecisionInTransaction(fake.tx, { ...input, toStage: 'QUOTE_INTAKE' }), (e) => e.code === 'SERVICE_QUOTE_INVALID_TRANSITION');
  assert.equal(fake.writes.length, 0);
});

test('a Home Record context link is validated inside the caller\'s transaction; a record of another property or a trashed one is refused before any write', async () => {
  const { tx, writes } = fakeTx(base);
  tx.propertyRecord = { findFirst: async (args) => { writes.push(['record.check', args.where.propertyId, args.where.lifecycleStatus]); return null; } };
  await assert.rejects(
    () => journey.advanceServiceQuoteDecisionInTransaction(tx, { ...input, relatedEntityType: 'HOME_RECORD', relatedEntityId: 'rec-x' }),
    (e) => e.code === 'SERVICE_QUOTE_CONTEXT_SCOPE_MISMATCH',
  );
  assert.deepEqual(writes.find(([k]) => k === 'record.check'), ['record.check', 'prop-1', { not: 'TRASHED' }]);
  const ok = fakeTx(base);
  ok.tx.propertyRecord = { findFirst: async () => ({ id: 'rec-1' }) };
  await journey.advanceServiceQuoteDecisionInTransaction(ok.tx, { ...input, relatedEntityType: 'HOME_RECORD', relatedEntityId: 'rec-1' });
  assert.deepEqual(ok.writes.find(([k]) => k === 'link'), ['link', 'HOME_RECORD', 'rec-1']);
});
