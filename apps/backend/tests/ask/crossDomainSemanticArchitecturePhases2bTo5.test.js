const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ASK_SEMANTIC_DOMAINS } = require('../../src/services/ask/semantic/phase0/semanticOntologyBaseline.ts');
const {
  DOMAIN_ENABLEMENT_RECORDS,
  DOMAIN_LANGUAGE_COVERAGE_PROFILES,
  DOMAIN_WAVE_MANIFEST,
  OFFLINE_LEXICON_ENRICHMENT_PROPOSALS,
  assignMixedStackFacetOwnership,
  buildSeededCrossDomainSnapshot,
  executeCrossDomainFollowUp,
  executeCrossDomainWaves,
  parseCrossDomainSemanticRequest,
  replaySavedCrossDomainResult,
  runCrossDomainAcceptanceBenchmarks,
  runCrossDomainMetamorphicSuite,
  verifyDomainWaveManifestIntegrity,
} = require('../../src/services/ask/semantic/waves/index.ts');

test('Waves 1-5 cover all 14 Section 5 homeowner domains and safety boundary with separate coverage profiles', () => {
  assert.equal(DOMAIN_WAVE_MANIFEST.length, 5);
  assert.deepEqual(DOMAIN_WAVE_MANIFEST.map((w) => w.order), [1, 2, 3, 4, 5]);
  assert.equal(ASK_SEMANTIC_DOMAINS.length, 15);
  assert.ok(ASK_SEMANTIC_DOMAINS.every((d) => d.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE'));
  assert.equal(DOMAIN_ENABLEMENT_RECORDS.length, 15);
  assert.ok(DOMAIN_LANGUAGE_COVERAGE_PROFILES.length >= 6);
  const integrity = verifyDomainWaveManifestIntegrity();
  assert.equal(integrity.valid, true, `Manifest issues: ${integrity.issues.join('; ')}`);
  assert.ok(OFFLINE_LEXICON_ENRICHMENT_PROPOSALS.some((p) => p.status === 'REJECTED_COLLISION'));
  assert.ok(OFFLINE_LEXICON_ENRICHMENT_PROPOSALS.some((p) => p.status === 'APPROVED'));
});

test('all 28 Section 20 acceptance rows, dual-parent claim docs, permits, finance slots, and follow-ups pass', async () => {
  const benchmarks = await runCrossDomainAcceptanceBenchmarks();
  assert.equal(benchmarks.passed, true, `Benchmark failures: ${benchmarks.failures.join(' | ')}`);
  assert.ok(benchmarks.checkedCount >= 26);

  const metamorphic = runCrossDomainMetamorphicSuite();
  assert.equal(metamorphic.passed, true, `Metamorphic failures: ${metamorphic.failures.join(' | ')}`);
  assert.equal(metamorphic.pairCount, 4);
});

test('mixed-stack migration assigns exclusive facet ownership without double execution and labels unresolved remainders', async () => {
  const snapshot = buildSeededCrossDomainSnapshot();
  const prompt = "which appliances are out of warranty and what's my deductible?";

  // Scenario A: warranties enabled on NEW_STACK, insurance delegated to LEGACY_STACK
  const partialMigration = await executeCrossDomainWaves({
    rawText: prompt,
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
    enabledDomains: new Set(['domain.warranties_coverage']),
    allowLegacyFallback: true,
  });
  assert.equal(partialMigration.status, 'ANSWERED');
  assert.equal(partialMigration.facetResults[0].owner.owner, 'NEW_STACK');
  assert.equal(partialMigration.facetResults[1].owner.owner, 'LEGACY_STACK');
  assert.equal(partialMigration.facetResults[1].owner.adapterId, 'legacy.insurance_policy.deductible_and_terms');
  assert.deepEqual(partialMigration.executionCountByFacetId, { 'facet-1': 1, 'facet-2': 1 });

  // Scenario B: no legacy fallback for insurance -> explicit UNRESOLVED remainder, zero silent drop
  const unresolvedRemainder = await executeCrossDomainWaves({
    rawText: prompt,
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
    enabledDomains: new Set(['domain.warranties_coverage']),
    allowLegacyFallback: false,
  });
  assert.equal(unresolvedRemainder.status, 'PARTIAL');
  assert.equal(unresolvedRemainder.facetResults[0].owner.owner, 'NEW_STACK');
  assert.equal(unresolvedRemainder.facetResults[1].owner.owner, 'UNRESOLVED');
  assert.equal(unresolvedRemainder.facetResults[1].status, 'UNRESOLVED');

  const parsed = parseCrossDomainSemanticRequest(prompt);
  const ownerships = assignMixedStackFacetOwnership(parsed.plan.facets, {
    enabledDomains: new Set(['domain.warranties_coverage']),
    allowLegacyFallback: true,
  });
  assert.equal(ownerships.length, 2);
});

test('six-facet budget executes 6 dependent facets cleanly and records DOMAIN_NOT_SEARCHED overflow beyond 6', async () => {
  const snapshot = buildSeededCrossDomainSnapshot();
  const sevenClausePrompt =
    'show open claims, missing claim documents, overdue maintenance, expired warranties, unpaid tax bills, active projects, and saved items';
  const parsed = parseCrossDomainSemanticRequest(sevenClausePrompt);
  assert.equal(parsed.plan.outcome, 'MATCH');
  assert.equal(parsed.plan.facets.length, 6);
  assert.deepEqual(parsed.plan.facets[1].dependsOn, ['facet-1']);
  assert.equal(parsed.overflowFacets.length, 1);
  assert.equal(parsed.overflowFacets[0].reasonCode, 'DOMAIN_NOT_SEARCHED');

  const exec = await executeCrossDomainWaves({
    rawText: sevenClausePrompt,
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(exec.status, 'PARTIAL');
  assert.equal(exec.facetResults.length, 6);
  assert.equal(exec.overflowFacets.length, 1);
  assert.ok(exec.answer.includes('DOMAIN_NOT_SEARCHED'));
});

test('fail-closed unresolved tokens, role redaction, unauthorized property access, and replay reauthorization work across waves', async () => {
  const snapshot = buildSeededCrossDomainSnapshot();

  // Fail-closed unknown token in cross-domain read & capability
  assert.equal(parseCrossDomainSemanticRequest('what claims are open florb').plan.outcome, 'NONE_FITS');
  assert.equal(parseCrossDomainSemanticRequest('would refinancing break even within three years zqxw').plan.outcome, 'NONE_FITS');

  // Role redaction for VIEWER on financial repair spend & insurance deductible
  const viewerSpend = await executeCrossDomainWaves({
    rawText: 'how much did I spend on repairs last year?',
    snapshot,
    role: 'VIEWER',
    propertyAuthorized: true,
  });
  assert.equal(viewerSpend.facetResults[0].metrics.totalRepairSpendCents, null);
  assert.ok(viewerSpend.redactedFieldIds.includes('field.home_event.actual_cost'));

  // Property authorization refusal
  const forbidden = await executeCrossDomainWaves({
    rawText: 'show my saved items',
    snapshot,
    role: 'OWNER',
    propertyAuthorized: false,
  });
  assert.equal(forbidden.status, 'FORBIDDEN');

  // Replay downgrade blocks confidential OWNER brief for VIEWER, while keeping VIEWER checklist replay allowed
  const allowedReplay = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[0],
    currentSnapshot: snapshot,
    currentRole: 'VIEWER',
    propertyAuthorized: true,
    rawPromptFallback: 'show my saved items',
  });
  assert.equal(allowedReplay.status, 'ANSWERED');
  assert.deepEqual(allowedReplay.facetResults[0].recordIds, ['saved-1']);

  const blockedReplay = await replaySavedCrossDomainResult({
    savedResult: snapshot.savedResults[1],
    currentSnapshot: snapshot,
    currentRole: 'VIEWER',
    propertyAuthorized: true,
    rawPromptFallback: 'show my saved items',
  });
  assert.equal(blockedReplay.status, 'FORBIDDEN');

  // Unresolved follow-up fails closed without dropping user tokens
  const badFollowUp = executeCrossDomainFollowUp({
    priorPrompt: 'list items without warranty',
    followUpText: 'florb',
    snapshot,
  });
  assert.equal(badFollowUp.outcome, 'CLARIFY_UNRESOLVED');
});
