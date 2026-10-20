const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-placeholder-key';

const budgets = require('../../src/services/ask/governance/askPerformanceBudgets.ts');
const { withProviderTimeout, ProviderTimeoutError, ASK_PROVIDER_TIMEOUT_MS } = require('../../src/services/ask/support/providerTimeout.ts');
const { composeAskWorkPage } = require('../../src/services/ask/askWork.service.ts');
const { composeAskSavedPage } = require('../../src/services/ask/askSaved.service.ts');
const { ASK_WORK_PROVIDER_REGISTRY } = require('../../src/services/ask/governance/askWorkProviderRegistry.ts');
const { ASK_ARTIFACT_TYPE_REGISTRY } = require('../../src/services/ask/governance/askArtifactTypeRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');

const src = (...parts) => path.join(__dirname, '../../src/services/ask', ...parts);

// ---- Budgets -----------------------------------------------------------------------------------------------------------------------------------------------

test('every destination read has a numeric latency and payload budget, still proposed until an owner approves it', () => {
  assert.deepEqual(budgets.ASK_PERFORMANCE_BUDGETS.map((b) => b.id).sort(), ['INTAKE_STATE', 'NOTIFICATIONS_PAGE', 'RECORD_INDEX', 'RECORD_SECTION_PAGE', 'SAVED_PAGE', 'SEARCH', 'WORK_PAGE']);
  for (const budget of budgets.ASK_PERFORMANCE_BUDGETS) {
    assert.ok(Number.isFinite(budget.p50Ms) && budget.p50Ms > 0 && budget.p95Ms > budget.p50Ms, `${budget.id} latency`);
    assert.ok(budget.maxPayloadBytes >= 10_000 && budget.maxPayloadBytes <= 500_000, `${budget.id} payload`);
  }
  assert.equal(budgets.ASK_PERFORMANCE_BUDGET_STATUS.status, 'PROPOSED');
  assert.equal(budgets.ASK_PERFORMANCE_BUDGET_STATUS.approvedBy, null, 'nobody has approved these yet, and the code does not pretend otherwise');
  assert.ok(budgets.ASK_CLIENT_BUDGETS.destinationChromeVisibleMs > 0);
});

test('percentiles are computed from the sorted samples', () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(budgets.percentile(samples, 0.5), 50);
  assert.equal(budgets.percentile(samples, 0.95), 95);
  assert.equal(budgets.percentile([7], 0.95), 7);
  assert.equal(budgets.percentile([], 0.5), 0);
});

// ---- Bounded providers -------------------------------------------------------------------------------------------------------------------------------------

test('a provider that does not answer is cut off, a quick one is untouched, and its own error is kept', async () => {
  assert.equal(await withProviderTimeout(Promise.resolve('fast'), 50), 'fast');
  await assert.rejects(() => withProviderTimeout(new Promise(() => {}), 20), (error) => error instanceof ProviderTimeoutError);
  await assert.rejects(() => withProviderTimeout(Promise.reject(new Error('boom')), 50), /boom/);
  assert.equal(ASK_PROVIDER_TIMEOUT_MS, 4000);
});

