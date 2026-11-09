#!/usr/bin/env node
// Offline sweep of compound prompts through the real routing cascade (no database, no network). See tests/fixtures/askCompoundCorpus.js.
//   node scripts/ask-compound-sweep.js                 summary and every row
//   node scripts/ask-compound-sweep.js --check         exit 1 if a prompt does worse than its recorded baseline, or is not recorded
//   node scripts/ask-compound-sweep.js --write-baseline record today's outcomes (refuses when that records a regression, unless --force)
const fs = require('node:fs');
const path = require('node:path');
const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));
const { BASELINE_PATH, runCompoundSweep, summarize, baselineFrom, compareToBaseline } = require('./lib/askCompoundSweep');
const corpus = require(path.join(BACKEND, 'tests/fixtures/askCompoundCorpus.js'));
const args = process.argv.slice(2);
const results = runCompoundSweep(corpus);
const total = summarize(results);
console.log(`Ask compound sweep: ${total.n} prompts`);
console.log(`  full ${total.FULL}  partial ${total.PARTIAL}  clarify ${total.CLARIFY}  wrong ${total.WRONG}  fallback ${total.FALLBACK}\n`);
if (!args.includes('--check') && !args.includes('--write-baseline')) {
  for (const r of results) console.log(`${r.outcome.padEnd(8)} ${r.got.padEnd(34)} ${r.prompt.slice(0, 90)}`);
}
const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : { outcomes: {} };
const diff = compareToBaseline(results, baseline);
if (args.includes('--write-baseline')) {
  if (diff.worse.length && !args.includes('--force')) { console.error(`Refusing: ${diff.worse.length} prompt(s) do worse than recorded.`); process.exit(1); }
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baselineFrom(results), null, 2)}\n`);
  console.log(`Baseline written: ${path.relative(BACKEND, BASELINE_PATH)}`);
}
if (args.includes('--check')) {
  for (const r of diff.worse) console.log(`  WORSE      ${r.was} -> ${r.outcome}  ${r.prompt}`);
  for (const r of diff.better) console.log(`  BETTER     ${r.was} -> ${r.outcome}  ${r.prompt}  (record with --write-baseline)`);
  for (const r of diff.unrecorded) console.log(`  UNRECORDED ${r.prompt}`);
  if (diff.worse.length || diff.unrecorded.length || diff.removed.length) process.exit(1);
  console.log('No regression against the compound baseline.');
}
