const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §23). Governance
// tests for the GroundedAskProposal -> target-operation mapping, matching
// this codebase's established convention for this class of code (see
// captureConfirmWriteSafety.test.js).
const source = readFileSync(resolve(__dirname, '../../src/services/groundedAsk.service.ts'), 'utf8');

test('ADD_FACT/CORRECT_FACT get the same captureExecutionId idempotency CAPTURE_FACT_CONFIRM has (FRD §23: "Full ... with the added attribution/idempotency correctness")', () => {
  const idx = source.indexOf("if (proposal.kind === 'ADD_FACT' || proposal.kind === 'CORRECT_FACT')");
  assert.ok(idx > 0);
  const block = source.slice(idx, source.indexOf("if (proposal.kind === 'START_JOURNEY')", idx));
  assert.match(block, /attribution: 'FIRSTHAND'/);
  assert.match(block, /captureExecutionId: proposal\.id/);
});

test('CREATE_TASK/START_JOURNEY/COMPARE_OPTIONS remain exact matches with their target operations (FRD §23) -- same underlying write, not reimplemented', () => {
  // Verified by inspection against confirmMaintenanceTaskCreate/
  // confirmGuidanceJourneyCreate/confirmQuoteComparisonCreate in
  // askOrchestrator.service.ts: same target table/service call either way.
  // Left as-is deliberately (Implementation Principle #5 -- no unnecessary
  // rewrite of already-correct, already-working code) rather than routed
  // through the new confirm registry, since GroundedAskProposal has its own,
  // separate claim/idempotency mechanism (the updateMany PENDING->CONFIRMED
  // pattern below) and no AskExecution row to drive through
  // confirmCapabilityInvoke.
  assert.match(source, /guidanceJourneyService\.createUserInitiatedJourney/);
  assert.match(source, /tx\.quoteComparisonWorkspace\.create/);
  assert.match(source, /tx\.propertyMaintenanceTask\.upsert/);
});

test('UPLOAD_EVIDENCE remains an open gap, not a forced/fake mapping (Phase 0 decision: needs a sibling HomeEvent candidate in the same extraction batch, which GroundedAskProposal -- a single, standalone proposal -- structurally cannot provide)', () => {
  const idx = source.indexOf("if (proposal.kind === 'UPLOAD_EVIDENCE')");
  assert.ok(idx > 0);
  const block = source.slice(idx, idx + 400);
  assert.match(block, /tx\.document\.findFirst/);
  assert.doesNotMatch(block, /HomeEventEvidence|homeEventEvidence/);
});

test('ADD_NOTE with a property creates a real, queryable HomeEvent (type: NOTE) instead of only artifactJson text (FRD §23\'s original finding)', () => {
  const idx = source.indexOf("if (proposal.kind === 'ADD_NOTE' && proposal.propertyId)");
  assert.ok(idx > 0);
  const block = source.slice(idx, source.indexOf('return prisma.$transaction(async (tx) => {', idx));
  assert.match(block, /homeEventsServiceForCapture\.createHomeEvent/);
  assert.match(block, /type: 'NOTE'/);
  assert.match(block, /datePrecision: 'UNKNOWN'/);
  assert.match(block, /idempotencyKey: proposal\.id/);
  // Claim-then-write-then-catch-revert -- the same pattern ADD_FACT/
  // CORRECT_FACT and START_JOURNEY already use, required here because
  // HomeEventsService uses the global prisma client and can't join the
  // catch-all block's transaction.
  const claimIdx = block.indexOf('groundedAskProposal.updateMany');
  const writeIdx = block.indexOf('homeEventsServiceForCapture.createHomeEvent');
  const catchIdx = block.indexOf('} catch (error) {');
  assert.ok(claimIdx > 0 && claimIdx < writeIdx && writeIdx < catchIdx);
  assert.match(block.slice(catchIdx), /status: 'PENDING', confirmedAt: null/);
});

test('a property-less ADD_NOTE proposal (still schema-valid) falls back to the original artifactJson-only path unchanged, rather than failing outright', () => {
  const guardIdx = source.indexOf("if (proposal.kind === 'ADD_NOTE' && proposal.propertyId)");
  const fallbackIdx = source.indexOf("note: proposal.kind === 'ADD_NOTE' ? String(payload.note) : undefined,");
  assert.ok(guardIdx > 0 && fallbackIdx > guardIdx, 'the original artifactJson-only ADD_NOTE handling must still exist, after the new propertyId-gated block');
});