test('every destination provider is read under a bound: Work, Saved, Record counts and Search all go through the shared timeout', () => {
  for (const [file, pattern] of [['askWork.service.ts', /withProviderTimeout\(reader\(/], ['askSaved.service.ts', /withProviderTimeout\(reader\(context/], ['askRecordIndex.service.ts', /withProviderTimeout\(reader\(/], ['askSearch.service.ts', /withProviderTimeout\(provider\.search\(/]]) {
    assert.match(fs.readFileSync(src(file), 'utf8'), pattern, file);
  }
});

test('a Work provider that hangs is reported as unavailable and the page is partial, not blocked and not zero', { timeout: 15000 }, async () => {
  const readers = {};
  for (const definition of ASK_WORK_PROVIDER_REGISTRY) readers[definition.id] = async () => ({ rows: [], total: 0, viewCounts: null });
  readers.OPERATIONAL_WORK_ITEMS = () => new Promise(() => {});
  const started = Date.now();
  const page = await composeAskWorkPage({ userId: 'u', propertyId: 'p', role: 'OWNER', operatingMode: 'OWNING' }, { view: 'NEEDS_YOU', limit: 25, after: null, workType: null, status: null }, readers);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= ASK_PROVIDER_TIMEOUT_MS - 200 && elapsed < ASK_PROVIDER_TIMEOUT_MS + 3000, `waited ${elapsed}ms`);
  const hung = page.providers.find((provider) => provider.providerId === 'OPERATIONAL_WORK_ITEMS');
  assert.equal(hung.state, 'FAILED');
  assert.match(hung.reason, /took too long/);
  assert.equal(page.partial, true);
  assert.equal(page.total, null, 'no total is claimed when a provider did not answer');
});

test('a Saved type that hangs is reported as unavailable and the page is partial', { timeout: 15000 }, async () => {
  const readers = {};
  for (const definition of ASK_ARTIFACT_TYPE_REGISTRY) if (definition.reader.state === 'CONNECTED') readers[definition.id] = async () => ({ rows: [], total: 0, otherTotal: 0 });
  readers.PROPERTY_BRIEF = () => new Promise(() => {});
  const page = await composeAskSavedPage({ userId: 'u', propertyId: 'p', role: 'OWNER', operatingMode: 'OWNING' }, { after: null, limit: 25, search: null, artifactType: null, freshness: null, archived: false }, readers);
  const hung = page.types.find((type) => type.artifactType === 'PROPERTY_BRIEF');
  assert.equal(hung.state, 'FAILED');
  assert.match(hung.reason, /took too long/);
  assert.equal(page.partial, true);
  assert.equal(page.total, null);
});

// ---- LLM unavailable ---------------------------------------------------------------------------------------------------------------------------------------

test('with every model-backed control off, exactly one registered operation depends on remote generation, and it says so plainly', () => {
  const controls = readAskOperationalControls({ ASK_REMOTE_GENERATION_ENABLED: 'false', ASK_SEMANTIC_RETRIEVAL_ENABLED: 'false', ASK_EMBEDDING_RETRIEVAL_ENABLED: 'false', ASK_CONSTRAINED_CLASSIFIER_ENABLED: 'false', ASK_RESULT_SYNTHESIS_ENABLED: 'false' });
  assert.equal(controls.remoteGenerationEnabled, false);
  assert.equal(controls.semanticRetrievalEnabled, false);
  const remote = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => definition.executionMode === 'REMOTE_GENERATION').map((definition) => definition.operationId);
  assert.deepEqual(remote, ['GROUNDED_GUIDANCE'], 'every other operation is deterministic, so it works without a model');
});

test('the destinations that must keep working without a model never import a model client', () => {
  const model = /@google\/genai|GoogleGenAI|documentIntelligence|aiRequestGovernance|executeGovernedAIRequest|askSemanticRouter|askSemanticEmbedding/;
  const files = [
    'askRecordIndex.service.ts', 'askRecordCollections.service.ts', 'askRecordDetail.service.ts', 'askRecordExportReview.service.ts', 'askWork.service.ts', 'askSaved.service.ts', 'askSearch.service.ts',
    'askNotificationInbox.service.ts', 'askNotificationSettings.service.ts', 'askNotificationContinuation.service.ts', 'askRetention.service.ts', 'askUnknownOutcomeReconciliation.ts',
    ...fs.readdirSync(src('work')).map((f) => `work/${f}`), ...fs.readdirSync(src('saved')).map((f) => `saved/${f}`), ...fs.readdirSync(src('search')).map((f) => `search/${f}`),
    ...fs.readdirSync(src('governance')).map((f) => `governance/${f}`),
  ];
  assert.ok(files.length > 25, `only ${files.length} files were checked`);
  for (const file of files) assert.doesNotMatch(fs.readFileSync(src(file), 'utf8').replace(/\/\/.*$/gm, ''), model, `${file} must not depend on a model`);
});

test('the file intake is the only destination that calls a model, and only when the person has agreed', () => {
  const intake = fs.readFileSync(src('askIntake.service.ts'), 'utf8');
  assert.match(intake, /ASK_INTAKE_DISCLOSURE_NOT_ACKNOWLEDGED/);
  const callers = fs.readdirSync(src('.')).filter((f) => f.endsWith('.ts') && /documentIntelligenceService|extractInspectionFindings/.test(fs.readFileSync(src(f), 'utf8')));
  assert.deepEqual(callers, ['askIntake.service.ts']);
});

test('when the model is down, reading a file fails safely: nothing is written, the file is kept, and the person can keep it or remove it', async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  const storage = require('../../src/services/storage/reportStorage.ts');
  const { documentIntelligenceService } = require('../../src/services/documentIntelligence.service.ts');
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
  const intake = require('../../src/services/ask/askIntake.service.ts');
  const writes = [];
  const record = { id: 'r1', title: 'receipt', recordType: 'OTHER', lifecycleStatus: 'ACTIVE', currentVersion: { id: 'v1', originalFileName: 'receipt.pdf', mimeType: 'application/pdf', fileSizeBytes: 10, sha256: 'a', createdAt: new Date(), scanStatus: 'CLEAN', storageKey: 'k', extractedFacts: [] } };
  prisma.propertyRecord = { findFirst: async () => record, update: async (args) => { writes.push(['record.update', args]); return record; } };
  prisma.inventoryDraftItem = { findFirst: async () => null };
  prisma.inspectionReport = { findFirst: async () => null };
  prisma.extractedFactCandidate = { createMany: async (args) => { writes.push(['candidates', args]); }, findMany: async () => [] };
  storage.downloadObjectBuffer = async () => Buffer.from('%PDF');
  process.env.S3_BUCKET = 'b';
  documentIntelligenceService.analyzeDocument = async () => { throw new APIError('Failed to analyze document with AI service.', 502, 'AI_UPSTREAM_ERROR'); };
  homeRecordsService.trash = async () => { writes.push(['trash']); record.lifecycleStatus = 'TRASHED'; };
  const ctx = { propertyId: 'p1', userId: 'u1', role: 'OWNER' };
  await assert.rejects(() => intake.analyzeAskIntake(ctx, 'r1', { kind: 'AUTO', acknowledgedProcessing: true }), (error) => error.code === 'AI_UPSTREAM_ERROR');
  assert.deepEqual(writes, [], 'the failed read wrote nothing');
  assert.equal((await intake.getAskIntake(ctx, 'r1')).state, 'UPLOADED', 'the file is still there, unread');
  assert.equal((await intake.discardAskIntake(ctx, 'r1')).state, 'DISCARDED');
});
