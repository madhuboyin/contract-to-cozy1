#!/usr/bin/env node
// BICC-0.1: re-evaluates the current and recent revisions with the same all-prompt success definition on the same pool, so a fall in
// success is located in a revision instead of assumed. Revisions are checked out as throwaway git worktrees (nothing in the working
// tree changes) and scored offline by scripts/ask-bicc-routing-run.js.
//
//   node scripts/ask-bicc-cross-revision.js --revisions=<sha>,<sha>,... [--json=out.json] [--workdir=<dir>]
//
// The FIRST revision listed is the baseline for deltas; list newest first (HEAD, then older). Only prompts that every revision can score
// (operation defined everywhere) are compared; the rest are reported as ineligible, never as failures.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BACKEND = path.resolve(__dirname, '..');
const REPO = path.resolve(BACKEND, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const revisions = String(args.revisions || 'HEAD').split(',').map((r) => r.trim()).filter(Boolean);
const workdir = args.workdir ? path.resolve(String(args.workdir)) : fs.mkdtempSync(path.join(os.tmpdir(), 'bicc-xrev-'));
fs.mkdirSync(workdir, { recursive: true });

process.env.TS_NODE_TRANSPILE_ONLY = 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));
const { buildSuccessReport, compareRevisions, isPromptSuccess } = require(path.join(BACKEND, 'src/services/ask/semantic/evaluation/biccEvaluationReport.ts'));
const { clopperPearsonInterval } = require(path.join(BACKEND, 'src/services/ask/semantic/evaluation/biccStatistics.ts'));

const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const runs = [];
for (const revision of revisions) {
  const sha = git('rev-parse', '--short', revision);
  const meta = git('log', '-1', '--format=%ad %s', '--date=short', sha);
  const tree = path.join(workdir, `wt-${sha}`);
  let backend = BACKEND;
  const isHead = sha === git('rev-parse', '--short', 'HEAD') && !git('status', '--porcelain', '--', 'apps/backend/src').length;
  if (!isHead) {
    git('worktree', 'add', '--detach', '-f', tree, sha);
    fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(tree, 'apps/backend/node_modules'));
    backend = path.join(tree, 'apps/backend');
  }
  const out = path.join(workdir, `run-${sha}.json`);
  try {
    execFileSync('node', [path.join(BACKEND, 'scripts/ask-bicc-routing-run.js'), `--src=${backend}`, `--out=${out}`], { cwd: BACKEND, stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 28 });
    runs.push({ revision: sha, meta, ...JSON.parse(fs.readFileSync(out, 'utf8')) });
  } catch (error) {
    runs.push({ revision: sha, meta, failed: String(error.message).slice(0, 300), results: [], ineligible: [] });
  } finally {
    if (!isHead) { try { git('worktree', 'remove', '--force', tree); } catch { /* best effort */ } }
  }
}

const scored = runs.filter((run) => !run.failed);
const skip = new Set(scored.flatMap((run) => run.ineligible));
const pool = (run, corpus) => run.results.filter((r) => !skip.has(r.promptId) && (!corpus || r.corpus === corpus));
const asResult = (r) => ({ promptId: r.promptId, source: r.corpus === 'main' ? 'MAIN_CORPUS' : 'TUNING', outcome: r.outcome, strata: { corpus: r.corpus } });
const rate = (list) => clopperPearsonInterval(list.filter((r) => isPromptSuccess(r.outcome)).length, list.length);

const baseline = scored[0];
const table = scored.map((run) => ({
  revision: run.revision, meta: run.meta, operationsDefined: run.operationsDefined,
  comparablePrompts: pool(run).length,
  byCorpus: Object.fromEntries(['main', 'heldOut1', 'heldOut2'].map((corpus) => [corpus, rate(pool(run, corpus))])),
  overall: rate(pool(run)),
  report: buildSuccessReport(pool(run).map(asResult)),
  versusBaseline: run === baseline ? null : compareRevisions(pool(baseline).map(asResult), pool(run).map(asResult)),
  ineligible: run.ineligible.length,
}));
// Movement between consecutive revisions locates where a fall happened.
const movement = scored.slice(1).map((older, i) => {
  const newer = scored[i];
  const before = new Map(pool(older).map((r) => [r.promptId, r]));
  const lost = pool(newer).filter((r) => !isPromptSuccess(r.outcome) && before.get(r.promptId) && isPromptSuccess(before.get(r.promptId).outcome));
  const gained = pool(newer).filter((r) => isPromptSuccess(r.outcome) && before.get(r.promptId) && !isPromptSuccess(before.get(r.promptId).outcome));
  return { from: older.revision, to: newer.revision, lost: lost.length, gained: gained.length, lostExamples: lost.slice(0, 8).map((r) => ({ promptId: r.promptId, message: r.message, nowGot: r.got })) };
});
const output = { generatedAt: new Date().toISOString(), scope: 'ROUTING_OUTCOMES_AS_PROXY_FOR_EVAL_018_NOT_ANSWER_CORRECTNESS', failedRevisions: runs.filter((r) => r.failed), table, movement };
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(output, null, 2));
const pct = (x) => (x == null ? 'n/a' : `${(100 * x).toFixed(1)}%`);
for (const row of table) console.log(`${row.revision} ${row.meta.slice(0, 70)} | n=${row.comparablePrompts} overall ${pct(row.overall.rate)} [${pct(row.overall.lower)}-${pct(row.overall.upper)}] main ${pct(row.byCorpus.main.rate)} held1 ${pct(row.byCorpus.heldOut1.rate)} held2 ${pct(row.byCorpus.heldOut2.rate)}${row.versusBaseline ? ` | vs ${table[0].revision}: ${(row.versusBaseline.delta * 100).toFixed(1)}pp` : ''}`);
for (const step of movement) console.log(`${step.from} -> ${step.to}: lost ${step.lost}, gained ${step.gained}`);
for (const failure of output.failedRevisions) console.log(`FAILED ${failure.revision}: ${failure.failed}`);
