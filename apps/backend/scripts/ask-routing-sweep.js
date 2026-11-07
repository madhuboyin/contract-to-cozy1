#!/usr/bin/env node
// Offline Ask routing sweep: runs every prompt in tests/fixtures/askRoutingCorpus.js through the real routing cascade with the
// production options (local routing, classifier and embedding retrieval on) and scores each against the expected operation.
// No database, no network, nothing written unless --json or --write-baseline is given.
//
//   node scripts/ask-routing-sweep.js                 summary + per-operation table, worst first
//   node scripts/ask-routing-sweep.js --misses        also list every prompt that was not a hit
//   node scripts/ask-routing-sweep.js --op=BUYER_DEADLINES   limit to one operation (repeatable)
//   node scripts/ask-routing-sweep.js --json=out.json write the full result
//   node scripts/ask-routing-sweep.js --min-hit-rate=0.6     exit 1 when the overall hit rate is below this
//   node scripts/ask-routing-sweep.js --corpus=path.js       use another corpus file
//   node scripts/ask-routing-sweep.js --check                exit 1 if a prompt that routed correctly no longer does, or a prompt newly
//                                                            routes to a wrong operation (the same rule tests/ask/routingSweepRatchet.test.js enforces)
//   node scripts/ask-routing-sweep.js --write-baseline       record today's results as the new baseline (tests/fixtures/askRoutingSweepBaseline.json);
//                                                            refuses when that would record a regression, unless --force is given
//   node scripts/ask-routing-sweep.js --model                also run the model-assisted router (askModelRouter.ts) on every prompt the local router
//                                                            leaves to the fallback or a clarification, with the REAL model, and compare. Needs network
//                                                            and GEMINI_API_KEY in the environment; --model-limit=N caps the number of model calls.
//                                                            This is the evidence to read before setting ASK_MODEL_ROUTER_ENABLED=true.
//
// Outcomes: hit (expected or equivalent op), clarOk (clarification that offered the right op), clarBad (clarification without it),
// fb (REMOTE_FALLBACK, the dead end), mis (routed to a different op). Not modelled: buyer-mode eligibility gating, launch context,
// conversation history, and the answer-trust validator (needs real data).
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));

const { BASELINE_PATH, runSweep, runModelSweep, baselineFrom, compareToBaseline } = require('./lib/askRoutingSweep');

const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const value = (name) => { const hit = flag(name); return hit && hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : null; };
const only = args.filter((arg) => arg.startsWith('--op=')).map((arg) => arg.slice(5));
const corpus = require(path.resolve(value('corpus') ?? path.join(BACKEND, 'tests/fixtures/askRoutingCorpus.js')));

const result = runSweep(corpus, { only });
for (const operationId of result.unknownOperations) { console.error(`Unknown operation in corpus: ${operationId}`); process.exitCode = 1; }
const { total, perOp, hijack } = result;
const pct = (count) => `${((100 * count) / Math.max(1, total.n)).toFixed(1)}%`;

console.log(`Ask routing sweep: ${Object.keys(perOp).length} operations, ${total.n} prompts`);
console.log(`  hit ${total.hit} (${pct(total.hit)})  clarification ${total.clarOk + total.clarBad} (right option offered: ${total.clarOk})  fallback ${total.fb} (${pct(total.fb)})  misroute ${total.mis} (${pct(total.mis)})\n`);
const sorted = Object.entries(perOp).sort(([leftId, left], [rightId, right]) => left.hit / left.n - right.hit / right.n || leftId.localeCompare(rightId));
for (const [operationId, row] of sorted) console.log(`${operationId.padEnd(34)} hit ${row.hit}/${row.n}  clarOk ${row.clarOk}  clarBad ${row.clarBad}  fb ${row.fb}  mis ${row.mis}`);
console.log('\nOperations that wrongly captured other intents:');
for (const [operationId, count] of Object.entries(hijack).sort((left, right) => right[1] - left[1]).slice(0, 12)) console.log(`  ${operationId.padEnd(30)} ${count}`);
if (flag('misses')) {
  console.log('\nMisses:');
  for (const [operationId, row] of sorted) for (const miss of row.misses) console.log(`  [${operationId}] ${miss.outcome.padEnd(7)} ${miss.message}  ->  ${miss.got}`);
}
if (value('json')) {
  const slim = Object.fromEntries(Object.entries(perOp).map(([operationId, row]) => [operationId, { hit: row.hit, clarOk: row.clarOk, clarBad: row.clarBad, fb: row.fb, mis: row.mis, n: row.n, misses: row.misses }]));
  fs.writeFileSync(path.resolve(value('json')), JSON.stringify({ total, perOp: slim, hijack }, null, 1));
}
const minimum = value('min-hit-rate');
if (minimum != null && total.hit / Math.max(1, total.n) < Number(minimum)) {
  console.error(`\nHit rate ${(total.hit / total.n).toFixed(3)} is below --min-hit-rate=${minimum}`);
  process.exitCode = 1;
}

