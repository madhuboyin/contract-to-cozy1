const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §19's "not every
// scalar fact goes through capturePropertyFact" finding). Same
// source-governance convention as captureConfirmWriteSafety.test.js --
// capturePropertyFact.ts/getPropertyContext.ts (this writer's own template
// and read-back dependency) have no runtime DB-mocked test anywhere in this
// codebase; this file follows that established precedent rather than
// inventing a one-off runtime mock for this one writer.
const writerSource = readFileSync(resolve(__dirname, '../../src/modules/propertyContext/application/capturePropertyFinancingFact.ts'), 'utf8');
const orchestratorSource = readAskOrchestratorSources();

test('capturePropertyFinancingFact creates the idempotency-gating PropertyFactEvidence row as the transaction\'s first statement', () => {
  const txIdx = writerSource.indexOf('await prisma.$transaction(async (tx) => {');
  assert.ok(txIdx > 0);
  const firstStatementIdx = writerSource.indexOf('const evidence = await tx.propertyFactEvidence.create(', txIdx);
  const supersedeIdx = writerSource.indexOf('await tx.propertyFactEvidence.updateMany(', txIdx);
  const upsertIdx = writerSource.indexOf('await tx.propertyFinancingProfile.upsert(', txIdx);
  assert.ok(firstStatementIdx > txIdx, 'expected the evidence create to be inside the transaction');
  assert.ok(firstStatementIdx < supersedeIdx, 'the evidence create must run before the supersession updateMany');
  assert.ok(supersedeIdx < upsertIdx, 'supersession must run before the canonical PropertyFinancingProfile upsert');
});

test('the supersession updateMany excludes the row the same transaction just created', () => {
  const idx = writerSource.indexOf('await tx.propertyFactEvidence.updateMany(');
  assert.ok(idx > 0);
  const block = writerSource.slice(idx, writerSource.indexOf(');', idx));
  assert.match(block, /id: \{ not: evidence\.id \}/, 'missing the id exclusion clause -- without it this blanket updateMany would immediately re-supersede its own new row');
});

test('duplicate-key recovery is an outer catch around the whole transaction, never a retry of steps 2-4', () => {
  const catchIdx = writerSource.indexOf('} catch (error) {');
  assert.ok(catchIdx > 0);
  const catchBlock = writerSource.slice(catchIdx, writerSource.indexOf('propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: FINANCING_CAPTURE_FACT_KEY, outcome: \'error\' });', catchIdx));
  assert.match(catchBlock, /error\.code === 'P2002'/);
  assert.match(catchBlock, /prisma\.propertyFactEvidence\.findFirst\(\{\s*where: \{ propertyId, factKey: FINANCING_CAPTURE_FACT_KEY, captureExecutionId: input\.captureExecutionId \}/);
  // Recovery must return the original attempt's row, never call the upsert
  // again for a replay.
  assert.doesNotMatch(catchBlock, /propertyFinancingProfile\.upsert/);
});

test('the input schema takes a percent value (e.g. 6.75), not basis points, and bounds it to a sane 0-100 range', () => {
  assert.match(writerSource, /value: z\.number\(\)\.min\(0\)\.max\(100\)/);
});

test('normalization rounds percent to basis points (6.75 -> 675)', () => {
  assert.match(writerSource, /const interestRateBps = Math\.round\(input\.value \* 100\);/);
});

test('non-firsthand attribution (THIRD_PARTY_RELAYED/INFERRED) does not get the firsthand verifiedAt/confidence:0.9 treatment, mirroring capturePropertyFact\'s FRD §19 rule', () => {
  const createIdx = writerSource.indexOf('const evidence = await tx.propertyFactEvidence.create(');
  const createBlock = writerSource.slice(createIdx, writerSource.indexOf('});', createIdx));
  assert.match(createBlock, /verifiedAt: nonFirsthand \? null :/);
  assert.match(createBlock, /confidence: input\.confidence \?\? \(nonFirsthand \? NON_FIRSTHAND_CONFIDENCE :/);
});

test('confirmCaptureFact routes financial.currentMortgage to capturePropertyFinancingFact instead of the generic writer', () => {
  const idx = orchestratorSource.indexOf('async function confirmCaptureFact(');
  assert.ok(idx > 0);
  const body = orchestratorSource.slice(idx, orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.fact.confirm\'', idx));
  assert.match(body, /if \(factKey === FINANCING_CAPTURE_FACT_KEY\) \{/);
  assert.match(body, /capturePropertyFinancingFact\(execution\.propertyId, userId, \{/);
  // The idempotency key must still be this execution's own id, same
  // requirement as the generic path.
  const branchIdx = body.indexOf('if (factKey === FINANCING_CAPTURE_FACT_KEY) {');
  const branchBlock = body.slice(branchIdx, body.indexOf('} else {', branchIdx));
  assert.match(branchBlock, /captureExecutionId: execution\.id/);
});
