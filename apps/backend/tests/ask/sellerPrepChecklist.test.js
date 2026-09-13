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
  // SELLER_PREP_ITEM_DECISION (the write-path slice) falls through to the
  // same href, so this case label is no longer on its own return line.
  assert.match(fallbackBody, /case 'SELLER_PREP_CHECKLIST':\s*\n\s*case 'SELLER_PREP_ITEM_DECISION': return `\$\{base\}\/seller-prep`;/);
});

// Ask Cozy Stage 3, Phase 7 write-path slice (implementation plan §13; FRD
// §31). The real write PropertySaleCaseService.setItemDecision exposes --
// WAIVE/PURSUE/REOPEN/UNPURSUE on a SaleReadinessItem -- following the
// exact propose/confirm shape INSPECTION_FINDING_UPDATE already
// established: resolve an exact target + action from free text
// (exactEntityMatch), propose a NEEDS_CONFIRMATION card, apply the write
// only on confirm.

test('decision-verb + "seller prep item"/"sale readiness item"/"checklist item" phrasing routes to SELLER_PREP_ITEM_DECISION, ahead of the bare checklist-read pattern', () => {
  for (const message of [
    'Waive the seller prep item for the roof repair',
    'I will pursue the gutter cleaning checklist item',
    'Reopen the seller prep item I waived',
    'Unpursue the checklist item I committed to',
    'Go ahead and waive that sale readiness item for me',
  ]) {
    assert.equal(routeOf(message), 'SELLER_PREP_ITEM_DECISION', message);
  }
  // A bare "seller prep" mention with no decision verb stays a checklist READ.
  assert.equal(routeOf('Check my sale readiness'), 'SELLER_PREP_CHECKLIST');
});

test('the new write operation is registered with a real definition (CONTRIBUTOR floor, MATERIAL_DECISION, real adapter key)', () => {
  const definition = ASK_OPERATION_DEFINITIONS.SELLER_PREP_ITEM_DECISION;
  assert.ok(definition);
  assert.equal(definition.propertyRoleFloor, 'CONTRIBUTOR');
  assert.equal(definition.safetyClass, 'MATERIAL_DECISION');
  assert.equal(definition.adapterKey, 'seller-prep.item-decision');
  assert.ok(definition.allowedBlockTypes.includes('WORKFLOW_PROGRESS'));
});

test('the full hierarchical skill router resolves SELLER_PREP_ITEM_DECISION to the seller-prep skill', () => {
  const message = 'Waive the seller prep item for the roof repair';
  const operationDecision = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  const decision = resolveHierarchicalSkillRouting(message, operationDecision);
  assert.equal(decision.outcome, 'RESOLVED');
  assert.equal(decision.selectedSkill.id, 'seller-prep');
  assert.equal(decision.selectedOperationId, 'SELLER_PREP_ITEM_DECISION');
});

test('SELLER_PREP_ITEM_DECISION is a governed material command with cancellation/authorization metadata', () => {
  const { ASK_DOMAIN_COMMAND_REGISTRY } = require('../../src/services/ask/askDomainCommandRegistry.ts');
  const command = ASK_DOMAIN_COMMAND_REGISTRY.SELLER_PREP_ITEM_DECISION;
  assert.ok(command);
  assert.equal(command.operationId, 'SELLER_PREP_ITEM_DECISION');
  assert.equal(command.adapterKey, 'seller-prep.item-decision');
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.material, true);
  assert.equal(command.supportsCancelBeforeExecution, true);
});

function proposeHandlerBody() {
  const start = orchestratorSource.indexOf('async function sellerPrepItemDecisionResult(');
  assert.ok(start > 0, 'sellerPrepItemDecisionResult not found');
  const end = orchestratorSource.indexOf('\n}\n', start);
  return orchestratorSource.slice(start, end + 2);
}

test('sellerPrepItemAction checks REOPEN/UNPURSUE before WAIVE/PURSUE -- "undo the waive" must not be misclassified as WAIVE', () => {
  const start = orchestratorSource.indexOf('function sellerPrepItemAction(');
  assert.ok(start > 0);
  const body = orchestratorSource.slice(start, orchestratorSource.indexOf('\n}\n', start));
  const reopenIdx = body.indexOf("return 'REOPEN'");
  const unpursueIdx = body.indexOf("return 'UNPURSUE'");
  const waiveIdx = body.indexOf("return 'WAIVE'");
  const pursueIdx = body.indexOf("return 'PURSUE'");
  assert.ok(reopenIdx > 0 && unpursueIdx > reopenIdx && waiveIdx > unpursueIdx && pursueIdx > waiveIdx);
});

