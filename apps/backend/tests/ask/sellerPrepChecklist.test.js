const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "Seller Prep --
// expose now, needs a new Ask operation registration, not new business
// logic"). SELLER_PREP_CHECKLIST reads the real, canonical
// PropertySaleCase/SaleReadinessItem checklist directly
// (PropertySaleCaseService.getCase) -- the same read Phase 6's own
// buildSellerPrepInlineBlock already performs, now exposed as its own
// directly-askable answer. This closes a real gap: MAJOR_EVENT_ENTRY's own
// "selling" branch already suggests "Check sale readiness" as a follow-up,
// but nothing answered that before this operation existed.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

function routeOf(message) {
  return resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
}

test('sale-readiness / seller-prep phrasing routes to SELLER_PREP_CHECKLIST', () => {
  for (const message of [
    'Check my sale readiness',
    'Is my home ready to list yet?',
    "What's on my seller prep checklist?",
    'Am I ready to sell my house?',
    'Show my selling readiness',
  ]) {
    assert.equal(routeOf(message), 'SELLER_PREP_CHECKLIST', message);
  }
});

// The generic multi-life-event entry point (MAJOR_EVENT_ENTRY, owned by the
// pre-existing 'seller-preparation' skill) is deliberately left untouched --
// this new operation is narrower and specific, checked earlier in the
// cascade, but must not swallow the broad "help me prepare for X life
// event" phrasing that already worked.
test('broad "help me prepare" life-event phrasing still routes to MAJOR_EVENT_ENTRY, not SELLER_PREP_CHECKLIST', () => {
  assert.equal(routeOf('Help me prepare to sell my home'), 'MAJOR_EVENT_ENTRY');
  assert.equal(routeOf('What do I need to do before selling my home?'), 'MAJOR_EVENT_ENTRY');
});

test('SELL_HOLD_RENT_ANALYSIS routing is unaffected by the new pattern', () => {
  assert.equal(routeOf('Should I sell, hold, or rent this home?'), 'SELL_HOLD_RENT_ANALYSIS');
  assert.equal(routeOf('Compare selling versus renting out my property'), 'SELL_HOLD_RENT_ANALYSIS');
});

test('the new operation is registered with a real definition (VIEWER floor, real adapter key)', () => {
  const definition = ASK_OPERATION_DEFINITIONS.SELLER_PREP_CHECKLIST;
  assert.ok(definition);
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.adapterKey, 'seller-prep.checklist');
  assert.equal(definition.requiresProperty, true);
  assert.ok(definition.allowedBlockTypes.includes('GROUPED_LIST'));
});

test('the full hierarchical skill router resolves SELLER_PREP_CHECKLIST to the seller-prep skill (not UNAVAILABLE -- every registration point is wired)', () => {
  const message = 'Check my sale readiness';
  const operationDecision = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  const decision = resolveHierarchicalSkillRouting(message, operationDecision);
  assert.equal(decision.outcome, 'RESOLVED');
  assert.equal(decision.selectedSkill.id, 'seller-prep');
  assert.equal(decision.selectedOperationId, 'SELLER_PREP_CHECKLIST');
});

// Source-governance tests for sellerPrepChecklistResult, which touches the
// database directly (PropertySaleCaseService.getCase) and has no
// runtime-mocked test harness in this codebase for this class of function
// (same established gap as sellHoldRentAnalysisResult -- see this file's
// header and captureConfirmWriteSafety.test.js's own header for the
// convention this mirrors).
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

function handlerBody() {
  const start = orchestratorSource.indexOf('async function sellerPrepChecklistResult(');
  assert.ok(start > 0, 'sellerPrepChecklistResult not found');
  const end = orchestratorSource.indexOf('\n}\n', start);
  return orchestratorSource.slice(start, end + 2);
}

test('sellerPrepChecklistResult reads PropertySaleCaseService.getCase and never calls a write method -- this is a read-only first slice', () => {
  const body = handlerBody();
  assert.match(body, /PropertySaleCaseService\.getCase\(userId, propertyId\)/);
  for (const writeMethod of ['setItemDecision', 'createCase', 'updateBudgetRange', 'confirmNotableUpgrades', 'updateTargetDates', 'transitionStatus', 'recordTransition', 'updateTransition', 'completeTransition']) {
    assert.doesNotMatch(body, new RegExp(`PropertySaleCaseService\\.${writeMethod}\\(`), `must not call the write method ${writeMethod}`);
  }
});

test('sellerPrepChecklistResult returns NOT_APPLICABLE with no saleCase, and a category-grouped GROUPED_LIST when open items exist', () => {
  const body = handlerBody();
  assert.match(body, /if \(!overview\.saleCase\) \{/);
  assert.match(body, /status: 'NOT_APPLICABLE'/);
  assert.match(body, /reasonCode: 'SELLER_PREP_NO_ACTIVE_CASE'/);
  assert.match(body, /type: 'GROUPED_LIST'/);
  assert.match(body, /item\.status === 'OPEN'/);
});

test('the capability handler and captureFallbackHref registrations both exist for SELLER_PREP_CHECKLIST', () => {
  assert.match(
    orchestratorSource,
    /registerCapabilityHandler\('seller-prep\.checklist', async \(envelope\) => sellerPrepChecklistResult\(envelope\.userId, envelope\.propertyId!\)\);/,
  );
  const fallbackStart = orchestratorSource.indexOf('function captureFallbackHref(');
  assert.ok(fallbackStart > 0);
  const fallbackBody = orchestratorSource.slice(fallbackStart, orchestratorSource.indexOf('\n}\n', fallbackStart));
  assert.match(fallbackBody, /case 'SELLER_PREP_CHECKLIST': return `\$\{base\}\/seller-prep`;/);
});
