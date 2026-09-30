const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { buildFocusedHomeActionGuidance } = require('../../src/services/ask/askFocusedGuidance.ts');
const { policyConflictTermIdFromLineage, POLICY_FACT_KEEP_MESSAGE, POLICY_FACT_USE_MESSAGE } = require('../../src/services/ask/policyConflictPresentation.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { prisma } = require('../../src/lib/prisma.ts');

// Policy-fact conflict resolved inside Ask (FRD v1.171).

const fact = (id, factKey, amountValue, extra = {}) => ({
  id, factKey, valueType: 'AMOUNT', amountValue, textValue: null, booleanValue: null, jsonValue: null,
  confidence: 0.9, confirmedAt: null, createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'), ...extra,
});
const term = () => ({
  termId: 'term-1', policyId: 'policy-1', carrierName: 'Acme Insurance', termCreatedAt: new Date('2026-09-01'), termUpdatedAt: new Date('2026-09-01'),
  conflicts: [
    { factKey: 'ANNUAL_PREMIUM', pending: fact('fact-p1', 'ANNUAL_PREMIUM', 2100), confirmed: fact('fact-c1', 'ANNUAL_PREMIUM', 1800, { confirmedAt: new Date('2026-01-01') }) },
    { factKey: 'DWELLING_LIMIT', pending: fact('fact-p2', 'DWELLING_LIMIT', 450000), confirmed: fact('fact-c2', 'DWELLING_LIMIT', 400000, { confirmedAt: new Date('2026-01-01') }) },
  ],
});
const HREF = '/dashboard/properties/property-1/tools/coverage-intelligence?policyId=policy-1';
const conflictAction = () => ({
  id: 'insurance-fact-conflict:term-1', lineageId: 'insurance-fact-conflict:term-1', source: { kind: 'SYSTEM' }, priority: 'SOON', state: 'OPEN',
  signal: 'New Acme Insurance policy document conflicts with your confirmed policy details',
  whyItMatters: 'A newly extracted policy document disagrees with what is already confirmed on file.',
  recommendedAction: 'Review the newly extracted details and confirm which value is correct.',
  expectedOutcome: 'The policy record reflects one confirmed, correct value for each conflicting fact.',
  presentation: { variant: 'STANDARD', summary: 's', keyFacts: [], factGroups: [] },
  primaryCta: { kind: 'CORRECT_FACT', label: 'Review conflicting policy details', href: HREF },
  governance: { safetyTier: 'LOW_CONSEQUENCE' }, timing: { dueAt: null, rationale: 'Advisory' }, confidence: { label: 'MEDIUM' },
  evidence: [], recommendationResponse: { status: 'AVAILABLE' }, ranking: { explanation: 'x' }, feedbackControls: ['SNOOZE'],
});
const focused = (options) => buildFocusedHomeActionGuidance(conflictAction(), 'v1', undefined, null, options).blocks.find((block) => block.id === 'focused-home-action-guidance');

test('each conflicting fact is its own item, keyed by the exact pending fact id, with both values shown', () => {
  const block = focused({ canContribute: true, policyConflict: term() });
  const section = block.sections.find((candidate) => candidate.id === 'policy-conflicts');
  assert.equal(section.count, 2);
  assert.deepEqual(section.items.map((item) => item.id), ['fact-p1', 'fact-p2']);
  assert.ok(section.items.every((item) => item.entityType === 'INSURANCE_POLICY_FACT'));
  assert.equal(section.items[0].title, 'Annual premium');
  assert.match(section.items[0].description, /Newly extracted: \$2,100.*Currently confirmed: \$1,800/);
  assert.deepEqual(section.items[0].meta, ['Acme Insurance']);
});

test('each item offers Keep existing (reject) and Use extracted value (confirm) through the confirmation-gated operation', () => {
  const [item] = focused({ canContribute: true, policyConflict: term() }).sections.find((candidate) => candidate.id === 'policy-conflicts').items;
  assert.deepEqual(item.actions.map((action) => [action.label, action.style]), [['Keep existing', 'SECONDARY'], ['Use extracted value', 'PRIMARY']]);
  for (const action of item.actions) {
    assert.equal(action.operationId, 'DOCUMENT_PROMOTION_CONFIRM');
    assert.equal(action.interactionType, 'MUTATE_RECORD');
    // Routes by itself, not only through the forced hint.
    assert.equal(resolveAskOperation(action.message).operationId, 'DOCUMENT_PROMOTION_CONFIRM', action.message);
  }
  // Decision words the handler reads: reject -> REJECT, confirm -> CONFIRM, and never both in one message.
  assert.equal(item.actions[0].message, POLICY_FACT_KEEP_MESSAGE);
  assert.equal(item.actions[1].message, POLICY_FACT_USE_MESSAGE);
  assert.match(POLICY_FACT_KEEP_MESSAGE, /\breject\b/i);
  assert.doesNotMatch(POLICY_FACT_KEEP_MESSAGE, /\bconfirm|promote|apply\b/i);
  assert.match(POLICY_FACT_USE_MESSAGE, /\bconfirm\b/i);
  assert.doesNotMatch(POLICY_FACT_USE_MESSAGE, /\breject|discard\b/i);
});

test('with the conflict resolvable inline there is no navigation back to the tool', () => {
  assert.deepEqual(focused({ canContribute: true, policyConflict: term() }).actions, []);
});

test('a viewer can read the conflict but not resolve it, and keeps the exactly-targeted link', () => {
  const block = focused({ canContribute: false, policyConflict: term() });
  const section = block.sections.find((candidate) => candidate.id === 'policy-conflicts');
  assert.ok(section.items.every((item) => item.actions === undefined));
  assert.deepEqual(block.actions.map((action) => action.href), [HREF]);
  // Callers that do not say fail closed the same way.
  assert.ok(focused({ policyConflict: term() }).actions.every((action) => action.href === HREF));
});

test('a conflict already resolved (no live term) or a different action shows no conflict section and keeps the link', () => {
  for (const options of [{ canContribute: true, policyConflict: null }, { canContribute: true, policyConflict: { ...term(), conflicts: [] } }, { canContribute: true }]) {
    const block = focused(options);
    assert.equal(block.sections.some((section) => section.id === 'policy-conflicts'), false);
    assert.deepEqual(block.actions.map((action) => action.href), [HREF]);
  }
});

test('the lineage prefix identifies the term, and only that prefix', () => {
  assert.equal(policyConflictTermIdFromLineage('insurance-fact-conflict:term-1'), 'term-1');
  for (const lineage of ['insurance-fact-conflict:', 'coverage-renewal:x:1', 'recall:1', 'operational-work:1', '']) assert.equal(policyConflictTermIdFromLineage(lineage), null, lineage);
});

test('the blocks validate against the real presentation schema', () => {
  const result = buildFocusedHomeActionGuidance(conflictAction(), 'v1', undefined, null, { canContribute: true, policyConflict: term() });
  for (const block of result.blocks) {
    const parsed = AskPresentationBlockSchema.safeParse(block);
    assert.ok(parsed.success, `${block.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues).slice(0, 300)}`);
  }
});

test('the propose step carries the launching execution so that card refreshes, and resolves the exact fact by id', async () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/handlers/documents.handler.ts'), 'utf8');
  assert.match(source, /\.\.\.\(launchContext\?\.sourceExecutionId \? \{ sourceExecutionId: launchContext\.sourceExecutionId \} : \{\}\)/);

  // Executed: drive the registered capability with only Prisma's reads stubbed.
  require('../../src/services/ask/handlers/documents.handler.ts');
  const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
  const originals = ['materialExtractionReview', 'inspectionReport', 'insurancePolicyFact'].map((model) => [model, prisma[model]?.findMany]);
  prisma.materialExtractionReview.findMany = async () => [];
  prisma.inspectionReport.findMany = async () => [];
  prisma.insurancePolicyFact.findMany = async () => [{
    ...fact('fact-p1', 'ANNUAL_PREMIUM', 2100), confirmationStatus: 'PENDING',
    policyTerm: { insurancePolicyId: 'policy-1', insurancePolicy: { id: 'policy-1', carrierName: 'Acme Insurance' } },
  }];
  try {
    const deps = { propertyAccess: { role: 'OWNER', userId: 'u1', propertyId: 'property-1' } };
    const invoke = (message, launchContext) => capabilityInvoke('DOCUMENT_PROMOTION_CONFIRM', { userId: 'u1', propertyId: 'property-1', message, launchContext }, deps);
    const result = await invoke(POLICY_FACT_USE_MESSAGE, { surface: 'ASK_PAGE', entityType: 'INSURANCE_POLICY_FACT', entityId: 'fact-p1', sourceExecutionId: 'exec-focused-1', operationId: 'DOCUMENT_PROMOTION_CONFIRM' });
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.parameters.documentPromotionId, 'fact-p1');
    assert.equal(result.parameters.documentPromotionDecision, 'CONFIRM');
    assert.equal(result.parameters.sourceExecutionId, 'exec-focused-1');
    const rejected = await invoke(POLICY_FACT_KEEP_MESSAGE, { surface: 'ASK_PAGE', entityId: 'fact-p1' });
    assert.equal(rejected.parameters.documentPromotionDecision, 'REJECT');
    assert.equal('sourceExecutionId' in rejected.parameters, false, 'omitted when the action was not launched from a card');
    const viewer = await capabilityInvoke('DOCUMENT_PROMOTION_CONFIRM', { userId: 'u2', propertyId: 'property-1', message: POLICY_FACT_USE_MESSAGE, launchContext: { surface: 'ASK_PAGE', entityId: 'fact-p1' } }, { propertyAccess: { role: 'VIEWER', userId: 'u2', propertyId: 'property-1' } });
    assert.notEqual(viewer.status, 'NEEDS_CONFIRMATION', 'a viewer cannot open a policy-fact confirmation');
  } finally {
    for (const [model, original] of originals) if (original) prisma[model].findMany = original;
  }
});
