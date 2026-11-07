#!/usr/bin/env node
// Offline Ask routing sweep: runs every prompt in tests/fixtures/askRoutingCorpus.js through the real routing cascade with the
// production options (local routing, classifier and embedding retrieval on) and scores each against the expected operation.
// No database, no network, nothing written unless --json is given.
//
//   node scripts/ask-routing-sweep.js                 summary + per-operation table, worst first
//   node scripts/ask-routing-sweep.js --misses        also list every prompt that was not a hit
//   node scripts/ask-routing-sweep.js --op=BUYER_DEADLINES   limit to one operation (repeatable)
//   node scripts/ask-routing-sweep.js --json=out.json write the full result
//   node scripts/ask-routing-sweep.js --min-hit-rate=0.6     exit 1 when the overall hit rate is below this
//   node scripts/ask-routing-sweep.js --corpus=path.js       use another corpus file
//
// Outcomes: hit (expected or equivalent op), clarOk (clarification that offered the right op), clarBad (clarification without it),
// fb (REMOTE_FALLBACK, the dead end), mis (routed to a different op). Not modelled: buyer-mode eligibility gating, launch context,
// conversation history, and the answer-trust validator (needs real data).
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));

const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const value = (name) => { const hit = flag(name); return hit && hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : null; };
const only = args.filter((arg) => arg.startsWith('--op=')).map((arg) => arg.slice(5));

const { resolveAskRoutingCascade } = require(path.join(BACKEND, 'src/services/ask/askRoutingCascade.ts'));
const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/askOperationRegistry.ts'));
const corpus = require(path.resolve(value('corpus') ?? path.join(BACKEND, 'tests/fixtures/askRoutingCorpus.js')));

// Operations that would still give a correct answer for the same intent. Keep this short: every entry hides a real gap.
const EQUIVALENT = {
  WORK_OVERVIEW: ['HOME_ACTIONS', 'HOME_WORK_ITEMS'], HOME_ACTIONS: ['WORK_OVERVIEW', 'HOME_WORK_ITEMS'],
  APPLIANCE_FAILURE_RISK: ['HOME_STATUS_BOARD', 'MAINTENANCE_FORECAST', 'INVENTORY_LOOKUP'], MAINTENANCE_FORECAST: ['APPLIANCE_FAILURE_RISK'],
  REFINANCE_RATE_MONITOR: ['REFINANCE_ANALYSIS'], MAINTENANCE_BUDGET_FORECAST: ['CAPITAL_RESERVE_PLAN'], CAPITAL_RESERVE_PLAN: ['MAINTENANCE_BUDGET_FORECAST'],
  INSPECTION_FINDINGS: ['INSPECTION_REPORT_FINDINGS'], INSPECTION_REPORT_FINDINGS: ['INSPECTION_FINDINGS'], INSPECTION_REPORTS: ['INSPECTION_REPORT_FINDINGS'],
  QUOTE_COMPARISON_REVIEW: ['SERVICE_PRICE_CHECKS'], SERVICE_PRICE_CHECKS: ['QUOTE_COMPARISON_REVIEW'],
  COVERAGE_GAPS: ['COVERAGE_REVIEW_STATUS'], COVERAGE_REVIEW_STATUS: ['COVERAGE_GAPS'],
  HOME_CHANGE_SUMMARY: ['HOME_TIMELINE_EVENTS'], HOME_TIMELINE_EVENTS: ['PROJECT_TRACKER_PROJECTS'], PROJECT_TRACKER_PROJECTS: ['HOME_TIMELINE_EVENTS', 'DIY_PROJECTS'],
  PAST_HAZARD_EXPOSURE: ['ENVIRONMENT_REPORT'], OWNERSHIP_COSTS: ['SAVINGS_OPPORTUNITIES'], REPLACEMENT_GUIDANCE: ['HVAC_DECISION_START'],
  HVAC_DECISION_START: ['REPLACEMENT_GUIDANCE'], MAINTENANCE_TASK_UPDATE: ['OPERATIONAL_WORK_UPDATE'], BUYER_NEGOTIATION_READINESS: ['INSPECTION_NEGOTIATION_PACKAGE'],
  INSPECTION_NEGOTIATION_PACKAGE: ['BUYER_NEGOTIATION_READINESS'], BUYER_PLAN_STATUS: ['BUYER_DEADLINES'], PROPERTY_SUMMARY: ['INVENTORY_LOOKUP'],
  HOME_DEADLINE_MONITOR: ['HOME_ACTIONS'], MAJOR_EVENT_ENTRY: ['SELLER_PREP_CHECKLIST'], SELLER_PREP_CHECKLIST: ['MAJOR_EVENT_ENTRY'],
};

const perOp = {};
const hijack = {};
for (const [operationId, prompts] of Object.entries(corpus)) {
  if (only.length && !only.includes(operationId)) continue;
  if (!ASK_OPERATION_DEFINITIONS[operationId]) { console.error(`Unknown operation in corpus: ${operationId}`); process.exitCode = 1; continue; }
  const row = perOp[operationId] = { hit: 0, clarOk: 0, clarBad: 0, fb: 0, mis: 0, n: 0, misses: [] };
  const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
  for (const message of prompts) {
    const decision = resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'sweep-property' });
    const candidates = decision.candidates.map((candidate) => candidate.operationId);
    const routed = decision.operation.operationId;
    const outcome = decision.stage === 'CLARIFICATION' ? (candidates.some((id) => acceptable.has(id)) ? 'clarOk' : 'clarBad')
      : decision.stage === 'REMOTE_FALLBACK' ? 'fb'
        : acceptable.has(routed) ? 'hit' : 'mis';
    row.n += 1; row[outcome] += 1;
    if (outcome === 'mis') hijack[routed] = (hijack[routed] ?? 0) + 1;
    if (outcome !== 'hit') row.misses.push({ message, outcome, got: decision.stage === 'CLARIFICATION' ? `CLARIFY[${candidates.slice(0, 3).join(',')}]` : routed });
  }
}

const total = { hit: 0, clarOk: 0, clarBad: 0, fb: 0, mis: 0, n: 0 };
for (const row of Object.values(perOp)) for (const key of Object.keys(total)) total[key] += row[key];
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
if (value('json')) require('node:fs').writeFileSync(path.resolve(value('json')), JSON.stringify({ total, perOp, hijack }, null, 1));
const minimum = value('min-hit-rate');
if (minimum != null && total.hit / Math.max(1, total.n) < Number(minimum)) {
  console.error(`\nHit rate ${(total.hit / total.n).toFixed(3)} is below --min-hit-rate=${minimum}`);
  process.exitCode = 1;
}
