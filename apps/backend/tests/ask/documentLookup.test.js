const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "documents"
// candidate). Reads the Document vault itself (prisma.document, grouped by
// type and verification status) -- distinct from DOCUMENT_PROMOTION_REVIEW/
// DOCUMENT_PROMOTION_CONFIRM, which only ever read
// pendingDocumentPromotionCandidates (a queue of pending extraction
// candidates), never prisma.document directly.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveHierarchicalSkillRouting } = require('../../src/services/skills/skillRouter.ts');

function routeOf(message) {
  return resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
}

test('bare document-vault phrasing routes to DOCUMENT_LOOKUP', () => {
  for (const message of [
    'Show my documents',
    'What documents do I have for this property?',
    'List my documents by type',
    'How many documents do I have on file?',
    'See the documents I have on file',
  ]) {
    assert.equal(routeOf(message), 'DOCUMENT_LOOKUP', message);
  }
});

// documentPromotionReviewPattern/documentPromotionConfirmPattern are both
// checked earlier in the cascade and require extra review/confirmation/
// pending/promotion/facts or confirm/reject/promote/apply wording this
// bare vault-lookup phrasing never carries -- verified bidirectionally.
test('document-promotion review/confirm phrasing is unaffected by the new pattern', () => {
  assert.equal(routeOf('Show document facts waiting for review'), 'DOCUMENT_PROMOTION_REVIEW');
  assert.equal(routeOf('Confirm this reviewed document extraction'), 'DOCUMENT_PROMOTION_CONFIRM');
});

test('the new operation is registered with a real definition (VIEWER floor, real adapter key)', () => {
  const definition = ASK_OPERATION_DEFINITIONS.DOCUMENT_LOOKUP;
  assert.ok(definition);
  assert.equal(definition.propertyRoleFloor, 'VIEWER');
  assert.equal(definition.adapterKey, 'documents.lookup');
  assert.equal(definition.requiresProperty, true);
  assert.ok(definition.allowedBlockTypes.includes('GROUPED_LIST'));
  assert.ok(definition.allowedBlockTypes.includes('EMPTY_STATE'));
});

test('the full hierarchical skill router resolves DOCUMENT_LOOKUP to the new documents skill (not UNAVAILABLE -- every registration point is wired)', () => {
  const message = 'Show my documents';
  const operationDecision = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  const decision = resolveHierarchicalSkillRouting(message, operationDecision);
  assert.equal(decision.outcome, 'RESOLVED');
  assert.equal(decision.selectedSkill.id, 'documents');
  assert.equal(decision.selectedOperationId, 'DOCUMENT_LOOKUP');
});

// Source-governance tests for documentLookupResult, which touches the
// database directly (prisma.document.findMany) and has no runtime-mocked
// test harness in this codebase for this class of function (same
// established gap as coverageComparisonStatusResult -- see that file's
// header for the convention this mirrors).
const orchestratorSource = readAskOrchestratorSources();

function handlerBody() {
  const start = orchestratorSource.indexOf('async function documentLookupResult(');
  assert.ok(start > 0, 'documentLookupResult not found');
  const end = orchestratorSource.indexOf('\n}\n', start);
  return orchestratorSource.slice(start, end + 2);
}

test('documentLookupResult reads prisma.document.findMany scoped to propertyId and excludes soft-deleted rows', () => {
  const body = handlerBody();
  assert.match(body, /prisma\.document\.findMany\(/);
  assert.match(body, /propertyId, deletedAt: null/);
  assert.match(body, /await ensurePropertyAccess\(userId, propertyId\);/);
});

test('documentLookupResult groups by type and surfaces verification status, and never calls a write method', () => {
  const body = handlerBody();
  assert.match(body, /type: 'GROUPED_LIST'/);
  assert.match(body, /type: 'EMPTY_STATE'/);
  assert.match(body, /document\.verificationStatus/);
  assert.doesNotMatch(body, /prisma\.document\.(create|update|delete|deleteMany|updateMany)\(/);
});

test('the capability handler and captureFallbackHref registrations both exist for DOCUMENT_LOOKUP', () => {
  assert.match(
    orchestratorSource,
    /registerCapabilityHandler\('documents\.lookup', async \(envelope\) => documentLookupResult\(envelope\.userId, envelope\.propertyId!\)\);/,
  );
  assert.match(orchestratorSource, /case 'DOCUMENT_LOOKUP': return `\$\{base\}\/documents`;/);
});

test('the new documents skill manifest declares DOCUMENT_LOOKUP and its adapter', () => {
  const { DOCUMENTS_SKILL } = require('../../src/services/skills/documents/skill.manifest.ts');
  assert.deepEqual(new Set(DOCUMENTS_SKILL.operations.map((o) => o.operationId)), new Set(['DOCUMENT_LOOKUP']));
  assert.deepEqual(new Set(DOCUMENTS_SKILL.allowedAdapters.map((a) => a.id)), new Set(['documents.lookup']));
  assert.equal(DOCUMENTS_SKILL.authorizationFloor, 'VIEWER');
  assert.deepEqual(DOCUMENTS_SKILL.riskPolicy.effects, ['READ']);
});