const reportRegressions = (comparison) => {
  for (const entry of comparison.lost) console.error(`  LOST      [${entry.operationId}] ${entry.message}  ->  ${entry.now}`);
  for (const entry of comparison.newMisroutes) console.error(`  MISROUTED [${entry.operationId}] ${entry.message}  ->  ${entry.now}`);
};
if (flag('check') || flag('write-baseline')) {
  if (only.length || value('corpus')) { console.error('\n--check and --write-baseline need the whole default corpus (no --op or --corpus).'); process.exit(1); }
  // With no baseline yet there is nothing to regress from: the first --write-baseline records today's results as they are.
  const baselineExists = fs.existsSync(BASELINE_PATH);
  if (flag('check') && !baselineExists) { console.error(`\nNo baseline at ${path.relative(BACKEND, BASELINE_PATH)}; run with --write-baseline first.`); process.exit(1); }
  const baseline = baselineExists ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : { knownGood: {}, knownMisrouted: {} };
  const comparison = baselineExists ? compareToBaseline(result, baseline) : { lost: [], newMisroutes: [] };
  const regressed = comparison.lost.length + comparison.newMisroutes.length;
  if (flag('check')) {
    if (regressed) { console.error(`\nRouting regressed against the baseline (${comparison.lost.length} lost, ${comparison.newMisroutes.length} newly misrouted):`); reportRegressions(comparison); process.exitCode = 1; }
    else console.log('\nNo regression against the baseline.');
  }
  if (flag('write-baseline')) {
    if (regressed && !flag('force')) { console.error('\nRefusing to record a regression as the baseline (pass --force to override):'); reportRegressions(comparison); process.exit(1); }
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baselineFrom(result), null, 1)}\n`);
    console.log(`\nBaseline written: ${path.relative(BACKEND, BASELINE_PATH)}`);
  }
}

if (flag('model')) {
  if (!process.env.GEMINI_API_KEY) { console.error('\n--model needs GEMINI_API_KEY in the environment (for example: set -a; source ../../.env.local; set +a).'); process.exit(1); }
  const { geminiService } = require(path.join(BACKEND, 'src/services/gemini.service.ts'));
  const limit = Number(value('model-limit') ?? Infinity);
  runModelSweep(corpus, { provider: { select: (request) => geminiService.selectAskOperation(request) }, only, limit }).then((model) => {
    const share = (count, n) => `${count} (${((100 * count) / Math.max(1, n)).toFixed(1)}%)`;
    console.log(`\nModel-assisted router: ${model.modelCalls} model calls`);
    console.log(`  local only : hit ${share(model.local.hit, model.local.n)}  clarification ${model.local.clar}  fallback ${model.local.fb}  misroute ${model.local.mis}`);
    console.log(`  with model : hit ${share(model.withModel.hit, model.withModel.n)}  clarification ${model.withModel.clar}  fallback ${model.withModel.fb}  misroute ${model.withModel.mis}`);
    console.log(`  model outcomes: ${Object.entries(model.modelOutcomes).map(([name, count]) => `${name} ${count}`).join('  ') || 'none'}`);
    if ((model.modelOutcomes.UNAVAILABLE ?? 0) > model.modelCalls / 2) console.error('  Most calls were UNAVAILABLE: the key may be invalid or the model unreachable, so these numbers say nothing about the router.');
    const worse = model.changed.filter((entry) => entry.after === 'mis' || (entry.before === 'hit' && entry.after !== 'hit'));
    console.log(`  changed ${model.changed.length} prompts; ${worse.length} became misroutes or lost a hit${worse.length ? ':' : ''}`);
    for (const entry of worse) console.log(`    [${entry.operationId}] ${entry.message}  ${entry.before} -> ${entry.after}  (${entry.got})`);
    if (flag('misses')) for (const entry of model.changed.filter((item) => !worse.includes(item))) console.log(`    changed [${entry.operationId}] ${entry.message}  ${entry.before} -> ${entry.after}  (${entry.got})`);
  }).catch((error) => { console.error(`\nModel sweep failed: ${error.message}`); process.exitCode = 1; });
}
