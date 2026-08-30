const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  buildAskRemoteFallbackClaimCandidates,
  selectAndRenderAskRemoteFallbackClaims,
  validateAskLlmPurposeContracts,
} = require('../../src/services/ask/askRemoteFallbackTypedClaims.ts');
const { selectAskGeneralGuidance } = require('../../src/services/ask/askGeneralGuidanceCatalog.ts');

const facts = [
  { key: 'risk.severity', value: 'HIGH', source: 'SYSTEM_DERIVED', observedAt: '2026-08-29T12:00:00.000Z', confidence: 0.9 },
  { key: 'maintenance.dueDate', value: '2026-09-10', source: 'USER_REPORTED', observedAt: '2026-08-29T12:00:00.000Z', confidence: 0.8 },
  { key: 'quote.repairCost', value: 2000, source: 'DOCUMENT', observedAt: '2026-08-29T12:00:00.000Z', confidence: 0.9 },
  { key: 'quote.replacementCost', value: 8000, source: 'DOCUMENT', observedAt: '2026-08-29T12:00:00.000Z', confidence: 0.9 },
];

test('remote fallback exposes a registered, structured-output-only LLM purpose', () => {
  assert.deepEqual(validateAskLlmPurposeContracts(), []);
});

test('the model selects typed fact references while code renders their substance', async () => {
  const candidates = buildAskRemoteFallbackClaimCandidates(facts);
  const selected = candidates.filter((claim) => claim.claimType === 'COST_COMPARISON');
  const rendered = await selectAndRenderAskRemoteFallbackClaims({
    question: 'Compare my repair and replacement costs',
    facts,
    provider: { select: async () => ({ claims: selected }) },
  });

  assert.equal(rendered.length, 1);
  assert.match(rendered[0].text, /Repair Cost \(\$2,000\) is less than Replacement Cost \(\$8,000\)/);
});

test('cost comparisons require a compatible monetary basis and never coerce percentages', () => {
  const candidates = buildAskRemoteFallbackClaimCandidates([
    { key: 'insurance.annualPremium', value: '$2,400', source: 'DOCUMENT', observedAt: null, confidence: 0.9 },
    { key: 'mortgage.monthlyPaymentCents', value: 250000, source: 'USER_REPORTED', observedAt: null, confidence: 0.9 },
    { key: 'insurance.premiumRate', value: '2.5%', source: 'DOCUMENT', observedAt: null, confidence: 0.9 },
  ]);
  assert.equal(candidates.some((claim) => claim.claimType === 'COST_COMPARISON'), false);
});

test('invented fact references and comparison operators cannot enter rendered output', async () => {
  const rendered = await selectAndRenderAskRemoteFallbackClaims({
    question: 'What is urgent?',
    facts,
    provider: { select: async () => ({ claims: [{ claimType: 'SEVERITY_STATEMENT', factRefs: [{ id: 'invented.fact' }] }] }) },
  });
  assert.equal(rendered.length, 0);
  assert.equal(rendered.some((claim) => claim.text.includes('invented')), false);
  assert.equal(rendered.every((claim) => claim.facts.every((fact) => facts.some((known) => known.key === fact.key))), true);
});

test('grounded Ask no longer accepts free-form model prose', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/groundedAsk.service.ts'), 'utf8');
  assert.equal(source.includes('sendMessageToChat'), false);
  assert.equal(source.includes('selectAndRenderAskRemoteFallbackClaims'), true);
});

test('property-less questions resolve only through bounded approved guidance', () => {
  const basement = selectAskGeneralGuidance('Explain the usual reasons a basement gets damp');
  const gutters = selectAskGeneralGuidance('How often should gutters be cleaned?');
  assert.equal(basement.id, 'basement-dampness-causes');
  assert.match(basement.guidance, /drainage|grading/);
  assert.equal(gutters.id, 'gutter-inspection-frequency');
  assert.equal(selectAskGeneralGuidance('Explain quantum field theory'), null);
});
