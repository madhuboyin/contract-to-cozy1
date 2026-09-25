const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 coverage/
// insurance candidate). Distinct from COVERAGE_GAPS's per-inventory-item
// coverage review: reads the per-policy CoverageComparison (current
// verified policy vs. alternative quotes/terms, equivalence status, any
// recorded decision) via the same getOrCreateCoverageComparison call the
// existing GET /coverage-comparison route already makes. Read-only --
// adding an option or recording a decision are separate, document-
// dependent, multi-step writes, deliberately out of scope for this slice.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

function routeOf(message) {
  return resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
}

test('compare/switch/shop/equivalent insurance phrasing routes to COVERAGE_COMPARISON_STATUS', () => {
  for (const message of [
    'Compare my current insurance policy against alternatives',
    'Should I switch my home insurance?',
    'Is my new policy equivalent to what I have now?',
    'Am I better off shopping for new insurance?',
    "What's my coverage comparison status?",
    'Should I keep or switch my insurance policy?',
  ]) {
    assert.equal(routeOf(message), 'COVERAGE_COMPARISON_STATUS', message);
  }
});

// coveragePattern's own bare "insurance coverage" phrasing is a real
// substring of some compare-flavored messages above -- the new pattern is
// checked earlier in the cascade specifically so a compare/switch/shop
// verb wins, while bare gap phrasing with no such verb still falls
// through untouched.
test('bare coverage-gap phrasing (no compare/switch/shop verb) still routes to COVERAGE_GAPS, not COVERAGE_COMPARISON_STATUS', () => {
  assert.equal(routeOf('Which items have missing coverage?'), 'COVERAGE_GAPS');
  assert.equal(routeOf('What is uncovered in my home?'), 'COVERAGE_GAPS');
  assert.equal(routeOf('Show me my insurance coverage for the appliances'), 'COVERAGE_GAPS');
});

// quoteComparisonReviewPattern (contractor quotes/bids/proposals/estimates)
// is checked earlier in the cascade than coverageComparisonPattern -- these
// messages avoid the word "quote" so they aren't swallowed by it.
test('contractor quote-comparison phrasing is unaffected by the new pattern', () => {
  assert.equal(routeOf('Compare these contractor bids'), 'QUOTE_COMPARISON_REVIEW');
  assert.equal(routeOf('Which estimate is best?'), 'QUOTE_COMPARISON_REVIEW');
});

test('the new operation is registered with a real definition (VIEWER floor, real adapter key)', () => {
  const definition = ASK_OPERATION_DEFINITIONS.COVERAGE_COMPARISON_STATUS;
  assert.ok(definition);
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.adapterKey, 'coverage.comparison-status');
  assert.equal(definition.requiresProperty, true);
  assert.ok(definition.allowedBlockTypes.includes('GROUPED_LIST'));
});

test('the full hierarchical skill router resolves COVERAGE_COMPARISON_STATUS to the coverage skill (not UNAVAILABLE -- every registration point is wired)', () => {
  const message = "What's my coverage comparison status?";
  const operationDecision = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  const decision = resolveHierarchicalSkillRouting(message, operationDecision);
  assert.equal(decision.outcome, 'RESOLVED');
  assert.equal(decision.selectedSkill.id, 'coverage');
  assert.equal(decision.selectedOperationId, 'COVERAGE_COMPARISON_STATUS');
});

// Source-governance tests for coverageComparisonStatusResult, which touches
// the database directly (getOrCreateCoverageComparison) and has no
// runtime-mocked test harness in this codebase for this class of function
// (same established gap as sellerPrepChecklistResult -- see that file's
// header for the convention this mirrors).
const orchestratorSource = readAskOrchestratorSources();

function handlerBody() {
  const start = orchestratorSource.indexOf('async function coverageComparisonStatusResult(');
  assert.ok(start > 0, 'coverageComparisonStatusResult not found');
  const end = orchestratorSource.indexOf('\n}\n', start);
  return orchestratorSource.slice(start, end + 2);
}

test('coverageComparisonStatusResult reads getOrCreateCoverageComparison and never calls a write method -- this slice is read-only', () => {
  const body = handlerBody();
  assert.match(body, /getOrCreateCoverageComparison\(propertyId, userId\)/);
  for (const writeMethod of ['addCoverageComparisonOption', 'recordCoverageDecision']) {
    assert.doesNotMatch(body, new RegExp(`${writeMethod}\\(`), `must not call the write method ${writeMethod}`);
  }
});

test('coverageComparisonStatusResult calls ensurePropertyAccess itself -- unlike PropertySaleCaseService.getCase, coverageComparison.service.ts\'s own authorizeProperty has no household-role gradient', () => {
  const body = handlerBody();
  assert.match(body, /await ensurePropertyAccess\(userId, propertyId\);/);
});

test('a non-owner household member rejected by the narrower authorizeProperty gets a disclosed BLOCKED result, not a raw 404', () => {
  const body = handlerBody();
  assert.match(body, /error instanceof APIError && error\.code === 'PROPERTY_NOT_FOUND'/);
  assert.match(body, /status: 'BLOCKED'/);
  assert.match(body, /reasonCode: 'COVERAGE_COMPARISON_OWNER_ONLY'/);
});

test('coverageComparisonStatusResult returns NOT_APPLICABLE when no verified policy exists yet', () => {
  const body = handlerBody();
  assert.match(body, /result\.state === 'BASELINE_REQUIRED'/);
  assert.match(body, /status: 'NOT_APPLICABLE'/);
  assert.match(body, /reasonCode: 'COVERAGE_COMPARISON_BASELINE_REQUIRED'/);
});

test('coverageComparisonStatusResult renders a GROUPED_LIST of options and surfaces a recorded decision when present', () => {
  const body = handlerBody();
  assert.match(body, /type: 'GROUPED_LIST'/);
  assert.match(body, /latestDecision = comparison\.decisions\[0\] \?\? null;/);
  assert.match(body, /COVERAGE_COMPARISON_DECISION_LABELS\[latestDecision\.decision\]/);
});

test('the capability handler and captureFallbackHref registrations both exist for COVERAGE_COMPARISON_STATUS', () => {
  assert.match(
    orchestratorSource,
    /registerCapabilityHandler\('coverage\.comparison-status', async \(envelope\) => coverageComparisonStatusResult\(envelope\.userId, envelope\.propertyId!\)\);/,
  );
  assert.match(orchestratorSource, /case 'COVERAGE_COMPARISON_STATUS': return `\$\{base\}\/tools\/coverage-options`;/);
});

test('the coverage skill manifest declares both operations and both adapters', () => {
  const { COVERAGE_SKILL } = require('../../src/services/skills/coverage/skill.manifest.ts');
  assert.deepEqual(
    new Set(COVERAGE_SKILL.operations.map((o) => o.operationId)),
    new Set(['COVERAGE_GAPS', 'COVERAGE_COMPARISON_STATUS']),
  );
  assert.deepEqual(
    new Set(COVERAGE_SKILL.allowedAdapters.map((a) => a.id)),
    new Set(['coverage.review', 'coverage.comparison-status']),
  );
  assert.deepEqual(new Set(COVERAGE_SKILL.consumerPolicy[0].operations), new Set(['COVERAGE_GAPS', 'COVERAGE_COMPARISON_STATUS']));
});
