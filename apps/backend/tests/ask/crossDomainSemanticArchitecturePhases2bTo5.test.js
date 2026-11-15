const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register/transpile-only');

const { ASK_SEMANTIC_DOMAINS } = require('../../src/services/ask/semantic/phase0/semanticOntologyBaseline.ts');
const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const {
  ASK_CROSS_DOMAIN_LEXICON_VERSION,
  ASK_CROSS_DOMAIN_PARSER_VERSION,
  ASK_CROSS_DOMAIN_SEMANTIC_LEXICON,
  DOMAIN_ENABLEMENT_RECORDS,
  DOMAIN_WAVE_MANIFEST,
  OFFLINE_LEXICON_ENRICHMENT_PROPOSALS,
  assignMixedStackFacetOwnership,
  buildSeededCrossDomainSnapshot,
  evaluateCrossDomainGovernanceReport,
  executeCrossDomainFollowUp,
  executeCrossDomainWaves,
  parseCrossDomainSemanticRequest,
  replaySavedCrossDomainResult,
  runCrossDomainAcceptanceBenchmarks,
  runCrossDomainMetamorphicSuite,
  verifyCrossDomainProtectionLexemeSeparation,
  verifyDomainWaveManifestIntegrity,
} = require('../../src/services/ask/semantic/waves/index.ts');

