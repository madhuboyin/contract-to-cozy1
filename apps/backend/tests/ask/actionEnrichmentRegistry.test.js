const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

// Actionable Result Enrichment FRD §4: typed registry validation, generated allowlist, and the entity-type metadata source (§4.1).
const registry = require('../../src/services/ask/actionEnrichment/actionEnrichmentRegistry');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy');
const { validateAskRuntimeRegistration, loadAskHandlerManifest } = require('../../src/services/ask/askRuntimeBootstrap');

const row = (overrides = {}) => ({
  id: 'row-1', sourceOperationId: 'DATA_POINT_READ', predicateState: 'warranty:absent', entityType: 'INVENTORY_ITEM',
  actionId: 'record-warranty-item', label: 'Record warranty', message: 'Record a warranty in my home record.', destinationOperationId: 'CAPTURE_WARRANTY_CONFIRM', effect: 'MUTATION', placement: 'INLINE',
  ...overrides,
});
const codes = (entries, presentations) => registry.validateActionEnrichmentRegistry(entries, presentations).map((issue) => `${issue.severity}:${issue.code}`);

test('the shipped registry has no issues of either severity', () => {
  assert.deepEqual(registry.validateActionEnrichmentRegistry(), []);
  assert.ok(registry.ACTION_ENRICHMENT_REGISTRY.length > 0);
});

test('every shipped row\'s canned message equals the destination handler\'s declared-action message (no drift)', () => {
  const { WARRANTY_ADD_MESSAGE } = require('../../src/services/ask/handlers/homeRecordWrites.handler');
  for (const entry of registry.ACTION_ENRICHMENT_REGISTRY.filter((row) => row.destinationOperationId === 'CAPTURE_WARRANTY_CONFIRM')) {
    assert.equal(entry.message, WARRANTY_ADD_MESSAGE);
  }
});

test('a well-formed mutation row and a declared read row validate cleanly; a read destination with no entity-type declaration does not', () => {
  assert.deepEqual(codes([row()]), []);
  // REPLACEMENT_GUIDANCE is a Viewer-accessible read that declares the entity type it accepts.
  const read = row({ id: 'row-2', actionId: 'review-replacement', message: 'Should I repair or replace {item}?', destinationOperationId: 'REPLACEMENT_GUIDANCE', effect: 'READ' });
  assert.deepEqual(registry.validateActionEnrichmentRegistry([read]).map((issue) => issue.code), []);
  // A read destination that declares nothing is fatal, even though it is not a write.
  const undeclared = row({ id: 'row-3', actionId: 'show-status', destinationOperationId: 'MAINTENANCE_STATUS', effect: 'READ' });
  assert.deepEqual(registry.validateActionEnrichmentRegistry([undeclared]).map((issue) => issue.code), ['ENTITY_TYPE_UNSUPPORTED']);
});

test('structural defects are BOOT_FATAL', () => {
  assert.ok(codes([row({ sourceOperationId: 'NOT_AN_OPERATION' })]).includes('BOOT_FATAL:SOURCE_OPERATION_UNKNOWN'));
  assert.ok(codes([row({ destinationOperationId: 'NOT_AN_OPERATION' })]).includes('BOOT_FATAL:DESTINATION_OPERATION_UNKNOWN'));
  assert.ok(codes([row(), row({ id: 'row-2' })]).includes('BOOT_FATAL:DUPLICATE_ACTION_ID'));
  assert.ok(codes([row(), row({ sourceOperationId: 'WARRANTY_LOOKUP' })]).every((code) => !code.includes('DUPLICATE_ACTION_ID')), 'the same action id on a different source operation is fine');
  assert.ok(codes([row(), row({ actionId: 'other' })]).includes('BOOT_FATAL:DUPLICATE_ENTRY_ID'));
  assert.ok(codes([row({ destinationOperationId: 'MAINTENANCE_STATUS' })]).includes('BOOT_FATAL:MUTATION_DESTINATION_NOT_CONFIRMATION_COMMAND'));
  assert.ok(codes([row({ destinationOperationId: 'MAINTENANCE_STATUS' })]).includes('BOOT_FATAL:EFFECT_CONTRADICTS_OPERATION'));
  assert.ok(codes([row({ effect: 'READ' })]).includes('BOOT_FATAL:READ_DESTINATION_MUTATING'));
});

