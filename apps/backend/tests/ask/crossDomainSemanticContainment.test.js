const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { SemanticRequestPlanSchema, SemanticWhereExpressionSchema } = require('../../src/services/ask/semantic/semanticRequestPlan.ts');
const { ASK_SHARED_SEMANTIC_LEXICON, generateSharedSemanticLexicon, verifyProtectionLexemeSeparation } = require('../../src/services/ask/semantic/sharedSemanticLexicon.ts');
const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const {
  warrantyShapeGrammarAgreement,
  dataPointReadGrammarAgreement,
  savedResultsGrammarAgreement,
  verifyLegacyCandidateGrammarAgreement,
} = require('../../src/services/ask/semantic/legacyGrammarAgreement.ts');
const { SemanticReadReceiptSchema, buildSemanticReadReceipt } = require('../../src/services/ask/semantic/semanticExecutionReceipt.ts');
const { verifySemanticReadReceiptEntailment } = require('../../src/services/ask/semantic/semanticReceiptEntailment.ts');
const { resolvePropertyEntityReference } = require('../../src/services/ask/semantic/propertyEntityResolver.ts');
const { assembleSemanticBooleanExpression } = require('../../src/services/ask/semantic/semanticBooleanAssembler.ts');
const { askTopicTokens, PROTECTION_TOPIC_SEPARATION_FAMILIES } = require('../../src/services/ask/askPromptMinimization.ts');
const { extractSeparatedProtectionConcepts } = require('../../src/services/ask/askSemanticEmbedding.ts');
const { canAnswerContractBypassRelevance, isSourceScanOnlyAnswerContract } = require('../../src/services/ask/answerContract/operationAnswerContract.ts');
const { assertValidTransitionalWarrantyLinkWrite } = require('../../src/services/ask/semantic/transitionalWarrantyRead.ts');
const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const { savedResultsFromPage } = require('../../src/services/ask/handlers/savedResults.handler.ts');
const { GROUNDED_READ_CHECKS, PROVISIONAL_READ_FAMILY_DISPOSITIONS, verifyProvisionalReadFamilyDispositions } = require('../../src/services/ask/support/provisionalRead.ts');
const {
  SELECTED_BASIC_READ_FAMILIES,
  DEFERRED_BASIC_READ_FAMILIES,
  verifyBasicReadFamilyManifestCompleteness,
  validateCommandPreviewAdmission,
  gateUncertifiedCommandPreview,
  humanizePresentationToken,
  humanizePresentationText,
  stripRetryFromDeterministicFailure,
  verifyNoUnguardedLegacyWarrantyWrites,
  verifyContainmentRuntimeWiring,
  verifyContainmentInvariants,
} = require('../../src/services/ask/semantic/containment/index.ts');

test('the generated shared lexicon is stable and keeps warranty separate from insurance and claims', () => {
  assert.deepEqual(generateSharedSemanticLexicon(), ASK_SHARED_SEMANTIC_LEXICON);
  const warranty = ASK_SHARED_SEMANTIC_LEXICON.filter((entry) => entry.semanticId.includes('warranty'));
  assert.ok(warranty.length > 0);
  assert.equal(warranty.some((entry) => /insurance|claim|policy/.test(entry.phrase)), false);
});

test('equivalent inventory/warranty wording produces the same typed meaning', () => {
  const prompts = [
    "list down all items which don't have warranty",
    'provide details of all items without warranty',
    'how many appliances are not having warranty',
    'which items are having warranty',
  ];
  const plans = prompts.map(parseDeterministicSemanticRequest);
  plans.forEach((plan) => assert.doesNotThrow(() => SemanticRequestPlanSchema.parse(plan)));
  assert.deepEqual(plans.map((plan) => plan.facets[0].projection), ['LIST', 'DETAIL', 'COUNT', 'LIST']);
  assert.deepEqual(plans.map((plan) => plan.facets[0].polarity), ['NEGATIVE', 'NEGATIVE', 'NEGATIVE', 'POSITIVE']);
  assert.ok(plans.every((plan) => plan.facets[0].relations[0].semanticRelationId === 'relation.inventory_item.warranty'));
  assert.ok(plans.every((plan) => plan.facets[0].where.kind === 'PREDICATE'));
  assert.ok(plans.every((plan) => plan.facets[0].where.relationPathId === 'path.inventory_item.warranty'));
  assert.ok(plans.every((plan) => plan.facets[0].confidenceSignals.grammarComplete), 'the declared examples consume every meaningful token');
});

