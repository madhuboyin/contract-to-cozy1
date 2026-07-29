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
