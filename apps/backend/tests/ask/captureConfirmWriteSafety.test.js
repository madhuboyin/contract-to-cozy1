const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
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
const orchestratorSource = readAskOrchestratorSources();

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
  // The registrations now live in a handler file that the orchestrator imports (imports run before its own body), so they
  // are in place before the dispatch call site can run; the position in the concatenated source no longer says so.
  assert.ok(confirmFactIdx > 0, 'CAPTURE_FACT_CONFIRM must register into the same dispatch confirmAskExecution already calls');
  assert.ok(confirmEventIdx > 0, 'CAPTURE_EVENT_CONFIRM must register into the same dispatch confirmAskExecution already calls');
  assert.match(orchestratorSource, /^import '\.\/handlers\/captureConfirm\.handler';$/m, 'the orchestrator imports the file that registers them');
});

// Correction path (implementation plan §8/§4.1; FRD §4.1's finding: build on
// the existing supersession chains, not correctionModes).

test('PropertyFactEvidence correction needs no new code: a second CAPTURE_FACT_CONFIRM for the same factKey with a new captureExecutionId already supersedes the prior evidence through the existing write path', () => {
  // Documents a deliberate no-op decision rather than asserting new
  // behavior: writeCanonicalFact + the supersededAt: null -> observedAt
  // updateMany already run for every non-idempotent-replay write,
  // independent of whether the caller thinks of it as "a new value" or "a
  // correction" -- the captureExecutionId check earlier in the file only
  // short-circuits a REPLAY of the SAME execution, never a second, distinct
  // correcting execution for the same factKey.
  assert.match(captureSource, /await tx\.propertyFactEvidence\.updateMany\(\{\s*where: \{ propertyId, factKey, supersededAt: null \},\s*data: \{ supersededAt: observedAt \}/);
});

test('HomeEventsService.updateHomeEvent no longer collides on its own idempotencyKey unique constraint when correcting an idempotencyKey-bearing event', () => {
  // Bug found while wiring Ask's conversational correction: the replacement
  // row previously carried forward existing.idempotencyKey verbatim, which
  // collides with the original (now isCurrent: false) row's own entry under
  // @@unique([propertyId, idempotencyKey]) -- Postgres enforces uniqueness
  // regardless of isCurrent. Every CAPTURE_EVENT_CONFIRM-created event now
  // has a non-null idempotencyKey, so this is no longer a rare, unhit edge
  // case. Fixed to default null (a correction is a distinct write, not a
  // replay of the one it replaces) with an explicit override for callers
  // that need their own idempotency marker on the replacement.
  const idx = homeEventsServiceSource.indexOf('async updateHomeEvent(');
  assert.ok(idx > 0);
  assert.match(homeEventsServiceSource.slice(idx, idx + 200), /options\?: \{ idempotencyKey\?: string \| null \}/);
  const createIdx = homeEventsServiceSource.indexOf('idempotencyKey: options?.idempotencyKey !== undefined ? options.idempotencyKey : null,', idx);
  assert.ok(createIdx > idx, 'the replacement create must no longer copy existing.idempotencyKey verbatim');
});

test('confirmCaptureEvent\'s correction branch guards updateHomeEvent (which has no idempotency check of its own) with its own pre-check keyed on this execution\'s id, so a lease-reclaim retry cannot chain a second correction', () => {
  const eventIdx = orchestratorSource.indexOf('async function confirmCaptureEvent(');
  assert.ok(eventIdx > 0);
  const body = orchestratorSource.slice(eventIdx, orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.event.confirm\'', eventIdx));
  assert.match(body, /const correctingEventId = typeof parameters\.correctingEventId === 'string'/);
  assert.match(body, /const correctionIdempotencyKey = `ask-correction:\$\{execution\.id\}`;/);
  assert.match(body, /prisma\.homeEvent\.findFirst\(\{\s*where: \{ propertyId: execution\.propertyId, idempotencyKey: correctionIdempotencyKey \}/);
  // The pre-check must run, and return early, BEFORE updateHomeEvent is ever
  // called -- otherwise the guard doesn't actually prevent the second call.
  const precheckIdx = body.indexOf('alreadyCorrected');
  const writerCallIdx = body.indexOf('homeEventsServiceForCapture.updateHomeEvent(');
  assert.ok(precheckIdx > 0 && precheckIdx < writerCallIdx);
  // The writer call must pass the same key through so the row it creates is
  // actually findable by the pre-check on a retry.
  assert.match(body, /\{ idempotencyKey: correctionIdempotencyKey \}/);
});

// Code review findings (2026-09-12), verified against source before fixing:
// four real gaps in the Phase 2 correction/completion paths this file
// already covers. Each test below pins the fix, not just documents intent.

test('updateHomeEvent does not clear the superseded row\'s own idempotencyKey -- a replay of the ORIGINAL capture must still resolve to it regardless of a later correction', () => {
  const txIdx = homeEventsServiceSource.indexOf('const updated = await prisma.$transaction(async (tx) => {');
  assert.ok(txIdx > 0);
  const supersedeIdx = homeEventsServiceSource.indexOf('await tx.homeEvent.update({', txIdx);
  const supersedeBlock = homeEventsServiceSource.slice(supersedeIdx, homeEventsServiceSource.indexOf('const replacement = await tx.homeEvent.create(', supersedeIdx));
  assert.match(supersedeBlock, /isCurrent: false/);
  assert.doesNotMatch(supersedeBlock, /idempotencyKey: null/, 'the superseded row\'s idempotencyKey must be left untouched, not nulled -- createHomeEvent\'s own idempotency lookup has no isCurrent filter and depends on this value surviving a correction');
});

test('updateHomeEvent\'s replacement preserves warrantyId/providerName/captureChannel/attribution/extractionConfidence when not explicitly patched', () => {
  const createIdx = homeEventsServiceSource.indexOf('const replacement = await tx.homeEvent.create({');
  assert.ok(createIdx > 0);
  const createBlock = homeEventsServiceSource.slice(createIdx, homeEventsServiceSource.indexOf('include: {', createIdx));
  for (const field of ['warrantyId', 'providerName', 'captureChannel', 'attribution', 'extractionConfidence']) {
    assert.match(
      createBlock,
      new RegExp(`${field}: patch\\.${field} !== undefined \\? patch\\.${field} : existing\\.${field}`),
      `replacement is missing fallback-to-existing for ${field} -- any correction that omits it would silently reset it to null`,
    );
  }
});

test('updateHomeEvent validates an explicitly-changed warrantyId for property scope, matching createHomeEvent\'s own validation', () => {
  const idx = homeEventsServiceSource.indexOf('async updateHomeEvent(');
  assert.ok(idx > 0);
  const body = homeEventsServiceSource.slice(idx, homeEventsServiceSource.indexOf('const updated = await prisma.$transaction', idx));
  assert.match(body, /if \(patch\.warrantyId !== undefined\) \{\s*await this\.assertWarrantyBelongs\(propertyId, patch\.warrantyId \?\? null\);/);
});

test('confirmCaptureEvent\'s correction branch recovers from a concurrent P2002 on its own correctionIdempotencyKey by re-reading the winner, instead of letting the error propagate to the shared expire-on-conflict catch', () => {
  const eventIdx = orchestratorSource.indexOf('async function confirmCaptureEvent(');
  assert.ok(eventIdx > 0);
  const body = orchestratorSource.slice(eventIdx, orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.event.confirm\'', eventIdx));
  const catchIdx = body.indexOf('} catch (error) {');
  assert.ok(catchIdx > 0);
  const catchBlock = body.slice(catchIdx, body.indexOf('return captureEventConfirmResult(execution, userId, parameters, replacement, true', catchIdx));
  assert.match(catchBlock, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === 'P2002'/);
  assert.match(catchBlock, /prisma\.homeEvent\.findFirst\(\{\s*where: \{ propertyId: execution\.propertyId, idempotencyKey: correctionIdempotencyKey \}/);
  // Must return the winner's row (marked corrected: true), not throw. The
  // IW-FRESH-003 reconciliation fix wraps this in captureEventConfirmResult
  // (which still calls captureEventResult(execution.propertyId, winner,
  // true) internally, plus reconcileAskExecutionSideEffects) rather than
  // constructing the result inline -- same outcome, extracted helper.
  assert.match(catchBlock, /return captureEventConfirmResult\(execution, userId, parameters, winner, true, command\.artifactType\)/);
});

test('confirmAskExecution\'s shared expire-on-conflict catch only overwrites an execution still in RUNNING, and re-reads current state instead of assuming its own EXPIRED write won', () => {
  const idx = orchestratorSource.indexOf('export async function confirmAskExecution(');
  assert.ok(idx > 0);
  const conflictCatchIdx = orchestratorSource.indexOf('This changed before it could be confirmed', idx);
  assert.ok(conflictCatchIdx > 0);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001: widened from +900 after
  // preservedExecutionHistory(...) (history-preservation policy applied to
  // this write) added real lines between the resultJson literal and the
  // re-read below.
  const block = orchestratorSource.slice(conflictCatchIdx - 800, conflictCatchIdx + 1700);
  // The EXPIRED write must be conditioned on status still being RUNNING --
  // an unconditional tx.askExecution.update(...) here would clobber a
  // concurrent winner's already-COMPLETED state.
  assert.match(block, /tx\.askExecution\.updateMany\(\{\s*where: \{ id: execution\.id, status: 'RUNNING' \}/);
  assert.match(block, /if \(updated\.count !== 1\) return;/);
  // Must re-read the execution's actual current row afterward rather than
  // trusting its own local variable, so a concurrent winner's state is what
  // gets returned to the caller.
  assert.match(block, /const current = await prisma\.askExecution\.findFirstOrThrow\(\{ where: \{ id: execution\.id, userId \} \}\);/);
});

test('the confirmation-completion transaction emits ASK_CAPTURE_LINK_RECONCILE when the completing execution has a linkedExecutionId, so the existing worker consumer is actually reachable', () => {
  const completionIdx = orchestratorSource.indexOf("data: { status: 'COMPLETED', artifactType, artifactId, completedAt: new Date(), lastErrorCode: null },");
  assert.ok(completionIdx > 0, 'expected the confirmation receipt completion write');
  const afterCompletion = orchestratorSource.slice(completionIdx, completionIdx + 1600);
  assert.match(afterCompletion, /if \(execution\.linkedExecutionId\) \{/);
  assert.match(afterCompletion, /type: 'ASK_CAPTURE_LINK_RECONCILE'/);
  assert.match(afterCompletion, /payload: \{ executionId: execution\.id \}/);
  // Idempotency-keyed per execution via upsert, not a bare create, so a
  // retried completion (the P2002 recovery path) never queues a duplicate.
  assert.match(afterCompletion, /tx\.domainEvent\.upsert\(\{\s*where: \{ idempotencyKey: reconcileIdempotencyKey \}/);
});

// Second review round (2026-09-12): a regression in the first fix, plus one
// more real race the first fix's P2002-only recovery didn't cover. Both
// verified against source before fixing.

test('updateHomeEvent clears projectId (not idempotencyKey) on the superseded row -- the first fix\'s comment described this correctly but the actual data object had dropped projectId: null entirely', () => {
  const txIdx = homeEventsServiceSource.indexOf('const updated = await prisma.$transaction(async (tx) => {');
  assert.ok(txIdx > 0);
  const supersedeIdx = homeEventsServiceSource.indexOf('await tx.homeEvent.update({', txIdx);
  const supersedeBlock = homeEventsServiceSource.slice(supersedeIdx, homeEventsServiceSource.indexOf('const replacement = await tx.homeEvent.create(', supersedeIdx));
  assert.match(supersedeBlock, /isCurrent: false/);
  assert.match(supersedeBlock, /projectId: null/, 'projectId must be cleared on the superseded row -- the replacement carries the same value forward and projectId is @@unique, so omitting this causes a P2002 for any project-linked event');
  assert.doesNotMatch(supersedeBlock, /idempotencyKey: null/, 'idempotencyKey must still not be cleared (see the prior fix/test above)');
});

test('confirmCaptureEvent\'s correction branch re-checks the winner on HOME_EVENT_NOT_FOUND before rejecting -- a tighter race than the P2002 case, where a concurrent winner\'s whole transaction (supersede + create) commits between this attempt\'s alreadyCorrected pre-check and updateHomeEvent\'s own internal existing-event lookup', () => {
  const eventIdx = orchestratorSource.indexOf('async function confirmCaptureEvent(');
  assert.ok(eventIdx > 0);
  const body = orchestratorSource.slice(eventIdx, orchestratorSource.indexOf('registerConfirmCapabilityHandler(\'capture.event.confirm\'', eventIdx));
  const notFoundIdx = body.indexOf("error instanceof APIError && error.code === 'HOME_EVENT_NOT_FOUND'");
  assert.ok(notFoundIdx > 0);
  const notFoundBlock = body.slice(notFoundIdx, body.indexOf('// Code review finding (2026-09-12): the pre-check above', notFoundIdx));
  assert.match(notFoundBlock, /prisma\.homeEvent\.findFirst\(\{\s*where: \{ propertyId: execution\.propertyId, idempotencyKey: correctionIdempotencyKey \}/);
  assert.match(notFoundBlock, /if \(winner\) \{\s*return captureEventConfirmResult\(execution, userId, parameters, winner, true, command\.artifactType\)/);
  // The rejection must come AFTER the winner check, not before it.
  const winnerCheckIdx = notFoundBlock.indexOf('if (winner)');
  const rejectIdx = notFoundBlock.indexOf("code: 'ASK_CONFIRMATION_NOT_ACTIVE'");
  assert.ok(winnerCheckIdx > 0 && rejectIdx > winnerCheckIdx, 'must check for a winner before giving up and rejecting');
});
