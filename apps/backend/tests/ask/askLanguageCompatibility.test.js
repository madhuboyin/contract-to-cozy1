const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ASK_DEFAULT_LANGUAGE,
  ASK_LANGUAGE_REGISTRY,
  requireCertifiedAskLanguage,
  validateAskLanguageRegistration,
  validateAskLanguageRegistry,
} = require('../../src/services/ask/askLanguageRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const {
  askOperationSemanticIndexVersion,
  normalizeAskMessage,
  retrieveAskOperationCandidates,
} = require('../../src/services/ask/askSemanticRouter.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

test('TA6 exposes one explicitly certified English registration', () => {
  assert.equal(ASK_DEFAULT_LANGUAGE, 'en');
  assert.deepEqual(Object.keys(ASK_LANGUAGE_REGISTRY), ['en']);
  assert.deepEqual(validateAskLanguageRegistry(), []);

  const english = requireCertifiedAskLanguage('en');
  assert.equal(english.status, 'CERTIFIED');
  assert.equal(english.normalizationContractVersion, 'en-normalization-1.0');
  assert.ok(english.certification.routingSuite);
  assert.ok(english.certification.entitySuite);
  assert.ok(english.certification.presentationSuite);
  assert.ok(english.certification.trustSuite);
});

test('TA6 rejects languages that have not been registered and independently certified', () => {
  assert.throws(
    () => normalizeAskMessage('Necesito ayuda', 'es'),
    (error) => error.code === 'ASK_LANGUAGE_NOT_CERTIFIED',
  );
  assert.throws(
    () => retrieveAskOperationCandidates('Necesito ayuda', { language: 'es' }),
    (error) => error.code === 'ASK_LANGUAGE_NOT_CERTIFIED',
  );
  assert.throws(
    () => resolveAskRoutingCascade('Necesito ayuda', { language: 'es' }),
    (error) => error.code === 'ASK_LANGUAGE_NOT_CERTIFIED',
  );
});

test('TA6 requires certification evidence before a registration can claim support', () => {
  const issues = validateAskLanguageRegistration({
    code: 'es',
    displayName: 'Spanish',
    status: 'CERTIFIED',
    normalizationContractVersion: 'es-normalization-1.0',
    presentationLocale: 'es-US',
    semanticIndexNamespace: 'ask-operations-es-v1',
    certification: null,
  });
  assert.ok(issues.includes('certified language requires certification evidence'));
});

test('TA6 operation contracts carry complete per-language packs without router branches', () => {
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) {
    assert.deepEqual(definition.semantic.supportedLanguages, ['en']);
    const pack = definition.semantic.languagePacks.en;
    assert.equal(pack.language, 'en');
    assert.equal(pack.semanticVersion, definition.semantic.semanticVersion);
    assert.ok(pack.positiveExamples.length >= 2);
    assert.ok(pack.hardNegativeExamples.length >= 1);
    assert.ok(pack.clarificationPromptKey);
  }

  const normalized = normalizeAskMessage('What information does this house still need?', 'en');
  const decision = resolveAskRoutingCascade(normalized.original, { language: 'en' });
  assert.equal(normalized.language, 'en');
  assert.equal(decision.language, 'en');
  assert.equal(decision.operation.operationId, 'PROPERTY_SUMMARY');
  assert.match(askOperationSemanticIndexVersion('en'), /^[a-f0-9]{16}$/);
});
