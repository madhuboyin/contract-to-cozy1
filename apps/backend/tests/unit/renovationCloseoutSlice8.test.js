'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  caseOutcomeForProjectOutcome,
  closeoutWriteBackKey,
  validateCloseoutDeclarations,
  VERIFIED_CLOSEOUT_REFRESH_TARGETS,
} = require('../../src/services/projectCompliance/closeoutPolicy.ts');
const {
  ConfirmCompletionSchema,
} = require('../../src/validators/projectTracker.validators.ts');

const categories = [
  'PUNCH_LIST',
  'CORRECTIONS',
  'LIEN_WAIVER',
  'PAYMENT',
  'WARRANTY',
  'COMMISSIONING',
  'SAFETY',
  'INSPECTION',
];

const declarations = categories.map((category) => ({
  category,
  disposition: category === 'LIEN_WAIVER' ? 'NOT_APPLICABLE' : 'SATISFIED',
  evidenceDocumentIds: [],
  notes: category === 'LIEN_WAIVER' ? 'No lien waiver applies.' : '',
}));

test('verified closeout requires an explicit disposition for every closeout category', () => {
  const complete = validateCloseoutDeclarations(declarations, true);
  assert.deepEqual(complete.missingCategories, []);
  assert.deepEqual(complete.blockers, []);

  const missing = validateCloseoutDeclarations(declarations.slice(1), true);
  assert.deepEqual(missing.missingCategories, ['PUNCH_LIST']);
  assert.match(missing.blockers[0], /punch list applicability/i);
});

test('open exceptions stay visible and block only verified closure', () => {
  const withOpenItem = declarations.map((item) => item.category === 'CORRECTIONS'
    ? { ...item, disposition: 'OPEN_EXCEPTION', notes: 'Authority correction remains open.' }
    : item);
  assert.match(validateCloseoutDeclarations(withOpenItem, true).blockers[0], /authority correction/i);
  assert.deepEqual(validateCloseoutDeclarations(withOpenItem, false).blockers, []);
});

test('partial outcomes close the case with open items and never claim verified success', () => {
  assert.deepEqual(caseOutcomeForProjectOutcome('VERIFIED_SUCCESS'), {
    lifecycle: 'VERIFIED_COMPLETE',
    outcomeStatus: 'VERIFIED_SUCCESS',
  });
  assert.deepEqual(caseOutcomeForProjectOutcome('INCOMPLETE'), {
    lifecycle: 'COMPLETED_WITH_OPEN_ITEMS',
    outcomeStatus: 'COMPLETED_WITH_OPEN_ITEMS',
  });
});

test('write-back identity and verified refresh targets are deterministic', () => {
  assert.equal(
    closeoutWriteBackKey('project-1', 'PROPERTY_TAX', 'property-1'),
    closeoutWriteBackKey('project-1', 'PROPERTY_TAX', 'property-1'),
  );
  assert.deepEqual(VERIFIED_CLOSEOUT_REFRESH_TARGETS, [
    'DIGITAL_TWIN',
    'PROPERTY_TAX',
    'OWNERSHIP_COST',
    'CAPITAL_PLAN',
  ]);
});

test('completion validator rejects duplicate or incomplete verified declarations', () => {
  const common = {
    outcomeStatus: 'VERIFIED_SUCCESS',
    commissioningResult: 'PASSED',
    functionalVerificationResult: 'PASSED',
    safetyCheckResult: 'PASSED',
    inspectionResult: 'NOT_REQUIRED',
    unresolvedExceptions: [],
    actualCostCents: 100,
    providerOutcome: 'NOT_APPLICABLE',
    recommendationComprehensionConfirmed: true,
  };
  assert.equal(ConfirmCompletionSchema.safeParse({
    ...common,
    closeoutDeclarations: declarations,
  }).success, true);
  assert.equal(ConfirmCompletionSchema.safeParse({
    ...common,
    closeoutDeclarations: declarations.slice(1),
  }).success, false);
  assert.equal(ConfirmCompletionSchema.safeParse({
    ...common,
    closeoutDeclarations: [...declarations, declarations[0]],
  }).success, false);
});

test('closeout service persists package snapshots and verified-only home facts', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '../../src/services/projectTracker.service.ts'),
    'utf8',
  );
  assert.match(service, /closeoutPackage:\s*closeoutPackage/);
  assert.match(service, /verifiedInstalledFactsApplied:\s*verifiedSuccess/);
  assert.match(service, /if \(verifiedSuccess\) \{[\s\S]*inventoryItem\.update/);
  assert.match(service, /projectWriteBack\.upsert/);
  assert.match(service, /CLOSEOUT_RECONCILED/);
  assert.match(service, /projectCloseoutShareLink\.create/);
  assert.match(service, /createHash\('sha256'\)/);
});