test('Waves 1-5 cover all 14 Section 5 homeowner domains and safety boundary with measured §18 enablement profiles', async () => {
  assert.equal(DOMAIN_WAVE_MANIFEST.length, 5);
  assert.deepEqual(DOMAIN_WAVE_MANIFEST.map((w) => w.order), [1, 2, 3, 4, 5]);
  assert.equal(ASK_SEMANTIC_DOMAINS.length, 15);
  assert.ok(ASK_SEMANTIC_DOMAINS.every((d) => d.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE'));
  assert.equal(DOMAIN_ENABLEMENT_RECORDS.length, 15);

  const report = await evaluateCrossDomainGovernanceReport();
  assert.equal(report.passed, true, `Governance report failures: ${[...report.benchmarks.failures, ...report.metamorphic.failures, ...report.manifestIntegrity.issues].join(' | ')}`);
  assert.equal(report.manifestIntegrity.valid, true, `Manifest issues: ${report.manifestIntegrity.issues.join('; ')}`);
  assert.equal(report.manifestIntegrity.verifiedWithProfiles, true);
  assert.equal(report.coverageProfiles.length, 15);
  for (const profile of report.coverageProfiles) {
    assert.equal(profile.parserVersion, ASK_CROSS_DOMAIN_PARSER_VERSION);
    assert.equal(profile.lexiconVersion, ASK_CROSS_DOMAIN_LEXICON_VERSION);
    assert.ok(profile.supportedFamilies.length > 0);
    assert.ok(profile.excludedFamilies.length > 0);
    assert.equal(profile.declaredEnablementGatePassed, true, `Enablement gate failed for ${profile.domainId}`);
    assert.ok(
      typeof profile.confidenceInterval95?.lower === 'number'
      && typeof profile.confidenceInterval95?.upper === 'number'
      && profile.confidenceInterval95.lower >= 0
      && profile.confidenceInterval95.upper <= 1
      && profile.confidenceInterval95.lower <= profile.confidenceInterval95.upper,
    );
    assert.ok(profile.replayQueryCount >= 1);
  }
  assert.ok(OFFLINE_LEXICON_ENRICHMENT_PROPOSALS.some((p) => p.status === 'REJECTED_COLLISION'));
  assert.ok(OFFLINE_LEXICON_ENRICHMENT_PROPOSALS.some((p) => p.status === 'APPROVED'));
});

test('all 30 Section 20 acceptance rows (ROW_01..ROW_30) and all-15-domain multi-axis metamorphic pairs pass', async () => {
  const benchmarks = await runCrossDomainAcceptanceBenchmarks();
  assert.equal(benchmarks.passed, true, `Benchmark failures: ${benchmarks.failures.join(' | ')}`);
  const expectedRowIds = Array.from({ length: 30 }, (_, idx) => `ROW_${String(idx + 1).padStart(2, '0')}`);
  assert.deepEqual(benchmarks.verifiedRowIds, expectedRowIds);

  const metamorphic = runCrossDomainMetamorphicSuite();
  assert.equal(metamorphic.passed, true, `Metamorphic failures: ${metamorphic.failures.join(' | ')}`);
  assert.equal(metamorphic.domainIdsCovered.length, 15);
  assert.equal(metamorphic.axesCovered.length, 6);
  for (const axis of ['PARAPHRASE', 'INFLECTION', 'NEGATION', 'COORDINATION', 'TYPO_AND_NOISE', 'WORD_ORDER']) {
    assert.ok(metamorphic.axesCovered.includes(axis), `Missing metamorphic axis ${axis}`);
  }
});

test('cross-domain planner compiles from generated semantic lexicon without manual meaningful token list or operation regex chains', () => {
  assert.ok(ASK_CROSS_DOMAIN_SEMANTIC_LEXICON.length >= 60);
  const sep = verifyCrossDomainProtectionLexemeSeparation();
  assert.equal(sep.valid, true, `Protection lexeme collisions: ${sep.violations.join(', ')}`);

  // Bounded 1-edit typo inflection still resolves deterministically via lexicon edit distance
  const typoParsed = parseCrossDomainSemanticRequest('show unpid tax bills');
  assert.equal(typoParsed.plan.outcome, 'MATCH');
  assert.equal(typoParsed.plan.facets[0].evidence.jobMatch, 'query.property_tax_bill.unpaid');

  const sourcePath = path.join(__dirname, '../../src/services/ask/semantic/waves/crossDomainPlanBuilder.ts');
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  assert.equal(sourceText.includes('KNOWN_CROSS_DOMAIN_MEANINGFUL_TOKENS'), false);
  assert.equal(sourceText.includes('matchSingleClauseSpec'), false);
});

test('production dataPointReadResult routes Wave 1-5 MATCH queries through executeCrossDomainOnProperty against live Prisma models', async () => {
  const propertyAccess = require('../../src/services/propertyAccess.service.ts');
  const { prisma } = require('../../src/lib/prisma.ts');
  const origResolve = propertyAccess.resolvePropertyAccess;

  const findManyStubs = [
    ['inventoryRoom', () => []],
    ['inventoryItem', () => []],
    ['warranty', () => []],
    ['propertyMaintenanceTask', () => []],
    ['document', () => []],
    ['insurancePolicy', () => []],
    ['homeEvent', () => []],
    ['propertyTaxBillRecord', () => []],
    ['recallMatch', () => []],
    ['inspectionFinding', () => []],
    ['projectRecord', () => [
      {
        id: 'proj-live-1',
        propertyId: 'prop-live-1',
        name: 'Electrical Subpanel Upgrade',
        status: 'ACTIVE',
        permitApplicability: 'REQUIRED',
      },
    ]],
    ['quoteComparisonQuote', () => []],
    ['homeRiskReplayEventMatch', () => []],
    ['claim', () => [
      {
        id: 'claim-live-1',
        propertyId: 'prop-live-1',
        title: 'Roof hail claim',
        status: 'OPEN',
        documents: [],
        checklistItems: [{ requiredDocTypes: ['PHOTO_EVIDENCE'], required: true }],
      },
    ]],
  ];

  const findUniqueStubs = [
    ['property', () => ({ id: 'prop-live-1', state: 'TX', timezone: 'UTC' })],
    ['homeBuyerChecklist', () => null],
    ['propertySaleCase', () => null],
  ];

  const origFindMany = new Map();
  const origFindUnique = new Map();

  propertyAccess.resolvePropertyAccess = async () => ({ allowed: true, role: 'OWNER', propertyId: 'prop-live-1', userId: 'user-1' });
  for (const [model, fn] of findManyStubs) {
    if (prisma[model]) {
      origFindMany.set(model, prisma[model].findMany);
      prisma[model].findMany = async () => fn();
    }
  }
  for (const [model, fn] of findUniqueStubs) {
    if (prisma[model]) {
      origFindUnique.set(model, prisma[model].findUnique);
      prisma[model].findUnique = async () => fn();
    }
  }

  try {
    const claimsResult = await dataPointReadResult('user-1', 'prop-live-1', 'what claims are open and what documents are missing?');
    assert.equal(claimsResult.status, 'ANSWERED');
    assert.ok(claimsResult.parameters?.crossDomainExecution, 'Expected production crossDomainExecution payload');
    assert.equal(claimsResult.parameters.crossDomainExecution.facetResults.length, 2);
    assert.equal(claimsResult.parameters.crossDomainExecution.facetResults[0].recordIds[0], 'claim-live-1');
    assert.equal(claimsResult.parameters.crossDomainExecution.facetResults[1].recordIds[0], 'claim-live-1:PHOTO_EVIDENCE');
    assert.ok(claimsResult.parameters?.semanticExecutionReceipt);

    const projectResult = await dataPointReadResult('user-1', 'prop-live-1', 'which active projects still need a permit?');
    assert.equal(projectResult.status, 'ANSWERED');
    assert.equal(projectResult.parameters.crossDomainExecution.facetResults[0].recordIds[0], 'proj-live-1');
  } finally {
    propertyAccess.resolvePropertyAccess = origResolve;
    for (const [model, orig] of origFindMany.entries()) {
      prisma[model].findMany = orig;
    }
    for (const [model, orig] of origFindUnique.entries()) {
      prisma[model].findUnique = orig;
    }
  }
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