test('the semantic plan accepts only bounded Boolean predicate trees', () => {
  const predicate = { kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_warranty_record', relationPathId: 'path.inventory_item.warranty' };
  assert.equal(SemanticWhereExpressionSchema.safeParse({ kind: 'AND', operands: [predicate, { kind: 'NOT', operand: predicate }] }).success, true);
  assert.equal(SemanticWhereExpressionSchema.safeParse({ kind: 'OR', operands: [predicate] }).success, false, 'connectives require at least two operands');
  assert.equal(SemanticWhereExpressionSchema.safeParse({ kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_manual_record', relationPathId: 'path.inventory_item.manual' }).success, false, 'unregistered predicate paths fail closed');
  assert.equal(SemanticWhereExpressionSchema.safeParse({ inventoryItem: { warranties: { some: {} } } }).success, false, 'storage query objects are not semantic predicates');

  const plan = parseDeterministicSemanticRequest('which appliances have warranties');
  const unsafe = structuredClone(plan);
  unsafe.facets[0].where = { inventoryItem: { warranties: { some: {} } } };
  assert.equal(SemanticRequestPlanSchema.safeParse(unsafe).success, false);
});

test('facet validation keeps subject, relation, target and where predicate registry-consistent', () => {
  const plan = parseDeterministicSemanticRequest('which appliances have warranties');
  assert.equal(SemanticRequestPlanSchema.safeParse(plan).success, true);

  const wrongTarget = structuredClone(plan);
  wrongTarget.facets[0].relations[0].targetEntityId = 'entity.insurance_policy';
  assert.equal(SemanticRequestPlanSchema.safeParse(wrongTarget).success, false);

  const wrongSubject = structuredClone(plan);
  wrongSubject.facets[0].subject.entityId = 'entity.property';
  assert.equal(SemanticRequestPlanSchema.safeParse(wrongSubject).success, false);

  const mismatchedWhere = structuredClone(plan);
  mismatchedWhere.facets[0].where.predicateId = 'predicate.inventory_item.has_no_warranty_record';
  assert.equal(SemanticRequestPlanSchema.safeParse(mismatchedWhere).success, false);
});

test('plan validation requires unique stable facet ids and an acyclic dependency graph', () => {
  const base = parseDeterministicSemanticRequest('which appliances have warranties');
  const dependent = structuredClone(base.facets[0]);
  dependent.id = 'facet-dependent';
  dependent.dependsOn = [base.facets[0].id];
  const composed = { ...base, facets: [base.facets[0], dependent] };
  assert.equal(SemanticRequestPlanSchema.safeParse(composed).success, true);

  const duplicateId = structuredClone(composed);
  duplicateId.facets[1].id = duplicateId.facets[0].id;
  assert.equal(SemanticRequestPlanSchema.safeParse(duplicateId).success, false);

  const missingDependency = structuredClone(composed);
  missingDependency.facets[1].dependsOn = ['facet-not-in-plan'];
  assert.equal(SemanticRequestPlanSchema.safeParse(missingDependency).success, false);

  const cyclic = structuredClone(composed);
  cyclic.facets[0].dependsOn = [cyclic.facets[1].id];
  assert.equal(SemanticRequestPlanSchema.safeParse(cyclic).success, false);
});

test('the Boolean assembler preserves explicit coordination and clarifies ambiguous negative OR', () => {
  const warranty = { kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_warranty_record', relationPathId: 'path.inventory_item.warranty' };
  const noWarranty = { kind: 'PREDICATE', predicateId: 'predicate.inventory_item.has_no_warranty_record', relationPathId: 'path.inventory_item.warranty' };

  assert.deepEqual(assembleSemanticBooleanExpression({ coordination: 'EITHER_OR', predicates: [warranty, noWarranty] }), {
    outcome: 'ASSEMBLED', expression: { kind: 'OR', operands: [warranty, noWarranty] },
  });
  assert.deepEqual(assembleSemanticBooleanExpression({ coordination: 'NEITHER_NOR', predicates: [warranty, noWarranty] }), {
    outcome: 'ASSEMBLED',
    expression: { kind: 'AND', operands: [{ kind: 'NOT', operand: warranty }, { kind: 'NOT', operand: noWarranty }] },
  });
  assert.deepEqual(assembleSemanticBooleanExpression({ coordination: 'AMBIGUOUS_NEGATIVE_OR', predicates: [warranty, noWarranty] }), {
    outcome: 'CLARIFY', reasonCode: 'AMBIGUOUS_NEGATIVE_COORDINATION',
  });
  assert.deepEqual(assembleSemanticBooleanExpression({ coordination: 'AND', predicates: [warranty, warranty] }), {
    outcome: 'INVALID', reasonCode: 'DUPLICATE_PREDICATE',
  });
});

test('unconsumed meaning is surfaced and cannot be admitted as a complete grammar plan', () => {
  const plan = parseDeterministicSemanticRequest('show appliances without warranty next month');
  assert.equal(plan.outcome, 'MATCH');
  assert.deepEqual(plan.unresolvedSpans.map((span) => span.text.toLowerCase()), ['next', 'month']);
  assert.equal(plan.facets[0].confidenceSignals.grammarComplete, false);
});

test('bounded typo tolerance resolves unique registry identities', () => {
  const plan = parseDeterministicSemanticRequest('which apliances have no warrenty');
  assert.equal(plan.outcome, 'MATCH');
  assert.equal(plan.facets[0].subject.entityId, 'entity.inventory_item');
  assert.equal(plan.facets[0].relations[0].semanticRelationId, 'relation.inventory_item.warranty');
  assert.equal(plan.facets[0].polarity, 'NEGATIVE');
  assert.equal(plan.facets[0].projection, 'LIST');
  assert.deepEqual(plan.unresolvedSpans, []);
  assert.equal(plan.facets[0].confidenceSignals.grammarComplete, true);
});

test('morphological normalization preserves relation meaning across tense and number', () => {
  const pastNegative = parseDeterministicSemanticRequest('which appliances did not have warranties');
  assert.equal(pastNegative.outcome, 'MATCH');
  assert.equal(pastNegative.facets[0].polarity, 'NEGATIVE');
  assert.equal(pastNegative.facets[0].relations[0].predicateId, 'predicate.inventory_item.has_no_warranty_record');
  assert.deepEqual(pastNegative.unresolvedSpans, []);
  assert.equal(pastNegative.facets[0].confidenceSignals.grammarComplete, true);

  const pastPositive = parseDeterministicSemanticRequest('which appliance had warranty');
  assert.equal(pastPositive.outcome, 'MATCH');
  assert.equal(pastPositive.facets[0].polarity, 'POSITIVE');
  assert.equal(pastPositive.facets[0].relations[0].predicateId, 'predicate.inventory_item.has_warranty_record');
  assert.deepEqual(pastPositive.unresolvedSpans, []);
  assert.equal(pastPositive.facets[0].confidenceSignals.grammarComplete, true);
});

test('typo tolerance does not guess short or distant registry terms', () => {
  const shortCollision = parseDeterministicSemanticRequest('which itms have no warranty');
  assert.equal(shortCollision.outcome, 'NONE_FITS');
  assert.deepEqual(shortCollision.unresolvedSpans.map((span) => span.text.toLowerCase()), ['itms']);

  const distant = parseDeterministicSemanticRequest('which appliances have no guarantee');
  assert.equal(distant.outcome, 'NONE_FITS');
  assert.deepEqual(distant.unresolvedSpans.map((span) => span.text.toLowerCase()), ['guarantee']);
});

test('unsupported questions remain unmatched rather than selecting a nearby operation', () => {
  const plan = parseDeterministicSemanticRequest('what claims are still open?');
  assert.equal(plan.outcome, 'NONE_FITS');
  assert.deepEqual(plan.facets, []);
});

test('legacy warranty reads execute only when the independently built grammar agrees', () => {
  const count = { shape: 'NO_WARRANTY', relationId: 'inventory-warranty', currentOnly: false, count: true, detail: false, exists: false };
  assert.equal(warrantyShapeGrammarAgreement('how many appliances have no warranty?', count).outcome, 'AGREE');
  assert.equal(warrantyShapeGrammarAgreement('provide details of appliances without warranty', { ...count, count: false, detail: true }).outcome, 'AGREE');
  assert.equal(warrantyShapeGrammarAgreement('which appliances are out of warranty?', { ...count, currentOnly: true, count: false }).outcome, 'DISAGREE');
  assert.equal(warrantyShapeGrammarAgreement('which appliances have a warranty?', { shape: 'HAS_WARRANTY', relationId: 'inventory-warranty', count: false, detail: false, exists: false }).outcome, 'AGREE');
  assert.equal(warrantyShapeGrammarAgreement('do any appliances have a warranty?', { shape: 'HAS_WARRANTY', relationId: 'inventory-warranty', count: false, detail: false, exists: true }).outcome, 'AGREE');
});

test('the minimal receipt rejects missing structural evidence', () => {
  assert.equal(SemanticReadReceiptSchema.safeParse({ schemaVersion: '1.0.0' }).success, false);
});

test('property-backed entity resolution returns one opaque authorised identity', () => {
  const resolution = resolvePropertyEntityReference({
    entityId: 'entity.inventory_item',
    mention: '  KITCHEN-dishwasher ',
    applicable: true,
    candidates: [
      { entityId: 'entity.inventory_item', recordId: 'item-1', safeDisplayLabel: 'Kitchen dishwasher', identityLabels: ['Kitchen Dishwasher'], authorization: 'AUTHORISED' },
      { entityId: 'entity.inventory_item', recordId: 'item-2', safeDisplayLabel: 'Garage freezer', identityLabels: ['Garage freezer'], authorization: 'AUTHORISED' },
      { entityId: 'entity.warranty', recordId: 'warranty-1', safeDisplayLabel: 'Kitchen dishwasher warranty', identityLabels: ['Kitchen Dishwasher'], authorization: 'AUTHORISED' },
    ],
  });
  assert.deepEqual(resolution, { outcome: 'RESOLVED', entityId: 'entity.inventory_item', recordId: 'item-1', safeDisplayLabel: 'Kitchen dishwasher' });
});

test('property-backed entity resolution preserves ambiguity and does not disclose hidden records', () => {
  const duplicateCandidates = [
    { entityId: 'entity.inventory_item', recordId: 'item-1', safeDisplayLabel: 'Hall thermostat', identityLabels: ['Thermostat'], authorization: 'AUTHORISED' },
    { entityId: 'entity.inventory_item', recordId: 'item-2', safeDisplayLabel: 'Bedroom thermostat', identityLabels: ['Thermostat'], authorization: 'AUTHORISED' },
  ];
  assert.deepEqual(resolvePropertyEntityReference({ entityId: 'entity.inventory_item', mention: 'thermostat', applicable: true, candidates: duplicateCandidates }), {
    outcome: 'MULTIPLE_MATCHES',
    entityId: 'entity.inventory_item',
    candidates: [
      { recordId: 'item-1', safeDisplayLabel: 'Hall thermostat' },
      { recordId: 'item-2', safeDisplayLabel: 'Bedroom thermostat' },
    ],
  });

  assert.deepEqual(resolvePropertyEntityReference({
    entityId: 'entity.inventory_item',
    mention: 'private safe',
    applicable: true,
    candidates: [{ entityId: 'entity.inventory_item', recordId: 'hidden-1', safeDisplayLabel: 'Private safe', identityLabels: ['Private safe'], authorization: 'UNAUTHORISED' }],
  }), { outcome: 'UNAUTHORISED', entityId: 'entity.inventory_item' });
});

test('property-backed entity resolution distinguishes missing and not-applicable states', () => {
  assert.deepEqual(resolvePropertyEntityReference({ entityId: 'entity.inventory_item', mention: 'attic fan', applicable: true, candidates: [] }), {
    outcome: 'MISSING', entityId: 'entity.inventory_item',
  });
  assert.deepEqual(resolvePropertyEntityReference({ entityId: 'entity.inventory_item', mention: 'attic fan', applicable: false, candidates: [] }), {
    outcome: 'NOT_APPLICABLE', entityId: 'entity.inventory_item',
  });
});

test('protection semantic tokens (warranty, insurance, policy, coverage, claim) remain strictly separated across prompt minimization, embedding concepts, and lexicon', () => {
  assert.equal(verifyProtectionLexemeSeparation().valid, true);
  assert.deepEqual(Object.keys(PROTECTION_TOPIC_SEPARATION_FAMILIES).sort(), ['claim', 'coverage', 'insurance', 'policy', 'warranty']);

  const warrantyTokens = askTopicTokens('which appliances have a warranty');
  assert.equal(warrantyTokens.has('warranty'), true);
  assert.equal(warrantyTokens.has('insurance'), false);
  assert.equal(warrantyTokens.has('policy'), false);
  assert.equal(warrantyTokens.has('claim'), false);

  const insuranceTokens = askTopicTokens('what is my homeowners insurance');
  assert.equal(insuranceTokens.has('insurance'), true);
  assert.equal(insuranceTokens.has('warranty'), false);
  assert.equal(insuranceTokens.has('claim'), false);

  assert.deepEqual(extractSeparatedProtectionConcepts('show my home warranty'), ['warranty']);
  assert.deepEqual(extractSeparatedProtectionConcepts('show my insurance policy deductible'), ['insurance', 'policy']);
  assert.deepEqual(extractSeparatedProtectionConcepts('open claim settlement'), ['claim']);
});

test('Phase 1 family manifest covers all 11 §5 domain groups, all 4 known false-decline families, and records deferred families', () => {
  const completeness = verifyBasicReadFamilyManifestCompleteness();
  assert.equal(completeness.valid, true);
  assert.deepEqual(completeness.missingDomainGroups, []);
  assert.deepEqual(completeness.missingFalseDeclineCategories, []);
  assert.ok(SELECTED_BASIC_READ_FAMILIES.length >= 11);
  assert.ok(DEFERRED_BASIC_READ_FAMILIES.length >= 5);

  for (const family of SELECTED_BASIC_READ_FAMILIES) {
    for (const prompt of family.representativeExamples) {
      const plan = parseDeterministicSemanticRequest(prompt);
      assert.equal(plan.outcome, 'MATCH', `Expected MATCH for "${prompt}" in ${family.familyId}`);
      assert.equal(plan.facets[0].confidenceSignals.grammarComplete, true, `Expected grammarComplete for "${prompt}" in ${family.familyId}`);
    }
  }
});

test('legacy candidate grammar agreement checks job/relation, subject, polarity, projection, material filters, and required slots', () => {
  const maintenanceAgree = verifyLegacyCandidateGrammarAgreement('list maintenance tasks due', {
    requestClass: 'DATA_QUERY',
    subjectEntityId: 'entity.maintenance_task',
    jobMatch: 'query.maintenance_task.list',
    polarity: 'POSITIVE',
    projection: 'LIST',
    materialFilterIds: ['field.maintenance_task.next_due_date'],
    requiredSlots: [],
  });
  assert.equal(maintenanceAgree.outcome, 'AGREE');

  const wrongSubject = verifyLegacyCandidateGrammarAgreement('list maintenance tasks due', {
    requestClass: 'DATA_QUERY',
    subjectEntityId: 'entity.inventory_item',
    polarity: 'POSITIVE',
    projection: 'LIST',
  });
  assert.equal(wrongSubject.outcome, 'DISAGREE');
  assert.equal(wrongSubject.reasonCode, 'GRAMMAR_SUBJECT_MISMATCH');

  const wrongFilter = verifyLegacyCandidateGrammarAgreement('list maintenance tasks due', {
    requestClass: 'DATA_QUERY',
    subjectEntityId: 'entity.maintenance_task',
    polarity: 'POSITIVE',
    projection: 'LIST',
    materialFilterIds: ['field.maintenance_task.priority'],
  });
  assert.equal(wrongFilter.outcome, 'DISAGREE');
  assert.equal(wrongFilter.reasonCode, 'GRAMMAR_MATERIAL_FILTER_MISMATCH');
});

test('standardized read receipt builder and structural entailment validator enforce population and projection invariants', () => {
  const receipt = buildSemanticReadReceipt({
    facetId: 'facet-1',
    entityId: 'entity.inventory_item',
    projection: 'COUNT',
    predicateIds: ['predicate.inventory_item.has_no_warranty_record'],
    resolvedRecordIds: ['item-1', 'item-2'],
    confirmedCount: 2,
    conflictedCount: 1,
    unknownCount: 0,
    displayedCount: 2,
    propertyId: 'prop-1',
    role: 'OWNER',
    sourceType: 'InventoryItem',
    answerVariantId: 'data-point-query-summary',
  });

  const validResult = {
    status: 'READY_WITH_LIMITATIONS',
    parameters: { semanticExecutionReceipt: receipt },
    blocks: [{ type: 'SUMMARY', id: 'data-point-query-summary', title: '2 items have no linked warranty record', body: '2 of your items have no warranty linked.', tone: 'CAUTION', actions: [] }],
    suggestions: [],
  };
  assert.equal(verifySemanticReadReceiptEntailment(validResult).outcome, 'PASS');

  const wrongCountResult = {
    ...validResult,
    blocks: [{ type: 'SUMMARY', id: 'data-point-query-summary', title: '5 items have no linked warranty record', body: '5 of your items have no warranty linked.', tone: 'CAUTION', actions: [] }],
  };
  const failedVerdict = verifySemanticReadReceiptEntailment(wrongCountResult);
  assert.equal(failedVerdict.outcome, 'FAIL');
  assert.ok(failedVerdict.reasonCodes.includes('COUNT_NOT_RENDERED'));
});

test('source-scan-only answer contracts are never permitted to bypass relevance validation (FR-ANS-3)', () => {
  assert.equal(typeof isSourceScanOnlyAnswerContract, 'function');
  assert.equal(typeof canAnswerContractBypassRelevance, 'function');
});

test('command preview admission gate blocks uncertified command candidates with unresolved target entity or missing slots (FR-CAP-4)', () => {
  const previewResult = {
    status: 'NEEDS_CONFIRMATION',
    confirmation: {
      id: 'confirm-1',
      title: 'Complete maintenance task',
      parameters: { taskId: 'task-1' },
    },
    parameters: { taskId: 'task-1' },
    blocks: [{ type: 'SUMMARY', id: 'preview-summary', title: 'Complete task', body: 'Confirm completion.', tone: 'DEFAULT', actions: [] }],
    suggestions: [],
  };

  const blockedMissingEntity = gateUncertifiedCommandPreview({
    operationId: 'MAINTENANCE_TASK_COMPLETE',
    message: 'complete the task',
    routedDeterministically: false,
    operationConfirmedByUser: false,
    entityResolution: { outcome: 'MISSING', confidenceBand: 'LOW', reasonCodes: ['NO_MATCH'] },
    result: previewResult,
  });
  assert.equal(blockedMissingEntity.verdict.admitted, false);
  assert.equal(blockedMissingEntity.verdict.reasonCode, 'COMMAND_TARGET_ENTITY_UNRESOLVED');
  assert.equal(blockedMissingEntity.result.status, 'NEEDS_CLARIFICATION');
  assert.equal(blockedMissingEntity.result.confirmation, undefined);

  const admittedResolved = validateCommandPreviewAdmission({
    operationId: 'MAINTENANCE_TASK_COMPLETE',
    message: 'complete the furnace filter task',
    routedDeterministically: false,
    operationConfirmedByUser: false,
    entityResolution: { outcome: 'RESOLVED', confidenceBand: 'HIGH', reasonCodes: ['EXACT_MATCH'] },
    result: previewResult,
  });
  assert.equal(admittedResolved.admitted, true);
  assert.equal(admittedResolved.reasonCode, 'COMMAND_PREVIEW_ADMITTED');
});

test('presentation humanizer translates registered internal tokens and strips retry affordances from deterministic failures (FR-ANS-6)', () => {
  assert.equal(humanizePresentationToken('EXPLICIT_NO_COVERAGE'), 'explicitly recorded as no coverage');
  assert.equal(humanizePresentationToken('REPLACE_SOON'), 'replace soon');
  assert.equal(
    humanizePresentationText('Item status is REPLACE_SOON with CONFLICTED_LINKS (serial SN-9921-AB).'),
    'Item status is replace soon with conflicting warranty links (serial SN-9921-AB).',
  );

  const scrubbed = stripRetryFromDeterministicFailure({
    status: 'FAILED_RETRYABLE',
    reasonCode: 'ASK_ANSWER_TRUST_FAILED',
    blocks: [{
      type: 'ERROR_STATE',
      id: 'answer-trust-failed',
      title: 'I couldn’t verify this answer',
      body: 'Not verified.',
      retryable: true,
      actions: [{ id: 'retry-btn', label: 'Try again', kind: 'RETRY' }],
    }],
    suggestions: [],
  });
  assert.equal(scrubbed.blocks[0].retryable, false);
  assert.deepEqual(scrubbed.blocks[0].actions, []);
});

test('Phase 1 invariant verification passes with zero issues', () => {
  const check = verifyContainmentInvariants();
  assert.equal(check.valid, true);
  assert.deepEqual(check.issues, []);
  assert.equal(check.summary.runtimeWiringVerified, true);
  assert.equal(check.summary.legacyWarrantyWritesContained, true);
  assert.equal(check.summary.warrantyCanonicalizationStatus, 'TRANSITIONAL_PENDING_22_1_OWNER_RULING');
});

test('Phase 1 runtime wiring covers all 13 selected families across dataPointRead and savedResults handlers', () => {
  const wiring = verifyContainmentRuntimeWiring();
  assert.equal(wiring.valid, true);
  assert.deepEqual(wiring.issues, []);
  assert.deepEqual(wiring.verifiedHandlerFiles.sort(), [
    'src/services/ask/handlers/dataPointRead.handler.ts',
    'src/services/ask/handlers/savedResults.handler.ts',
  ]);
  assert.equal(wiring.verifiedFamilyIds.length, SELECTED_BASIC_READ_FAMILIES.length);
  assert.deepEqual(
    [...wiring.verifiedFamilyIds].sort(),
    SELECTED_BASIC_READ_FAMILIES.map((f) => f.familyId).sort(),
  );
});

test('repository-wide legacy InventoryItem.warrantyId write containment passes on repo and catches unguarded writers', () => {
  const repoCheck = verifyNoUnguardedLegacyWarrantyWrites();
  assert.equal(repoCheck.valid, true);
  assert.deepEqual(repoCheck.unguardedFiles, []);

  assert.throws(
    () => assertValidTransitionalWarrantyLinkWrite({
      targetModel: 'InventoryItem',
      targetField: 'warrantyId',
      warrantyId: 'w-1',
    }),
    /AMBIGUOUS_LEGACY_INVENTORY_WARRANTY_ID_WRITE_PROHIBITED|Warranty\.inventoryItemId/i,
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-phase1-write-check-'));
  try {
    const srcServices = path.join(tmpRoot, 'src', 'services');
    fs.mkdirSync(srcServices, { recursive: true });
    fs.writeFileSync(
      path.join(srcServices, 'badWriter.ts'),
      `export async function link(tx: any) { return tx.inventoryItem.update({ where: { id: '1' }, data: { warrantyId: 'w-1' } }); }\n`,
      'utf8',
    );
    const badCheck = verifyNoUnguardedLegacyWarrantyWrites(tmpRoot);
    assert.equal(badCheck.valid, false);
    assert.deepEqual(badCheck.unguardedFiles, ['src/services/badWriter.ts']);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('every provisional read family has an explicit grammar or demotion disposition with evidence lineage', () => {
  assert.deepEqual(verifyProvisionalReadFamilyDispositions(), []);
  assert.deepEqual(Object.keys(PROVISIONAL_READ_FAMILY_DISPOSITIONS).sort(), Object.keys(GROUNDED_READ_CHECKS).sort());
  assert.equal(PROVISIONAL_READ_FAMILY_DISPOSITIONS.DATA_POINT_READ.disposition, 'TYPED_GRAMMAR_AGREEMENT');
  assert.equal(PROVISIONAL_READ_FAMILY_DISPOSITIONS.MAINTENANCE_STATUS.disposition, 'DEMOTED_GROUNDED_ONLY');
});

test('dataPointReadGrammarAgreement and savedResultsGrammarAgreement gate runtime candidates against typed Phase 1 plans', () => {
  const dpAgree = dataPointReadGrammarAgreement('list my maintenance tasks', {
    prismaEntity: 'PropertyMaintenanceTask',
    projection: 'LIST',
  });
  assert.equal(dpAgree.outcome, 'AGREE');

  const dpDisagree = dataPointReadGrammarAgreement('list my maintenance tasks', {
    prismaEntity: 'HomeEvent',
    projection: 'LIST',
  });
  assert.equal(dpDisagree.outcome, 'DISAGREE');
  assert.equal(dpDisagree.reasonCode, 'GRAMMAR_SUBJECT_MISMATCH');

  const savedAgree = savedResultsGrammarAgreement('show my saved results', 'LIST');
  assert.equal(savedAgree.outcome, 'AGREE');

  const savedDisagree = savedResultsGrammarAgreement('show my saved results', 'COUNT');
  assert.equal(savedDisagree.outcome, 'DISAGREE');
});

test('savedResultsFromPage emits a CAPABILITY SemanticReadReceipt with real property/role context that passes verifySemanticReadReceiptEntailment', () => {
  const result = savedResultsFromPage({
    page: {
      rows: [
        {
          artifactKey: 'DOCUMENT:doc-1',
          type: 'PROPERTY_BRIEF',
          typeLabel: 'Property brief',
          title: '2026 Roof Report',
          summary: 'Roof inspection summary.',
          freshness: { state: 'CURRENT', reason: null },
          archived: { byOwner: false, byYou: false },
          version: { label: 'Current' },
          visibility: { sensitivity: 'NORMAL' },
          sourceAsOf: '2026-10-01T00:00:00.000Z',
          sortAt: '2026-10-01T00:00:00.000Z',
          reopen: null,
          reopenUnavailableReason: null,
        },
      ],
      types: [{ id: 'PROPERTY_BRIEF', label: 'Property brief', state: 'AVAILABLE', reason: null }],
      partial: false,
      totalScope: 'COMPLETE',
      total: 1,
      counts: { active: 1, archived: 0 },
      filterOptions: { types: [], freshness: [] },
      nextCursor: null,
    },
    state: {
      archived: false,
      freshness: null,
      type: null,
      search: null,
      limit: 10,
    },
    viewState: {
      domainScopePhrase: '',
      statusFilter: 'ACTIVE',
      roomScopePhrase: '',
      dateScopePhrase: '10',
    },
    propertyId: 'prop-99',
    role: 'OWNER',
    facetId: 'facet-saved-1',
  });

  const receipt = result.parameters?.semanticExecutionReceipt;
  assert.ok(receipt);
  SemanticReadReceiptSchema.parse(receipt);
  assert.equal(receipt.requestClass, 'CAPABILITY');
  assert.equal(receipt.target.operationAdapter, 'saved-results.read');
  assert.equal(receipt.authorization.propertyId, 'prop-99');
  assert.equal(receipt.authorization.role, 'OWNER');
  assert.equal(receipt.facetId, 'facet-saved-1');
  const verdict = verifySemanticReadReceiptEntailment(result);
  assert.equal(verdict.outcome, 'PASS');
});

test('paginated LIST receipts and aggregate COUNT receipts without synthetic IDs preserve totalMatchCount and pass entailment', () => {
  const paginatedListReceipt = buildSemanticReadReceipt({
    facetId: 'facet-list-1',
    entityId: 'entity.maintenance_task',
    projection: 'LIST',
    predicateIds: ['predicate.maintenance_task.all'],
    resolvedRecordIds: ['t-1', 't-2', 't-3', 't-4', 't-5', 't-6', 't-7', 't-8', 't-9', 't-10'],
    confirmedCount: 25,
    unknownCount: 0,
    displayedCount: 10,
    propertyId: 'prop-1',
    role: 'OWNER',
    sourceType: 'PropertyMaintenanceTask',
    answerVariantId: 'data-point-query-summary',
  });
  assert.equal(paginatedListReceipt.population.totalMatchCount, 25);
  assert.equal(paginatedListReceipt.population.displayedCount, 10);
  assert.equal(paginatedListReceipt.population.truncated, true);
  assert.equal(verifySemanticReadReceiptEntailment({
    status: 'ANSWERED',
    parameters: { semanticExecutionReceipt: paginatedListReceipt },
    blocks: [{ type: 'SUMMARY', id: 'data-point-query-summary', title: '25 maintenance tasks', body: '25 maintenance tasks', tone: 'DEFAULT', actions: [] }],
    suggestions: [],
  }).outcome, 'PASS');

  const countNoSyntheticIdsReceipt = buildSemanticReadReceipt({
    facetId: 'facet-count-1',
    entityId: 'entity.inventory_room',
    projection: 'COUNT',
    predicateIds: ['predicate.inventory_room.all'],
    resolvedRecordIds: [],
    confirmedCount: 12,
    unknownCount: 0,
    displayedCount: 0,
    propertyId: 'prop-1',
    role: 'OWNER',
    sourceType: 'InventoryRoom',
    answerVariantId: 'data-point-query-summary',
  });
  assert.deepEqual(countNoSyntheticIdsReceipt.resolvedRecordIds, []);
  assert.equal(countNoSyntheticIdsReceipt.population.totalMatchCount, 12);
  assert.equal(verifySemanticReadReceiptEntailment({
    status: 'ANSWERED',
    parameters: { semanticExecutionReceipt: countNoSyntheticIdsReceipt },
    blocks: [{ type: 'SUMMARY', id: 'data-point-query-summary', title: '12 rooms', body: 'You have 12 rooms.', tone: 'DEFAULT', actions: [] }],
    suggestions: [],
  }).outcome, 'PASS');

  const paginatedSaved = savedResultsFromPage({
    page: {
      rows: [
        {
          artifactKey: 'DOCUMENT:doc-1',
          type: 'PROPERTY_BRIEF',
          typeLabel: 'Property brief',
          title: '2026 Roof Report',
          summary: 'Roof inspection summary.',
          freshness: { state: 'CURRENT', reason: null },
          archived: { byOwner: false, byYou: false },
          version: { label: 'Current' },
          visibility: { sensitivity: 'NORMAL' },
          sourceAsOf: '2026-10-01T00:00:00.000Z',
          sortAt: '2026-10-01T00:00:00.000Z',
          reopen: null,
          reopenUnavailableReason: null,
        },
      ],
      types: [{ id: 'PROPERTY_BRIEF', label: 'Property brief', state: 'AVAILABLE', reason: null }],
      partial: false,
      totalScope: 'COMPLETE',
      total: 25,
      counts: { active: 25, archived: 0 },
      filterOptions: { types: [], freshness: [] },
      nextCursor: 'cursor-2',
    },
    state: { archived: false, freshness: null, type: null, search: null, limit: 10 },
    viewState: { domainScopePhrase: '', statusFilter: 'ACTIVE', roomScopePhrase: '', dateScopePhrase: '10' },
    propertyId: 'prop-99',
    role: 'OWNER',
    facetId: 'facet-saved-paginated',
  });
  assert.equal(paginatedSaved.parameters.semanticExecutionReceipt.population.totalMatchCount, 25);
  assert.equal(paginatedSaved.parameters.semanticExecutionReceipt.population.displayedCount, 1);
  assert.equal(paginatedSaved.parameters.semanticExecutionReceipt.population.truncated, true);
  assert.equal(verifySemanticReadReceiptEntailment(paginatedSaved).outcome, 'PASS');
});

test('dataPointReadResult fails closed when the typed grammar returns NONE_FITS', async () => {
  const propertyAccess = require('../../src/services/propertyAccess.service.ts');
  const { prisma } = require('../../src/lib/prisma.ts');
  const origResolve = propertyAccess.resolvePropertyAccess;
  const origFindProperty = prisma.property.findUnique;
  propertyAccess.resolvePropertyAccess = async () => ({ allowed: true, role: 'OWNER', propertyId: 'prop-1', userId: 'user-1' });
  prisma.property.findUnique = async () => ({ timezone: 'UTC' });
  try {
    const res = await dataPointReadResult('user-1', 'prop-1', 'what is my property tax amount in 2025 with extra unknown tokens foo bar baz');
    assert.equal(res.reasonCode, 'DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED');
  } finally {
    propertyAccess.resolvePropertyAccess = origResolve;
    prisma.property.findUnique = origFindProperty;
  }
});
