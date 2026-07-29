const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('heuristic-only price checks fail closed and disclose planning evidence', () => {
  const engine = source('../../src/services/servicePriceRadar.engine.ts');

  assert.match(
    engine,
    /function hasQualifiedBenchmark\(match: BenchmarkMatch\): boolean \{\s*return match\.matched && match\.qualified && Boolean\(match\.benchmark\);/,
  );
  assert.match(
    engine,
    /const verdict = qualifiedBenchmarkMatched[\s\S]*?: 'INSUFFICIENT_DATA';/,
  );
  assert.match(engine, /evidenceLevel: qualifiedBenchmarkMatched \? 'QUALIFIED_BENCHMARK' : 'CATEGORY_HEURISTIC_ONLY'/);
  assert.match(engine, /cannot determine whether the quote is fair, high, or underpriced/);
});

test('qualified benchmark selection requires provenance, review, freshness, and source health', () => {
  const service = source('../../src/services/servicePriceRadar.service.ts');
  const qualification = source('../../src/services/servicePriceBenchmarkQualification.ts');
  const schema = source('../../prisma/schema.prisma');

  assert.match(service, /qualifyServicePriceBenchmark\(candidate, evaluatedAt\)/);
  assert.match(service, /qualificationReasons: \['SOURCE_UNAVAILABLE'\]/);
  assert.match(qualification, /SOURCE_RIGHTS_NOT_APPROVED/);
  assert.match(qualification, /SOURCE_HEALTH_STALE/);
  assert.match(qualification, /RELEASE_NOT_CURRENT/);
  assert.match(qualification, /SAMPLE_TOO_SMALL/);
  assert.match(schema, /model ServicePriceBenchmarkSource\s*\{/);
  assert.match(schema, /model ServicePriceBenchmarkImportRun\s*\{/);
  assert.match(schema, /model ServicePriceBenchmarkRelease\s*\{/);
  assert.match(schema, /model ServicePriceBenchmarkSourceHealth\s*\{/);
});

test('generating a price check is an intermediate event, not a completed decision', () => {
  const controller = source('../../src/controllers/servicePriceRadar.controller.ts');
  const createHandler = controller.slice(
    controller.indexOf('export async function createServicePriceRadarCheck'),
    controller.indexOf('export async function listServicePriceRadarChecks'),
  );

  assert.doesNotMatch(createHandler, /recordToolCompletion|status: 'COMPLETED'/);
  assert.doesNotMatch(createHandler, /AnalyticsEvent\.ACTION_COMPLETED/);
  assert.match(createHandler, /actionType: 'check_generated'/);
  assert.match(createHandler, /outcomeCompleted: false/);
});

test('low-price output cannot create booking urgency', () => {
  const service = source('../../src/services/servicePriceRadar.service.ts');
  const quoteComparison = source(
    '../../../frontend/src/app/(dashboard)/dashboard/quote-comparison/page.tsx',
  );
  const propertyQuoteComparison = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonWorkspaceClient.tsx',
  );

  assert.doesNotMatch(service, /book while the price is right|label: 'Book this service'/i);
  assert.match(service, /label: 'Verify the quote scope'/);
  assert.doesNotMatch(quoteComparison, /Best Pick|Book this provider|Ranked by price fairness/);
  assert.match(quoteComparison, /Not comparable yet/);
  assert.doesNotMatch(propertyQuoteComparison, /Recommended quote|choose the best quote|Higher confidence and fair-range quotes are prioritized/);
  assert.match(propertyQuoteComparison, /Scope comparability is not established yet/);
});

test('quote intake persists extraction provenance and gates comparison on confirmed scope', () => {
  const schema = source('../../prisma/schema.prisma');
  const service = source('../../src/services/quoteComparison.service.ts');
  const comparability = source('../../src/services/quoteComparability.service.ts');
  const routes = source('../../src/routes/quoteComparison.routes.ts');

  assert.match(schema, /model QuoteComparisonLineItem\s*\{/);
  assert.match(schema, /model QuoteComparisonTerm\s*\{/);
  assert.match(schema, /model QuoteComparisonExtraction\s*\{/);
  assert.match(schema, /model QuoteComparisonFactConfirmation\s*\{/);
  assert.match(service, /createQuoteProposalFromDocument/);
  assert.match(service, /schemaVersion: 'quote-proposal-v1'/);
  assert.match(comparability, /homeownerConfirmation/);
  assert.match(comparability, /stage = 'COMPARISON_READY'/);
  assert.match(routes, /quotes\/from-document/);
  assert.match(routes, /quotes\/:quoteId\/confirm/);
  assert.match(routes, /workspaces\/:workspaceId\/comparability/);
});

test('regulated professional categories are blocked from the generic engine', () => {
  const validators = source('../../src/validators/servicePriceRadar.validators.ts');
  const frontendApi = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi.ts',
  );

  assert.match(validators, /new Set\(\['INSURANCE', 'ATTORNEY', 'FINANCE'\]\)/);
  assert.match(validators, /regulated professional-service category is not supported/);
  assert.doesNotMatch(frontendApi, /\{ value: '(?:INSURANCE|ATTORNEY|FINANCE)'/);
});

test('capability metadata reflects a material financial decision and explicit context', () => {
  const definitions = source('../../src/productFramework/capabilities/definitions/decideCompare.ts');
  const factory = source('../../src/productFramework/capabilities/definitions/capabilityDefinitionFactory.ts');

  assert.match(
    definitions,
    /\['service-price-radar'[\s\S]*?'MATERIAL_FINANCIAL', 'CONTEXTUAL'\]/,
  );
  assert.match(factory, /'service-price-radar': \{[\s\S]*?requiresExplicitTrigger: true/);
  assert.match(factory, /acceptedContext: \[[\s\S]*?'DOCUMENT'[\s\S]*?'SERVICE'[\s\S]*?'JOURNEY'/);
});

test('qualified evidence is snapshotted for the homeowner and operators have lifecycle controls', () => {
  const engine = source('../../src/services/servicePriceRadar.engine.ts');
  const client = source(
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/ServicePriceRadarClient.tsx',
  );
  const governance = source('../../src/services/servicePriceBenchmarkGovernance.service.ts');
  const runbook = source(
    '../../../../docs/operations/SERVICE_PRICE_BENCHMARK_SOURCE_OPERATIONS_RUNBOOK.md',
  );

  for (const field of [
    'releaseVersion',
    'sourceName',
    'sourceUrl',
    'observationStart',
    'observationEnd',
    'expiresAt',
    'methodologySummary',
    'sampleSize',
  ]) {
    assert.ok(engine.includes(field), `missing evidence snapshot field ${field}`);
  }
  assert.match(client, /View benchmark source/);
  assert.match(client, /Observed period/);
  assert.match(client, /Method/);
  assert.match(governance, /ingestServicePriceBenchmarkRelease/);
  assert.match(governance, /reviewServicePriceBenchmarkRelease/);
  assert.match(governance, /activateServicePriceBenchmarkRelease/);
  assert.match(governance, /deactivateServicePriceBenchmarkRelease/);
  assert.match(governance, /rollbackServicePriceBenchmarkRelease/);
  assert.match(runbook, /npm run report:service-price-benchmarks/);
});