test('sellerPrepItemDecisionResult resolves an exact item + action via exactEntityMatch, never PropertySaleCaseService.setItemDecision directly', () => {
  const body = proposeHandlerBody();
  assert.match(body, /const selected = exactEntityMatch\(decidable, message, launchContext\);/);
  assert.match(body, /const action = sellerPrepItemAction\(message\);/);
  assert.doesNotMatch(body, /PropertySaleCaseService\.setItemDecision\(/, 'the write must only happen in the confirm handler, never at propose time');
  assert.match(body, /status: 'NEEDS_ENTITY'/);
  assert.match(body, /status: 'NEEDS_CONFIRMATION'/);
  assert.match(body, /saleReadinessItemAction: action,/);
  assert.match(body, /saleReadinessItemContextVersion: contextVersion,/);
});

test('sellerPrepItemDecisionResult excludes RESOLVED items from the decidable set (nothing left to decide once the source itself cleared)', () => {
  const body = proposeHandlerBody();
  assert.match(body, /item\.status !== 'RESOLVED'/);
});

test('the propose-time and confirm-time capability handlers, and the askDomainCommandRegistry entry, are all registered for SELLER_PREP_ITEM_DECISION', () => {
  assert.match(
    orchestratorSource,
    /registerCapabilityHandler\('seller-prep\.item-decision', async \(envelope\) => sellerPrepItemDecisionResult\(envelope\.userId, envelope\.propertyId!, envelope\.message, envelope\.launchContext\)\);/,
  );
  assert.match(
    orchestratorSource,
    /registerConfirmCapabilityHandler\('seller-prep\.item-decision', confirmSellerPrepItemDecision\);/,
  );
});

function confirmHandlerBody() {
  const start = orchestratorSource.indexOf('async function confirmSellerPrepItemDecision(');
  assert.ok(start > 0, 'confirmSellerPrepItemDecision not found');
  const end = orchestratorSource.indexOf('\n}\n', start);
  return orchestratorSource.slice(start, end + 2);
}

test('confirmSellerPrepItemDecision re-fetches the item, checks contextVersion staleness unconditionally, then calls the real write', () => {
  const body = confirmHandlerBody();
  // Unlike confirmInspectionFindingUpdate, no "alreadyApplied" bypass --
  // setItemDecision is unconditional/idempotent (verified by reading its
  // implementation), so skipping the staleness check would have no
  // idempotent-no-op safety net protecting a stale confirm from silently
  // overwriting a decision made by someone else in the meantime.
  assert.doesNotMatch(body, /alreadyApplied/);
  assert.match(body, /prisma\.saleReadinessItem\.findFirst\(/);
  assert.match(body, /if \(!item\) throw Object\.assign\(new Error\('The selected checklist item is no longer available\.'\), \{ code: 'ASK_CONFIRMATION_NOT_ACTIVE' \}\);/);
  assert.match(body, /if \(parameters\.saleReadinessItemContextVersion !== currentVersion\) \{/);
  assert.match(body, /code: 'ASK_CONTEXT_VERSION_CONFLICT'/);
  assert.match(body, /await PropertySaleCaseService\.setItemDecision\(userId, execution\.propertyId, item\.id, action as 'WAIVE' \| 'PURSUE' \| 'REOPEN' \| 'UNPURSUE', reason\);/);
  assert.match(body, /status: 'COMPLETED'/);
  assert.match(body, /artifactType: 'SALE_READINESS_ITEM', artifactId: item\.id/);
});

test('the seller-prep skill manifest declares both operations, both adapters, autonomyLevel 2, and WRITE effects', () => {
  const { SELLER_PREP_SKILL } = require('../../src/services/skills/seller-prep/skill.manifest.ts');
  assert.deepEqual(
    new Set(SELLER_PREP_SKILL.operations.map((o) => o.operationId)),
    new Set(['SELLER_PREP_CHECKLIST', 'SELLER_PREP_ITEM_DECISION']),
  );
  assert.deepEqual(
    new Set(SELLER_PREP_SKILL.allowedAdapters.map((a) => a.id)),
    new Set(['seller-prep.checklist', 'seller-prep.item-decision']),
  );
  assert.equal(SELLER_PREP_SKILL.autonomyLevel, 2);
  assert.deepEqual(new Set(SELLER_PREP_SKILL.riskPolicy.effects), new Set(['READ', 'WRITE']));
});
