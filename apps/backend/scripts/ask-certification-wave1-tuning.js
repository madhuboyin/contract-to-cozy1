#!/usr/bin/env node
// BICC certification work queue, first wave (docs/architecture/ASK_COZY_BICC_CERTIFICATION_WORK_QUEUE.md): runs the wave-1 TUNING prompts
// (tests/fixtures/certification/wave1-tuning.json) through the real deterministic router and reports, per operation pool, what a sealed run
// would measure. Offline: no database, no network. TUNING ONLY: it finds rules to fix and can never certify one.
//
//   node scripts/ask-certification-wave1-tuning.js [--json=out.json] [--misses]
const fs = require('node:fs');
const path = require('node:path');
const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));

const core = require('./lib/askFastPathCertification');
const ask = (p) => require(path.join(BACKEND, 'src/services/ask', p));
const { resolveAskOperation, ruleIdOfResolution, ASK_OPERATION_DEFINITIONS } = ask('askOperationRegistry.ts');
const { correctKnownMisspellings } = ask('support/commonMisspellings.ts');
const { normalizeForRouting } = ask('support/routingNormalization.ts');
const cert = ask('fastPath/fastPathCertificates.ts');

const args = process.argv.slice(2);
const jsonPath = (args.find((a) => a.startsWith('--json=')) ?? '').slice(7) || null;
const showMisses = args.includes('--misses');
const file = path.join(BACKEND, 'tests/fixtures/certification/wave1-tuning.json');
const set = JSON.parse(fs.readFileSync(file, 'utf8'));

// The same steps the cascade takes before the deterministic router.
const resolvePrompt = (prompt) => {
  const raw = resolveAskOperation(correctKnownMisspellings(prompt));
  const resolution = /BOUNDARY$/.test(raw.operationId) ? raw : resolveAskOperation(normalizeForRouting(prompt));
  return { operationId: resolution.operationId, ruleId: resolution.operationId === 'GROUNDED_GUIDANCE' ? null : ruleIdOfResolution(resolution) };
};

const problems = [];
// Labels must name real operations (a sentinel is allowed where no registered operation exists yet for the intent).
const unknownExpected = new Set();
for (const row of set.rows) if (row.kind !== 'POSITIVE' && row.expected && !ASK_OPERATION_DEFINITIONS[row.expected]) unknownExpected.add(row.expected);
const seen = new Map();
for (const row of set.rows) { const key = `${row.pool}|${row.prompt.trim().toLowerCase()}`; if (seen.has(key)) problems.push(`duplicate prompt in pool ${row.pool}: ${row.prompt}`); seen.set(key, true); }

const evaluated = core.evaluateSealedSet({ rows: set.rows, resolve: resolvePrompt, rulesOf: cert.fastPathPoolOf, adjacentOf: cert.fastPathAdjacentOperations });
const report = {};
for (const pool of set.pools) {
  const rows = set.rows.filter((row) => row.pool === pool);
  const positives = rows.filter((row) => row.kind === 'POSITIVE');
  const missed = positives.map((row) => ({ row, got: resolvePrompt(row.prompt) })).filter(({ got }) => got.operationId !== pool);
  const claimedByPoolRule = positives.filter((row) => { const got = resolvePrompt(row.prompt); return got.operationId === pool && got.ruleId; }).length;
  const wrong = rows.filter((row) => row.kind !== 'POSITIVE').map((row) => ({ row, got: resolvePrompt(row.prompt) })).filter(({ got }) => got.operationId === pool && got.ruleId);
  report[pool] = {
    rows: rows.length, positives: positives.length,
    adjacentNegatives: rows.filter((row) => row.kind === 'ADJACENT_NEGATIVE').length, crossNegatives: rows.filter((row) => row.kind === 'CROSS_OPERATION').length,
    positivesRoutedToPool: positives.length - missed.length, positivesClaimedByAPoolRule: claimedByPoolRule,
    positiveMisses: missed.map(({ row, got }) => ({ prompt: row.prompt, got: got.operationId })),
    errors: wrong.map(({ row, got }) => ({ prompt: row.prompt, claimedBy: got.ruleId, expected: row.expected })),
    sealedRunPreview: evaluated[pool] ?? null,
  };
}
const out = { set: set.id, role: set.role, humanConfirmed: set.humanConfirmed, unknownExpectedOperations: [...unknownExpected], problems, pools: report };
if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
console.log(`${set.id} (${set.role}; NOT human-confirmed, cannot certify)`);
if (unknownExpected.size) console.log(`labels naming unregistered operations: ${[...unknownExpected].join(', ')}`);
for (const problem of problems) console.log(`PROBLEM ${problem}`);
for (const [pool, r] of Object.entries(report)) {
  console.log(`${pool}: ${r.positives} positives (${r.positivesClaimedByAPoolRule} claimed by a pool rule, ${r.positivesRoutedToPool} routed to the pool), ${r.adjacentNegatives} adjacent + ${r.crossNegatives} cross negatives; wrong claims by a pool rule: ${r.errors.length}`);
  if (showMisses) { for (const m of r.positiveMisses) console.log(`   MISS  ${JSON.stringify(m.prompt)} -> ${m.got}`); for (const e of r.errors) console.log(`   WRONG ${JSON.stringify(e.prompt)} claimed by ${e.claimedBy}, expected ${e.expected}`); }
}
