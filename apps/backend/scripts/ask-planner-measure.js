#!/usr/bin/env node
// Measures what the semantic planner would add on the Phase 0a routing corpora (BICC-1B.2 evidence, TUNING grade).
//
//   node scripts/ask-planner-measure.js --limit=120 --seed=1 --out=<file.json>
//
// For every corpus prompt the LOCAL cascade does not already answer correctly (stage REMOTE_FALLBACK or CLARIFICATION and a failing proxy outcome), the real
// planner path (guardedPlan + GeminiUnderstandingProvider, the same call the runtime makes) is asked to plan it. It makes REAL network calls to the provider
// using GEMINI_API_KEY from the repo's .env.local, sending the minimized prompt text and the operation/data-point catalogue only (no home facts exist here).
// The prompts are the team-written synthetic corpora. It bypasses the runtime's stratum-certification gate on purpose: that gate decides whether the planner
// may serve users; this script measures what it WOULD do. It writes nothing but the output file.
const fs = require('node:fs');
const path = require('node:path');
const BACKEND = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));
Object.assign(process.env, require(path.join(BACKEND, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(BACKEND, '../../.env.local'))), { ...process.env });

const { EQUIVALENT, classifyDecision } = require(path.join(BACKEND, 'scripts/lib/askRoutingSweep'));
const { resolveAskRoutingCascade } = require(path.join(BACKEND, 'src/services/ask/askRoutingCascade.ts'));
const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/askOperationRegistry.ts'));
const { DATA_POINT_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/dataPoint/dataPointCatalogue.ts'));
const { guardedPlan, GeminiUnderstandingProvider } = require(path.join(BACKEND, 'src/services/ask/modelRouting/understandingProvider.ts'));
const { MODEL_FACET_MIN_CONFIDENCE } = (() => { try { return require(path.join(BACKEND, 'src/services/ask/modelRouting/runtimeUnderstanding.ts')); } catch { return {}; } })();

const CORPORA = { main: 'tests/fixtures/askRoutingCorpus.js', heldOut1: 'tests/fixtures/askRoutingHoldoutCorpus.js', heldOut2: 'tests/fixtures/askRoutingHoldoutCorpus2.js' };
const OPTIONS = { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'planner-measure-property' };
const limit = Number(args.limit || 120); const seed = Number(args.seed || 1); const concurrency = Number(args.concurrency || 3);

const rng = (() => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; })();
const failing = [];
for (const [corpusKey, file] of Object.entries(CORPORA)) {
  for (const [operationId, prompts] of Object.entries(require(path.join(BACKEND, file)))) {
    if (!ASK_OPERATION_DEFINITIONS[operationId]) continue;
    const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
    prompts.forEach((message, index) => {
      const decision = resolveAskRoutingCascade(message, OPTIONS);
      const scored = classifyDecision(decision, acceptable);
      if (scored.outcome !== 'hit' && scored.outcome !== 'clarOk' && (decision.stage === 'REMOTE_FALLBACK' || decision.stage === 'CLARIFICATION')) failing.push({ promptId: `${corpusKey}:${operationId}:${index}`, message, operationId, acceptable: [...acceptable], localOutcome: scored.outcome, localStage: decision.stage });
    });
  }
}
// A seeded shuffle so the same --seed measures the same prompts.
for (let i = failing.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [failing[i], failing[j]] = [failing[j], failing[i]]; }
const sample = failing.slice(0, limit);
const eligibleOperationIds = new Set(Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable && !String(d.safetyClass).endsWith('_BOUNDARY')).map((d) => d.operationId));
const eligibleDataPointIds = new Set(DATA_POINT_DEFINITIONS.map((p) => p.id));
const floor = typeof MODEL_FACET_MIN_CONFIDENCE === 'number' ? MODEL_FACET_MIN_CONFIDENCE : 0.7;

async function plan(item) {
  const provider = new GeminiUnderstandingProvider();
  const started = Date.now();
  const outcome = await guardedPlan({ message: item.message, provider, providerTermsRecorded: true, planContext: { eligibleOperationIds, eligibleDataPointIds } });
  const row = { ...item, kind: outcome.kind, calls: outcome.calls ?? 0, ms: Date.now() - started };
  if (outcome.kind === 'PLANNED') {
    const facets = outcome.validation.accepted.map((f) => ({ op: f.target.kind === 'OPERATION' ? f.target.operationId : 'DATA_POINT_READ', confidence: f.confidence }));
    row.facets = facets; row.dropped = outcome.validation.dropped.length;
    const usable = facets.filter((f) => f.confidence >= floor);
    row.result = !usable.length ? 'DECLINED' : usable.some((f) => item.acceptable.includes(f.op)) ? 'RECOVERED' : 'WRONG';
  } else row.result = outcome.kind === 'NO_MATCH' ? `NO_MATCH_${outcome.disposition}` : outcome.kind === 'UNAVAILABLE' ? `UNAVAILABLE_${outcome.reason}` : outcome.kind;
  return row;
}
(async () => {
  console.error(`planner measure: ${failing.length} locally-failing prompts, measuring ${sample.length} (seed ${seed}), concurrency ${concurrency}`);
  const rows = []; let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (next < sample.length) { const item = sample[next++]; rows.push(await plan(item)); if (rows.length % 10 === 0) console.error(`  ${rows.length}/${sample.length}`); } }));
  const tally = {}; for (const r of rows) tally[r.result] = (tally[r.result] ?? 0) + 1;
  const out = { measuredAt: new Date().toISOString(), locallyFailing: failing.length, measured: rows.length, seed, floor, tally, calls: rows.reduce((n, r) => n + r.calls, 0), meanMs: Math.round(rows.reduce((n, r) => n + r.ms, 0) / Math.max(1, rows.length)), rows };
  if (args.out) fs.writeFileSync(String(args.out), JSON.stringify(out, null, 1)); else console.log(JSON.stringify({ ...out, rows: undefined }));
  console.log(JSON.stringify({ measured: out.measured, tally, calls: out.calls, meanMs: out.meanMs }));
})();
