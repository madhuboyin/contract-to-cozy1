const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register/transpile-only');

const { ASK_SEMANTIC_DOMAINS } = require('../../src/services/ask/semantic/governance/semanticOntologyBaseline.ts');
const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const {
  ASK_CROSS_DOMAIN_LEXICON_VERSION,
  ASK_CROSS_DOMAIN_PARSER_VERSION,
  ASK_CROSS_DOMAIN_SEMANTIC_LEXICON,
  DOMAIN_ENABLEMENT_RECORDS,
  DOMAIN_ROLLOUT_MANIFEST,
  OFFLINE_LEXICON_ENRICHMENT_PROPOSALS,
  assignMixedStackFacetOwnership,
  buildOperationResultFromCrossDomainExecution,
  buildSeededCrossDomainSnapshot,
  evaluateCrossDomainGovernanceReport,
  executeCrossDomainFollowUp,
  executeCrossDomainSnapshot,
  parseCrossDomainSemanticRequest,
  replaySavedCrossDomainResult,
  runCrossDomainAcceptanceBenchmarks,
  runCrossDomainMetamorphicSuite,
  verifyCrossDomainProtectionLexemeSeparation,
  verifyDomainRolloutManifestIntegrity,
} = require('../../src/services/ask/semantic/crossDomain/index.ts');

