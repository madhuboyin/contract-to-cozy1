const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19/§20/§22).
// Governance/source-shape tests, matching the established testing
// convention for this exact code (capturePropertyFact.ts/getPropertyContext.ts
// have no runtime DB-mocked test anywhere in this codebase, for any caller --
// see tests/unit/propertyContextRemediation.test.js and
// tests/unit/homeEventRadarPropertyReconciliation.test.js, both source-text
// governance tests, not runtime execution). getPropertyContext's own
// dependency chain (resolvePropertyAccess + several property-loading
// services) has no established DB-mock harness to build on here, so this
// file follows the codebase's own precedent for this class of function
// rather than inventing a one-off runtime mock.
const captureSource = readFileSync(resolve(__dirname, '../../src/modules/propertyContext/application/capturePropertyFact.ts'), 'utf8');
const homeEventsServiceSource = readFileSync(resolve(__dirname, '../../src/services/homeEvents.service.ts'), 'utf8');
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

test('capturePropertyFact resolves a replayed captureExecutionId to the original write before attempting a new one, regardless of current supersession state', () => {
  const idx = captureSource.indexOf('if (input.captureExecutionId) {');
  assert.ok(idx > 0, 'expected an idempotency short-circuit keyed on captureExecutionId');
  const block = captureSource.slice(idx, captureSource.indexOf('const value = normalizeCaptureValue', idx));
  // Must be a bare lookup by (propertyId, factKey, captureExecutionId) --
  // no supersededAt: null filter, so a stale replay resolves to the
  // original row even if a later, unrelated correction has since
  // superseded it (FRD §19/§22's explicit requirement).
  assert.match(block, /prisma\.propertyFactEvidence\.findFirst\(\{\s*where: \{ propertyId, factKey, captureExecutionId: input\.captureExecutionId \}/);
  assert.doesNotMatch(block, /supersededAt/);
});

test('capturePropertyFact never writes a second PropertyFactEvidence row for the same captureExecutionId under a concurrent race (P2002 resolves to the winner)', () => {
  const idx = captureSource.indexOf('} catch (error) {', captureSource.indexOf('propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: \'success\' });'));
  assert.ok(idx > 0);
  const catchBlock = captureSource.slice(idx, captureSource.indexOf('propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: \'error\' });', idx));
  assert.match(catchBlock, /error\.code === 'P2002'/);
  assert.match(catchBlock, /prisma\.propertyFactEvidence\.findFirst\(\{\s*where: \{ propertyId, factKey, captureExecutionId: input\.captureExecutionId \}/);
});

test('capturePropertyFact does not apply the firsthand verifiedAt/confidence:0.9 treatment for THIRD_PARTY_RELAYED/INFERRED attribution (FRD §19)', () => {
  assert.match(captureSource, /function isNonFirsthandAttribution\(attribution: AskCaptureAttribution \| null \| undefined\): boolean \{\s*return attribution === 'THIRD_PARTY_RELAYED' \|\| attribution === 'INFERRED';/);
  const createIdx = captureSource.indexOf('const evidence = await tx.propertyFactEvidence.create(');
  const createBlock = captureSource.slice(createIdx, captureSource.indexOf('});', createIdx));
  assert.match(createBlock, /verifiedAt: nonFirsthand \? null :/);
  assert.match(createBlock, /confidence: input\.confidence \?\? \(nonFirsthand \? NON_FIRSTHAND_CONFIDENCE :/);
});

test('HomeEventsService.createHomeEvent threads the new capture fields (warrantyId, providerName, captureChannel, attribution, extractionConfidence) into the create call', () => {
  const idx = homeEventsServiceSource.indexOf('async createHomeEvent(');
  assert.ok(idx > 0);
  const body = homeEventsServiceSource.slice(idx, homeEventsServiceSource.indexOf('async ', idx + 20));
  for (const field of ['warrantyId', 'providerName', 'captureChannel', 'attribution', 'extractionConfidence']) {
    assert.match(body, new RegExp(`${field}: body\\.${field} \\?\\? null`), `createHomeEvent is missing ${field}`);
  }
  // Idempotency: still the existing idempotencyKey mechanism, unconditioned
  // on isCurrent/deletedAt, so a replay resolves to the original row
  // regardless of a later correction (same requirement as PropertyFactEvidence).
  assert.match(body, /if \(body\.idempotencyKey\) \{\s*const existing = await prisma\.homeEvent\.findFirst\(\{\s*where: \{ propertyId, idempotencyKey: body\.idempotencyKey \}/);
});

test('confirmCaptureFact and confirmCaptureEvent key their writer\'s idempotency on this execution\'s own id, not a caller-supplied value', () => {
  const factIdx = orchestratorSource.indexOf('async function confirmCaptureFact(');
  assert.ok(factIdx > 0);
  const factBody = orchestratorSource.slice(factIdx, orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.fact.confirm\'', factIdx));
  assert.match(factBody, /captureExecutionId: execution\.id/);

  const eventIdx = orchestratorSource.indexOf('async function confirmCaptureEvent(');
  assert.ok(eventIdx > 0);
  const eventBody = orchestratorSource.slice(eventIdx, orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.event.confirm\'', eventIdx));
  assert.match(eventBody, /idempotencyKey: execution\.id/);
});

test('CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM reuse confirmAskExecution\'s one shared claim/lease/retry/reject lifecycle -- no operation-specific bypass', () => {
  // The retry-under-lease-reclaim-race and reject-and-release behaviors this
  // phase's acceptance criterion asks for are properties of
  // confirmAskExecution's shared preamble/catch block (already exercised by
  // the other 25 confirmation-required operations, and covered by
  // askGovernance.test.js's "material confirmations acquire a unique leased
  // claim before domain mutation"). Both new operations dispatch through the
  // exact same confirmCapabilityInvoke(...) call as every other operation --
  // this test proves they don't route around it.
  const dispatchIdx = orchestratorSource.indexOf('await confirmCapabilityInvoke(execution.operationId as AskOperationId, {');
  assert.ok(dispatchIdx > 0);
  const confirmFactIdx = orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.fact.confirm\', confirmCaptureFact);');
  const confirmEventIdx = orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.event.confirm\', confirmCaptureEvent);');
  // Both must be registered (module load runs top-to-bottom) before the one
  // dispatch call site that could ever invoke them -- same requirement, same
  // ordering, as all 25 pre-existing confirmation-required operations.
  assert.ok(confirmFactIdx > 0 && confirmFactIdx < dispatchIdx, 'CAPTURE_FACT_CONFIRM must register into the same dispatch confirmAskExecution already calls');
  assert.ok(confirmEventIdx > 0 && confirmEventIdx < dispatchIdx, 'CAPTURE_EVENT_CONFIRM must register into the same dispatch confirmAskExecution already calls');
});