test('entity-type support is read only from the operation definition (§4.1)', () => {
  assert.ok(codes([row({ entityType: 'WORK_ITEM' })]).includes('BOOT_FATAL:ENTITY_TYPE_UNSUPPORTED'), 'CAPTURE_WARRANTY_CONFIRM does not declare WORK_ITEM');
  const evidence = (entityType) => row({ destinationOperationId: 'CAPTURE_EVIDENCE_CONFIRM', actionId: `attach-${entityType}`, entityType, id: `evidence-${entityType}` });
  assert.deepEqual(codes([evidence('INVENTORY_ITEM'), evidence('WARRANTY')]), [], 'CAPTURE_EVIDENCE_CONFIRM accepts INVENTORY_ITEM and WARRANTY');
  assert.deepEqual(ASK_OPERATION_DEFINITIONS.CAPTURE_EVIDENCE_CONFIRM.supportedActionEntityTypes, ['HOME_EVENT', 'INVENTORY_ITEM', 'WARRANTY', 'WORK_ITEM']);
  const unsupportedType = codes([row({ destinationOperationId: 'CAPTURE_EVIDENCE_CONFIRM', entityType: 'ROOM' })]);
  assert.ok(unsupportedType.includes('BOOT_FATAL:ENTITY_TYPE_UNSUPPORTED'), 'an unsupported type is rejected');
});

test('the evidence handler target list equals the operation declaration (no drift)', () => {
  const { EVIDENCE_ATTACH_TARGET_TYPES } = require('../../src/services/ask/handlers/homeRecordWrites.handler');
  assert.deepEqual([...EVIDENCE_ATTACH_TARGET_TYPES].sort(), [...ASK_OPERATION_DEFINITIONS.CAPTURE_EVIDENCE_CONFIRM.supportedActionEntityTypes].sort());
});

test('presentation defects are TEST_ONLY and never reach startup', () => {
  const unsupported = row({ placement: 'DETAIL', presentation: 'SOME_OTHER_LIST' });
  const presentations = { SOME_OTHER_LIST: { supportsDetailPlacement: false } };
  assert.deepEqual(codes([unsupported], presentations), ['TEST_ONLY:DETAIL_PLACEMENT_UNSUPPORTED']);
  assert.deepEqual(codes([row({ placement: 'DETAIL' })]), ['TEST_ONLY:PRESENTATION_UNKNOWN']);
  assert.deepEqual(codes([row({ placement: 'DETAIL', presentation: 'INVENTORY_RESULT_LIST' })]), []);
  assert.deepEqual(registry.actionEnrichmentBootFatalIssues(registry.validateActionEnrichmentRegistry([unsupported], presentations)), [], 'startup ignores TEST_ONLY');
  const fatal = registry.actionEnrichmentBootFatalIssues(registry.validateActionEnrichmentRegistry([row({ sourceOperationId: 'NOT_AN_OPERATION' })]));
  assert.equal(fatal.length, 1);
});

test('the trust allowlist is generated from the registry', () => {
  const generated = registry.actionEnrichmentAllowedActionIds([row(), row({ id: 'r2', actionId: 'second' }), row({ id: 'r3', sourceOperationId: 'WARRANTY_LOOKUP' })]);
  assert.deepEqual([...generated.get('DATA_POINT_READ')].sort(), ['record-warranty-item', 'second']);
  assert.deepEqual([...generated.get('WARRANTY_LOOKUP')], ['record-warranty-item']);
  // The shipped row's id is declared for its source operation, so the trust policy keeps it; an undeclared id is still stripped.
  const action = { id: 'record-warranty-item', label: 'Record warranty', interactionType: 'MUTATE_RECORD', message: 'Record a warranty in my home record.', operationId: 'CAPTURE_WARRANTY_CONFIRM', style: 'SECONDARY' };
  assert.equal(isAskActionApplicable({ action, operationId: 'DATA_POINT_READ', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
  assert.equal(isAskActionApplicable({ action: { ...action, id: 'record-warranty-undeclared' }, operationId: 'DATA_POINT_READ', householdRole: 'OWNER', authoritativeSourceAvailable: true }), false);
  assert.equal(isAskActionApplicable({ action, operationId: 'WARRANTY_LOOKUP', householdRole: 'OWNER', authoritativeSourceAvailable: true }), false, 'declared only for its own source operation');
});

test('startup registration reports no enrichment issues and overflow copy is the product constant', () => {
  loadAskHandlerManifest();
  assert.deepEqual(validateAskRuntimeRegistration().filter((issue) => issue.startsWith('action enrichment')), []);
  assert.equal(registry.ACTION_ENRICHMENT_MAX_INLINE_ROWS, 5);
  assert.equal(registry.actionEnrichmentOverflowCopy(3), '3 more matching items — narrow your question to act on them.');
});