test('Waves 1-5 cover all 14 Section 5 homeowner domains and safety boundary with measured §18 enablement profiles', async () => {
  assert.equal(DOMAIN_ROLLOUT_MANIFEST.length, 5);
  assert.deepEqual(DOMAIN_ROLLOUT_MANIFEST.map((w) => w.order), [1, 2, 3, 4, 5]);
  assert.equal(ASK_SEMANTIC_DOMAINS.length, 15);
  assert.ok(ASK_SEMANTIC_DOMAINS.every((d) => d.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE'));
  assert.equal(DOMAIN_ENABLEMENT_RECORDS.length, 15);

  const report = await evaluateCrossDomainGovernanceReport();
  assert.equal(report.passed, true, `Governance report failures: ${[...report.benchmarks.failures, ...report.metamorphic.failures, ...report.manifestIntegrity.issues].join(' | ')}`);
  assert.equal(report.manifestIntegrity.valid, true, `Manifest issues: ${report.manifestIntegrity.issues.join('; ')}`);
  assert.equal(report.manifestIntegrity.verifiedWithProfiles, true);
  assert.equal(report.coverageProfiles.length, 15);
  assert.equal(report.evaluationDetailsByDomain.length, 15);
  const detailsByDomain = new Map(report.evaluationDetailsByDomain.map((d) => [d.domainId, d]));
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
    const detail = detailsByDomain.get(profile.domainId);
    assert.ok(detail, `Missing evaluation details for ${profile.domainId}`);
    assert.equal(profile.replayQueryCount, detail.replayExecutedCount);
    assert.ok(profile.replayQueryCount >= 1);
    assert.equal(profile.independentlyAuthoredScenarioCount, detail.inDomainEvaluated);
    assert.equal(detail.inDomainNotUnderstoodCount, Math.max(0, detail.inDomainEvaluated - detail.inDomainResolved));
    assert.equal(profile.deterministicResolvedRate, 1);
    assert.equal(profile.combinedResolvedRate, 1);
    assert.ok(detail.unsupportedCount >= 1, `Expected measured unsupported probes for ${profile.domainId}`);
    assert.equal(profile.unsupportedRate, 1);
    assert.equal(detail.falseDeclineCount, 0);
    assert.equal(profile.falseDeclineRate, 0);
    assert.equal(profile.incorrectHighConfidenceCount, 0);
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

  const sourcePath = path.join(__dirname, '../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');
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
    ['askSavedArtifactPreference', () => []],
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
    ['property', () => ({ id: 'prop-live-1', state: 'TX', timezone: 'UTC', lastAppraisedValue: null })],
    ['homeBuyerChecklist', () => null],
    ['propertySaleCase', () => null],
    ['user', () => ({ role: 'HOMEOWNER' })],
    ['propertyOnboarding', () => null],
  ];

  const findFirstStubs = [
    ['sellHoldRentAnalysis', () => null],
    ['refinanceScenarioSnapshot', () => null],
    ['refinanceOpportunity', () => null],
  ];

  const origFindMany = new Map();
  const origFindUnique = new Map();
  const origFindFirst = new Map();
  const modelCalls = {};

  propertyAccess.resolvePropertyAccess = async () => ({ allowed: true, role: 'OWNER', propertyId: 'prop-live-1', userId: 'user-1' });
  for (const [model, fn] of findManyStubs) {
    if (prisma[model]) {
      origFindMany.set(model, prisma[model].findMany);
      prisma[model].findMany = async () => {
        modelCalls[model] = (modelCalls[model] ?? 0) + 1;
        return fn();
      };
    }
  }
  for (const [model, fn] of findUniqueStubs) {
    if (prisma[model]) {
      origFindUnique.set(model, prisma[model].findUnique);
      prisma[model].findUnique = async () => {
        modelCalls[model] = (modelCalls[model] ?? 0) + 1;
        return fn();
      };
    }
  }
  for (const [model, fn] of findFirstStubs) {
    if (prisma[model]) {
      origFindFirst.set(model, prisma[model].findFirst);
      prisma[model].findFirst = async () => {
        modelCalls[model] = (modelCalls[model] ?? 0) + 1;
        return fn();
      };
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
    assert.equal(modelCalls.claim, 1);
    assert.equal(modelCalls.document, 1);
    assert.equal(modelCalls.askSavedArtifactPreference ?? 0, 0);
    assert.equal(modelCalls.inventoryItem ?? 0, 0);
    assert.equal(modelCalls.projectRecord ?? 0, 0);
    assert.equal(modelCalls.sellHoldRentAnalysis ?? 0, 0);

    const projectResult = await dataPointReadResult('user-1', 'prop-live-1', 'which active projects still need a permit?');
    assert.equal(projectResult.status, 'ANSWERED');
    assert.equal(projectResult.parameters.crossDomainExecution.facetResults[0].recordIds[0], 'proj-live-1');
    assert.equal(modelCalls.projectRecord, 1);
    // Project query must not re-invoke claims, documents, Saved, or inventory models
    assert.equal(modelCalls.claim, 1);
    assert.equal(modelCalls.document, 1);
    assert.equal(modelCalls.askSavedArtifactPreference ?? 0, 0);
    assert.equal(modelCalls.inventoryItem ?? 0, 0);
  } finally {
    propertyAccess.resolvePropertyAccess = origResolve;
    for (const [model, orig] of origFindMany.entries()) {
      prisma[model].findMany = orig;
    }
    for (const [model, orig] of origFindUnique.entries()) {
      prisma[model].findUnique = orig;
    }
    for (const [model, orig] of origFindFirst.entries()) {
      prisma[model].findFirst = orig;
    }
  }
});

test('mixed-stack migration assigns exclusive facet ownership without double execution and labels unresolved remainders', async () => {
  const snapshot = buildSeededCrossDomainSnapshot();
  const prompt = "which appliances are out of warranty and what's my deductible?";

  // Scenario A: warranties enabled on NEW_STACK, insurance delegated to LEGACY_STACK
  const partialMigration = await executeCrossDomainSnapshot({
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
  const unresolvedRemainder = await executeCrossDomainSnapshot({
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

  const exec = await executeCrossDomainSnapshot({
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
  const viewerSpend = await executeCrossDomainSnapshot({
    rawText: 'how much did I spend on repairs last year?',
    snapshot,
    role: 'VIEWER',
    propertyAuthorized: true,
  });
  assert.equal(viewerSpend.facetResults[0].metrics.totalRepairSpendCents, null);
  assert.ok(viewerSpend.redactedFieldIds.includes('field.home_event.actual_cost'));

  // Property authorization refusal
  const forbidden = await executeCrossDomainSnapshot({
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

test('production dataPointReadResult loads live manual/receipt links, canonical finance/saved data, and property timezone', async () => {
  const propertyAccess = require('../../src/services/propertyAccess.service.ts');
  const { prisma } = require('../../src/lib/prisma.ts');
  const origResolve = propertyAccess.resolvePropertyAccess;

  const currentLocalYear = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date()),
  );
  // 202x-01-01T02:00:00.000Z is UTC year 202x, but Dec 31 (year 202x - 1) 21:00 EST in America/New_York
  const lastYearNyBoundaryEventDate = new Date(`${currentLocalYear}-01-01T02:00:00.000Z`);
  let observedDocQueryWhere = null;

  const findManyStubs = [
    ['inventoryRoom', () => [{ id: 'room-k', propertyId: 'prop-ny-1', name: 'Kitchen' }]],
    ['inventoryItem', () => [
      {
        id: 'item-covered',
        warrantyApplicabilities: [],
        propertyId: 'prop-ny-1',
        roomId: 'room-k',
        name: 'Dishwasher',
        category: 'APPLIANCE',
        replacementCostCents: 90000,
        installedOn: null,
        purchasedOn: null,
        lastServicedOn: null,
        technicalSpecs: null,
      },
      {
        id: 'item-missing',
        warrantyApplicabilities: [],
        propertyId: 'prop-ny-1',
        roomId: 'room-k',
        name: 'Microwave',
        category: 'APPLIANCE',
        replacementCostCents: 45000,
        installedOn: null,
        purchasedOn: null,
        lastServicedOn: null,
        technicalSpecs: null,
      },
    ]],
    ['warranty', () => []],
    ['propertyMaintenanceTask', () => []],
    ['document', (args) => {
      observedDocQueryWhere = args?.where ?? null;
      return [
        {
          id: 'doc-manual-1',
          propertyId: 'prop-ny-1',
          inventoryItemId: 'item-covered',
          name: 'Bosch Dishwasher Owner Manual',
          description: 'Installation & operating manual',
          type: 'OTHER',
          metadata: null,
          deletedAt: null,
        },
        {
          id: 'doc-receipt-1',
          propertyId: 'prop-ny-1',
          inventoryItemId: 'item-covered',
          name: 'Appliance Receipt',
          description: 'Purchase invoice',
          type: 'INVOICE',
          metadata: null,
          deletedAt: null,
        },
        {
          id: 'doc-deleted-manual',
          propertyId: 'prop-ny-1',
          inventoryItemId: 'item-missing',
          name: 'Microwave Manual',
          description: null,
          type: 'OTHER',
          metadata: null,
          deletedAt: new Date('2026-01-05T00:00:00.000Z'),
        },
      ];
    }],
    ['insurancePolicy', () => []],
    ['homeEvent', () => [
      {
        id: 'evt-ny-boundary',
        propertyId: 'prop-ny-1',
        type: 'REPAIR',
        title: 'Holiday Pipe Repair',
        occurredAt: lastYearNyBoundaryEventDate,
        amount: 450,
      },
    ]],
    ['propertyTaxBillRecord', () => []],
    ['recallMatch', () => []],
    ['inspectionFinding', () => []],
    ['projectRecord', () => []],
    ['quoteComparisonQuote', () => []],
    ['toolOverride', () => [{ key: 'MONTHLY_RENT_NOW', value: 2000 }]],
    ['homeRiskReplayEventMatch', () => []],
    ['claim', () => []],
    ['askSavedArtifactPreference', () => []],
    ['askConfirmationReceipt', () => []],
    ['quoteComparisonWorkspace', () => []],
    ['recommendationSnapshot', () => []],
    ['propertyBrief', () => []],
    ['seasonalChecklist', () => []],
    ['sellHoldRentAnalysis', () => []],
    ['coverageComparison', () => []],
    ['financingScenario', () => []],
    ['replaceRepairAnalysis', () => []],
    ['homeCapitalTimelineAnalysis', () => []],
    ['homeScoreReport', () => []],
    ['homeReportExport', (args) => {
      if (args?.where?.regeneratedFromId) return [];
      return [
        {
          id: 'rep-live-1',
          type: 'HOME_REPORT_PACK',
          status: 'READY',
          requestedAt: new Date('2026-10-01T12:00:00.000Z'),
          completedAt: new Date('2026-10-01T12:05:00.000Z'),
          expiresAt: new Date('2027-10-01T12:05:00.000Z'),
          regeneratedFromId: null,
          shareToken: null,
          shareRevokedAt: null,
        },
      ];
    }],
    ['refinanceScenarioSnapshot', () => [
      {
        id: 'refi-saved-1',
        targetRate: 5.5,
        targetTerm: 'THIRTY_YEAR',
        monthlySavings: 240,
        createdAt: new Date('2026-10-10T12:00:00.000Z'),
        updatedAt: new Date('2026-10-10T12:00:00.000Z'),
      },
    ]],
  ];

  const findUniqueStubs = [
    ['property', () => ({
      id: 'prop-ny-1',
      state: 'NY',
      timezone: 'America/New_York',
      lastAppraisedValue: 480000,
    })],
    ['homeBuyerChecklist', () => null],
    ['propertySaleCase', () => null],
    ['user', () => ({ role: 'HOMEOWNER' })],
    ['propertyOnboarding', () => ({
      propertyId: 'prop-ny-1',
      ownershipState: 'ESTABLISHED_OWNER',
      entryPath: null,
      propertyOrigin: null,
      entryContextVersion: 'v1',
      entryContextCapturedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })],
  ];

  const findFirstStubs = [
    ['sellHoldRentAnalysis', () => ({
      id: 'shr-live-1',
      years: 5,
      homeValueNowCents: 48000000,
      netRentCents: 12000000,
      drivers: { annualOwnershipCostCents: 2400000, annualRentalNetCents: 2640000 },
    })],
    ['refinanceScenarioSnapshot', () => ({
      id: 'refi-snap-1',
      targetRate: 5.5,
      closingCost: 6000,
      metadataJson: {
        currentRatePct: 6.75,
        loanBalanceCents: 38000000,
      },
    })],
    ['refinanceOpportunity', () => null],
  ];

  const origFindMany = new Map();
  const origFindUnique = new Map();
  const origFindFirst = new Map();
  const origCount = new Map();

  propertyAccess.resolvePropertyAccess = async () => ({ allowed: true, role: 'OWNER', propertyId: 'prop-ny-1', userId: 'user-1' });
  for (const [model, fn] of findManyStubs) {
    if (prisma[model]) {
      origFindMany.set(model, prisma[model].findMany);
      prisma[model].findMany = async (args) => fn(args);
    }
  }
  for (const [model, fn] of findUniqueStubs) {
    if (prisma[model]) {
      origFindUnique.set(model, prisma[model].findUnique);
      prisma[model].findUnique = async (args) => fn(args);
    }
  }
  for (const [model, fn] of findFirstStubs) {
    if (prisma[model]) {
      origFindFirst.set(model, prisma[model].findFirst);
      prisma[model].findFirst = async (args) => fn(args);
    }
  }
  for (const model of [
    'homeReportExport',
    'refinanceScenarioSnapshot',
    'quoteComparisonWorkspace',
    'recommendationSnapshot',
    'propertyBrief',
    'seasonalChecklist',
    'sellHoldRentAnalysis',
    'coverageComparison',
    'financingScenario',
    'replaceRepairAnalysis',
    'homeCapitalTimelineAnalysis',
    'homeScoreReport',
  ]) {
    if (prisma[model]?.count) {
      origCount.set(model, prisma[model].count);
      prisma[model].count = async () => (model === 'homeReportExport' || model === 'refinanceScenarioSnapshot' ? 1 : 0);
    }
  }

  try {
    // 1. Live manual/receipt linking & deletedAt filtering
    const docsResult = await dataPointReadResult('user-1', 'prop-ny-1', 'which appliances have neither a manual nor a receipt?');
    assert.equal(docsResult.status, 'ANSWERED');
    assert.equal(observedDocQueryWhere?.deletedAt, null);
    assert.deepEqual(docsResult.parameters.crossDomainExecution.facetResults[0].recordIds, ['item-missing']);

    // 2. Live canonical finance (own vs rent & refinance break-even)
    const ownVsRent = await dataPointReadResult('user-1', 'prop-ny-1', 'how long until owning beats renting?');
    assert.equal(ownVsRent.status, 'ANSWERED');
    const ownRentFacet = ownVsRent.parameters.crossDomainExecution.facetResults[0];
    assert.equal(ownRentFacet.metrics.monthlyRentCents, 200000);
    assert.equal(ownRentFacet.metrics.homeValueCents, 48000000);
    assert.equal(ownRentFacet.metrics.horizonYears, 5);
    assert.equal(typeof ownRentFacet.metrics.breaksEvenWithinHorizon, 'boolean');
    assert.ok('crossoverYear' in ownRentFacet.metrics);
    assert.deepEqual(ownRentFacet.receipt.predicateIds, ['predicate.property.evaluates_break_even']);

    // Contract enforcement: camel-case key 'monthlyRentNow' is rejected by parseSellHoldRentOverrides (must be 'MONTHLY_RENT_NOW')
    const prevToolOverrideFindMany = prisma.toolOverride.findMany;
    prisma.toolOverride.findMany = async () => [{ key: 'monthlyRentNow', value: 2000 }];
    const unsupportedOverrideOwnVsRent = await dataPointReadResult('user-1', 'prop-ny-1', 'how long until owning beats renting?');
    assert.equal(unsupportedOverrideOwnVsRent.status, 'READY_WITH_LIMITATIONS');
    assert.ok(unsupportedOverrideOwnVsRent.parameters.crossDomainExecution.facetResults[0].missingSlots.includes('monthlyRentCents'));
    prisma.toolOverride.findMany = prevToolOverrideFindMany;

    const refi = await dataPointReadResult('user-1', 'prop-ny-1', 'would refinancing break even within three years?');
    assert.equal(refi.status, 'ANSWERED');
    const refiFacet = refi.parameters.crossDomainExecution.facetResults[0];
    assert.equal(refiFacet.metrics.closingCostsCents, 600000);
    assert.equal(refiFacet.metrics.currentRateBps, 675);
    assert.equal(refiFacet.metrics.candidateRateBps, 550);
    assert.equal(refiFacet.metrics.breaksEvenWithinHorizon, true);
    assert.ok(typeof refiFacet.metrics.breakEvenMonths === 'number' && refiFacet.metrics.breakEvenMonths <= 36);
    assert.ok(typeof refiFacet.metrics.monthlySavingsCents === 'number' && refiFacet.metrics.monthlySavingsCents > 0);
    assert.match(refiFacet.summary, /^Yes\b/i);
    assert.deepEqual(refiFacet.receipt.predicateIds, ['predicate.property.evaluates_break_even']);

    // Canonical persisted breakEvenMonths / monthlySavings exceeding 3-year horizon -> No
    prisma.refinanceScenarioSnapshot.findFirst = async () => ({
      id: 'refi-snap-slow',
      targetRate: 6.25,
      closingCost: 6000,
      monthlySavings: 125,
      breakEvenMonths: 48,
      metadataJson: { currentRatePct: 6.75 },
    });
    const slowRefi = await dataPointReadResult('user-1', 'prop-ny-1', 'would refinancing break even within three years?');
    assert.equal(slowRefi.status, 'ANSWERED');
    const slowRefiFacet = slowRefi.parameters.crossDomainExecution.facetResults[0];
    assert.equal(slowRefiFacet.metrics.breakEvenMonths, 48);
    assert.equal(slowRefiFacet.metrics.monthlySavingsCents, 12500);
    assert.equal(slowRefiFacet.metrics.breaksEvenWithinHorizon, false);
    assert.match(slowRefiFacet.summary, /^No\b/i);

    // Missing both loanBalance and persisted savings/breakEvenMonths -> fail closed PARTIAL
    prisma.refinanceScenarioSnapshot.findFirst = async () => ({
      id: 'refi-snap-missing-bal',
      targetRate: 5.5,
      closingCost: 6000,
      monthlySavings: null,
      breakEvenMonths: null,
      metadataJson: { currentRatePct: 6.75 },
    });
    const missingBalRefi = await dataPointReadResult('user-1', 'prop-ny-1', 'would refinancing break even within three years?');
    assert.equal(missingBalRefi.status, 'READY_WITH_LIMITATIONS');
    assert.ok(missingBalRefi.parameters.crossDomainExecution.facetResults[0].missingSlots.includes('loanBalanceCents'));

    // 3. Live canonical Saved via getAskSavedPage
    const saved = await dataPointReadResult('user-1', 'prop-ny-1', 'show my saved items');
    assert.equal(saved.status, 'ANSWERED');
    const savedIds = saved.parameters.crossDomainExecution.facetResults[0].recordIds;
    assert.ok(savedIds.includes('report:rep-live-1'), `Expected report:rep-live-1 in ${JSON.stringify(savedIds)}`);
    assert.ok(savedIds.includes('refinance:refi-saved-1'), `Expected refinance:refi-saved-1 in ${JSON.stringify(savedIds)}`);

    // 4. Property timezone preserved in calendar repair spend ("last year" boundary in America/New_York)
    const spend = await dataPointReadResult('user-1', 'prop-ny-1', 'how much did I spend on repairs last year?');
    assert.equal(spend.status, 'ANSWERED');
    assert.equal(spend.parameters.crossDomainExecution.facetResults[0].metrics.totalRepairSpendCents, 45000);
    assert.deepEqual(spend.parameters.crossDomainExecution.facetResults[0].recordIds, ['evt-ny-boundary']);

    // 5. Property.lastAppraisedValue fallback preserves cent denomination (46_500_000 cents = $465k, not *100)
    prisma.property.findUnique = async () => ({
      id: 'prop-ny-1',
      state: 'NY',
      timezone: 'America/New_York',
      lastAppraisedValue: 46500000,
    });
    prisma.sellHoldRentAnalysis.findFirst = async () => ({
      id: 'shr-fallback-cents',
      years: 5,
      homeValueNowCents: null,
      netRentCents: 12000000,
      drivers: null,
    });
    const appraisalFallback = await dataPointReadResult('user-1', 'prop-ny-1', 'how long until owning beats renting?');
    assert.equal(appraisalFallback.status, 'ANSWERED');
    assert.equal(appraisalFallback.parameters.crossDomainExecution.facetResults[0].metrics.homeValueCents, 46500000);

    // 6. Saved partial reader failure fails closed to READY_WITH_LIMITATIONS (not confident EXECUTED)
    prisma.homeScoreReport.findMany = async () => {
      throw new Error('simulated saved reader failure');
    };
    const partialSaved = await dataPointReadResult('user-1', 'prop-ny-1', 'show my saved items');
    assert.equal(partialSaved.status, 'READY_WITH_LIMITATIONS');
    assert.equal(partialSaved.reasonCode, 'CROSS_DOMAIN_PARTIAL');
    assert.deepEqual(partialSaved.parameters.crossDomainExecution.facetResults[0].missingSlots, ['saved_results_partial']);
    assert.ok(partialSaved.parameters.crossDomainExecution.facetResults[0].recordIds.includes('report:rep-live-1'));

    // 7. Complete Saved failure returns limitation state, never confident ANSWERED "0 saved result(s)"
    prisma.askSavedArtifactPreference.findMany = async () => {
      throw new Error('database unreachable');
    };
    const failedSaved = await dataPointReadResult('user-1', 'prop-ny-1', 'show my saved items');
    assert.equal(failedSaved.status, 'READY_WITH_LIMITATIONS');
    assert.equal(failedSaved.reasonCode, 'CROSS_DOMAIN_PARTIAL');
    assert.equal(failedSaved.parameters.crossDomainExecution.facetResults[0].status, 'PARTIAL_MISSING_SLOTS');
    assert.deepEqual(failedSaved.parameters.crossDomainExecution.facetResults[0].missingSlots, ['saved_results_unavailable']);

    // 8. Canonical SellHoldRentAnalysis array drivers without ToolOverride does NOT divide netRentCents by years*12
    prisma.toolOverride.findMany = async () => [];
    prisma.sellHoldRentAnalysis.findFirst = async () => ({
      id: 'shr-canonical-array-drivers',
      years: 5,
      winner: 'HOLD',
      homeValueNowCents: 48000000,
      netHoldCents: 15000000,
      netRentCents: 12000000,
      drivers: [{ factor: 'Equity growth', impact: 'POSITIVE' }],
    });
    const canonicalNoOverride = await dataPointReadResult('user-1', 'prop-ny-1', 'how long until owning beats renting?');
    assert.equal(canonicalNoOverride.status, 'ANSWERED');
    const canonicalFacet = canonicalNoOverride.parameters.crossDomainExecution.facetResults[0];
    assert.equal(canonicalFacet.metrics.monthlyRentCents, null);
    assert.equal(canonicalFacet.metrics.crossoverYear, null);
    assert.equal(canonicalFacet.metrics.breaksEvenWithinHorizon, true);
    assert.equal(canonicalFacet.metrics.ownAdvantageAtHorizonCents, 3000000);
    assert.doesNotMatch(canonicalFacet.summary, /starting in year/i);
    assert.match(canonicalFacet.summary, /requires a monthly-rent assumption/i);

    // 9. Live multi-quote ambiguity returns NEEDS_CLARIFICATION, while named pair resolves & executes
    prisma.quoteComparisonQuote.findMany = async () => [
      {
        id: 'quote-1',
        vendorName: 'Harbor Kitchen Craft',
        quoteAmount: 28500,
        serviceLocation: 'Kitchen',
        serviceCategory: 'REMODEL',
        serviceLabelRaw: 'Kitchen cabinet & counter remodel',
        scopeSummary: 'Kitchen remodel',
        workspace: { propertyId: 'prop-ny-1', scopeSummary: 'Kitchen remodel', serviceCategory: 'REMODEL' },
      },
      {
        id: 'quote-2',
        vendorName: 'Summit Remodelers',
        quoteAmount: 31200,
        serviceLocation: 'Kitchen',
        serviceCategory: 'REMODEL',
        serviceLabelRaw: 'Kitchen remodel',
        scopeSummary: 'Kitchen remodel',
        workspace: { propertyId: 'prop-ny-1', scopeSummary: 'Kitchen remodel', serviceCategory: 'REMODEL' },
      },
      {
        id: 'quote-3',
        vendorName: 'Northside Kitchens',
        quoteAmount: 29900,
        serviceLocation: 'Kitchen',
        serviceCategory: 'REMODEL',
        serviceLabelRaw: 'Kitchen cabinet install',
        scopeSummary: 'Kitchen remodel',
        workspace: { propertyId: 'prop-ny-1', scopeSummary: 'Kitchen remodel', serviceCategory: 'REMODEL' },
      },
    ];
    const liveAmbiguousQuotes = await dataPointReadResult('user-1', 'prop-ny-1', 'compare these two kitchen contractor quotes');
    assert.equal(liveAmbiguousQuotes.status, 'NEEDS_CLARIFICATION');
    assert.equal(liveAmbiguousQuotes.reasonCode, 'AMBIGUOUS_QUOTE_SELECTION');
    assert.equal(liveAmbiguousQuotes.parameters.clarification.candidateRecords.length, 3);

    const liveNamedQuotes = await dataPointReadResult('user-1', 'prop-ny-1', 'compare Harbor and Northside');
    assert.equal(liveNamedQuotes.status, 'ANSWERED');
    const namedQuoteFacet = liveNamedQuotes.parameters.crossDomainExecution.facetResults[0];
    assert.deepEqual(namedQuoteFacet.recordIds, ['quote-1', 'quote-3']);
    assert.equal(namedQuoteFacet.metrics.deltaCents, -140000);
    assert.match(namedQuoteFacet.summary, /Harbor Kitchen Craft.*Northside Kitchens/);
    assert.deepEqual(failedSaved.parameters.crossDomainExecution.facetResults[0].recordIds, []);
  } finally {
    propertyAccess.resolvePropertyAccess = origResolve;
    for (const [model, orig] of origFindMany.entries()) {
      prisma[model].findMany = orig;
    }
    for (const [model, orig] of origFindUnique.entries()) {
      prisma[model].findUnique = orig;
    }
    for (const [model, orig] of origFindFirst.entries()) {
      prisma[model].findFirst = orig;
    }
    for (const [model, orig] of origCount.entries()) {
      prisma[model].count = orig;
    }
  }
});

test('Semantic receipts use domain-appropriate predicates, quote comparison respects requested scope, and rich lists expose human titles', async () => {
  const base = buildSeededCrossDomainSnapshot();

  // 1. Receipt lineage uses registered capability/scope predicates (never unrelated tax/inspection/project/buyer predicates)
  const envRes = await executeCrossDomainSnapshot({
    rawText: 'what environmental risks affect this home this week?',
    snapshot: base,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.deepEqual(envRes.facetResults[0].receipt.predicateIds, ['predicate.environmental_risk.active_in_week']);

  const savedRes = await executeCrossDomainSnapshot({
    rawText: 'show my saved items',
    snapshot: base,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.deepEqual(savedRes.facetResults[0].receipt.predicateIds, ['predicate.saved_result.visible_to_role']);
  const savedOp = buildOperationResultFromCrossDomainExecution(savedRes);
  const savedListBlock = savedOp.blocks.find((b) => b.type === 'GROUPED_LIST');
  assert.ok(savedListBlock && savedListBlock.type === 'GROUPED_LIST');
  assert.deepEqual(
    savedListBlock.sections[0].items.map((item) => item.title),
    ['Winterization Readiness Checklist', 'Confidential Refinance Brief'],
  );

  // 2. Quote comparison attaches kitchen scope and keeps two_resolved_quotes UNRESOLVED until unambiguously resolved
  const quotePlan = parseCrossDomainSemanticRequest('compare these two kitchen contractor quotes');
  assert.equal(quotePlan.plan.outcome, 'MATCH');
  assert.equal(quotePlan.plan.facets[0].where?.predicateId, 'predicate.contractor_quote.compared_in_scope');
  assert.equal(quotePlan.plan.facets[0].where?.targetRecordId, 'kitchen');
  assert.deepEqual(quotePlan.plan.facets[0].requiredSlots, [{ slotId: 'slot.quotes.two_resolved_quotes', state: 'UNRESOLVED' }]);

  const mixedQuotesSnapshot = {
    ...base,
    contractorQuotes: [
      {
        id: 'quote-bath-1',
        propertyId: base.propertyId,
        roomTag: 'Bathroom',
        vendorName: 'Bath Craft LLC',
        amountCents: 1400000,
        timelineDays: 10,
        warrantyMonths: 12,
      },
      {
        id: 'quote-bath-2',
        propertyId: base.propertyId,
        roomTag: 'Bathroom',
        vendorName: 'Tile Pros',
        amountCents: 1650000,
        timelineDays: 12,
        warrantyMonths: 24,
      },
      ...base.contractorQuotes,
    ],
  };

  const kitchenQuoteRes = await executeCrossDomainSnapshot({
    rawText: 'compare these two kitchen contractor quotes',
    snapshot: mixedQuotesSnapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(kitchenQuoteRes.status, 'ANSWERED');
  assert.deepEqual(kitchenQuoteRes.facetResults[0].recordIds, ['quote-1', 'quote-2']);
  assert.deepEqual(kitchenQuoteRes.facetResults[0].receipt.predicateIds, ['predicate.contractor_quote.compared_in_scope']);
  const quoteOp = buildOperationResultFromCrossDomainExecution(kitchenQuoteRes);
  const quoteListBlock = quoteOp.blocks.find((b) => b.type === 'GROUPED_LIST');
  assert.ok(quoteListBlock && quoteListBlock.type === 'GROUPED_LIST');
  assert.deepEqual(
    quoteListBlock.sections[0].items.map((item) => item.title),
    ['Harbor Kitchen Craft', 'Summit Remodelers'],
  );

  // If < 2 kitchen quotes exist, fail closed to PARTIAL rather than pulling bathroom quotes
  const partialQuoteRes = await executeCrossDomainSnapshot({
    rawText: 'compare these two kitchen contractor quotes',
    snapshot: {
      ...base,
      contractorQuotes: [
        mixedQuotesSnapshot.contractorQuotes[0],
        mixedQuotesSnapshot.contractorQuotes[1],
        base.contractorQuotes[0],
      ],
    },
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(partialQuoteRes.status, 'PARTIAL');
  assert.equal(partialQuoteRes.facetResults[0].status, 'PARTIAL_MISSING_SLOTS');
  assert.deepEqual(partialQuoteRes.facetResults[0].recordIds, ['quote-1']);

  // If > 2 kitchen quotes exist without explicit quote IDs bound, return structured CLARIFY + selectable candidates
  const threeKitchenQuotesSnapshot = {
    ...base,
    contractorQuotes: [
      ...base.contractorQuotes,
      {
        id: 'quote-3',
        propertyId: base.propertyId,
        roomTag: 'Kitchen',
        vendorName: 'Northside Kitchens',
        amountCents: 2990000,
        timelineDays: 20,
        warrantyMonths: 24,
      },
    ],
  };
  const ambiguousQuoteRes = await executeCrossDomainSnapshot({
    rawText: 'compare these two kitchen contractor quotes',
    snapshot: threeKitchenQuotesSnapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(ambiguousQuoteRes.status, 'CLARIFY');
  assert.equal(ambiguousQuoteRes.clarification?.reasonCode, 'AMBIGUOUS_QUOTE_SELECTION');
  assert.deepEqual(ambiguousQuoteRes.clarification?.options, ['Harbor Kitchen Craft', 'Summit Remodelers', 'Northside Kitchens']);
  assert.equal(ambiguousQuoteRes.clarification?.candidateRecords?.length, 3);
  assert.equal(ambiguousQuoteRes.facetResults[0].status, 'PARTIAL_MISSING_SLOTS');
  assert.deepEqual(ambiguousQuoteRes.facetResults[0].missingSlots, ['slot.quotes.two_resolved_quotes']);
  assert.deepEqual(ambiguousQuoteRes.facetResults[0].recordIds, []);
  assert.equal(ambiguousQuoteRes.facetResults[0].metrics.ambiguousQuoteSelection, true);
  assert.equal(ambiguousQuoteRes.facetResults[0].metrics.candidateCount, 3);
  const ambiguousQuoteOp = buildOperationResultFromCrossDomainExecution(ambiguousQuoteRes);
  assert.equal(ambiguousQuoteOp.status, 'NEEDS_CLARIFICATION');
  assert.equal(ambiguousQuoteOp.reasonCode, 'AMBIGUOUS_QUOTE_SELECTION');
  assert.ok(ambiguousQuoteOp.blocks.some((b) => b.type === 'GROUPED_LIST'));

  // Follow-up selection binds exact pair into facet.where + resolves slot.quotes.two_resolved_quotes
  const quoteFollowUp = executeCrossDomainFollowUp({
    priorPrompt: 'compare these two kitchen contractor quotes',
    followUpText: 'Harbor and Northside',
    snapshot: threeKitchenQuotesSnapshot,
  });
  assert.equal(quoteFollowUp.outcome, 'REFINED');
  assert.equal(quoteFollowUp.plan.facets[0].requiredSlots[0]?.state, 'RESOLVED');
  assert.equal(quoteFollowUp.plan.facets[0].where?.targetRecordId, 'kitchen');
  assert.deepEqual(quoteFollowUp.plan.facets[0].where?.targetCategorySet, ['quote-1', 'quote-3']);

  const refinedQuoteExec = await executeCrossDomainSnapshot({
    rawText: 'Harbor and Northside',
    snapshot: threeKitchenQuotesSnapshot,
    role: 'OWNER',
    propertyAuthorized: true,
    planOverride: quoteFollowUp.plan,
  });
  assert.equal(refinedQuoteExec.status, 'ANSWERED');
  assert.deepEqual(refinedQuoteExec.facetResults[0].recordIds, ['quote-1', 'quote-3']);
  assert.equal(refinedQuoteExec.facetResults[0].metrics.deltaCents, -140000);

  // Direct comparison naming two quotes resolves & executes cleanly even with 3+ candidates on the property
  const directNamedQuoteExec = await executeCrossDomainSnapshot({
    rawText: 'compare Harbor and Northside',
    snapshot: threeKitchenQuotesSnapshot,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(directNamedQuoteExec.status, 'ANSWERED');
  assert.deepEqual(directNamedQuoteExec.facetResults[0].recordIds, ['quote-1', 'quote-3']);
  assert.equal(directNamedQuoteExec.facetResults[0].metrics.deltaCents, -140000);

  // Authoritative persisted RENT analysis must never be overridden by fallback crossover model
  const persistedRentWins = await executeCrossDomainSnapshot({
    rawText: 'how long until owning beats renting?',
    snapshot: {
      ...base,
      financeSlots: {
        ...base.financeSlots,
        netHoldCents: 8000000,
        netRentCents: 12000000,
        sellHoldRentWinner: 'RENT',
      },
    },
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(persistedRentWins.status, 'ANSWERED');
  const rentWinsFacet = persistedRentWins.facetResults[0];
  assert.equal(rentWinsFacet.metrics.breaksEvenWithinHorizon, false);
  assert.equal(rentWinsFacet.metrics.crossoverYear, null);
  assert.equal(rentWinsFacet.metrics.ownAdvantageAtHorizonCents, -4000000);
  assert.equal(rentWinsFacet.metrics.sellHoldRentWinner, 'RENT');
  assert.match(rentWinsFacet.summary, /^Owning does not beat renting/i);
  assert.doesNotMatch(rentWinsFacet.summary, /starting in year/i);

  // 3. Rich list presentation renders real titles for claims & projects instead of raw IDs
  const claimsAndProjects = await executeCrossDomainSnapshot({
    rawText: 'what claims are open and which active projects still need a permit?',
    snapshot: base,
    role: 'OWNER',
    propertyAuthorized: true,
  });
  assert.equal(claimsAndProjects.status, 'ANSWERED');
  const richOp = buildOperationResultFromCrossDomainExecution(claimsAndProjects);
  const richList = richOp.blocks.find((b) => b.type === 'GROUPED_LIST');
  assert.ok(richList && richList.type === 'GROUPED_LIST');
  const renderedTitles = richList.sections.flatMap((s) => s.items.map((i) => i.title));
  assert.ok(renderedTitles.includes('Water-damage claim'), `Missing claim title in ${JSON.stringify(renderedTitles)}`);
  assert.ok(renderedTitles.includes('200A Electrical Panel Upgrade'), `Missing project title in ${JSON.stringify(renderedTitles)}`);
  assert.ok(!renderedTitles.includes('claim-water-damage'), 'Raw claim ID must not be rendered as title');
  assert.ok(!renderedTitles.includes('proj-panel-upgrade'), 'Raw project ID must not be rendered as title');
});
