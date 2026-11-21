#!/usr/bin/env node
// FR-FAST-2 / FR-FAST-6 / FR-FAST-8 / FR-FAST-9: fast-path certification runner. Offline: no database, no network.
//
//   node scripts/ask-fast-path-certify.js report [--out=file.json]
//       FR-FAST-6 baseline. Runs the TUNING corpora (tests/fixtures/askRouting*Corpus*.js, askBasicQuestions.json) through the deterministic router and attributes every
//       match to its rule: how often each rule fires, how often it is wrong, and which operations have rules that never fire. Tuning data only: it can find rules to fix,
//       it can never certify one.
//   node scripts/ask-fast-path-certify.js certify --sealed=path/to/sealed.json [--write]
//       Evaluates a HUMAN-CONFIRMED sealed set (format: scripts/lib/askFastPathCertification.js). Prints one verdict per operation pool. With --write, pools that pass are
//       recorded in src/services/ask/fastPath/certificates.generated.ts and every attempt (pass or fail) in tests/fixtures/askFastPathCertificationAttempts.json.
//       Refuses to write anything unless the aggregate sealed gate (FR-FAST-2) also passes. A rule version that failed on a sealed set may not be certified on it again (FR-FAST-8).
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));

const core = require('./lib/askFastPathCertification');
const { EQUIVALENT } = require('./lib/askRoutingSweep');
const ask = (p) => require(path.join(BACKEND, 'src/services/ask', p));
const { resolveAskOperation, ruleIdOfResolution } = ask('askOperationRegistry.ts');
const { correctKnownMisspellings } = ask('support/commonMisspellings.ts');
const { normalizeForRouting } = ask('support/routingNormalization.ts');
const cert = ask('fastPath/fastPathCertificates.ts');

const FIXTURES = path.join(BACKEND, 'tests/fixtures');
const TUNING = ['askRoutingCorpus.js', 'askRoutingHoldoutCorpus.js', 'askRoutingHoldoutCorpus2.js'];
const GENERATED = path.join(BACKEND, 'src/services/ask/fastPath/certificates.generated.ts');
const ATTEMPTS = path.join(FIXTURES, 'askFastPathCertificationAttempts.json');
const args = process.argv.slice(2); const mode = args[0];
const value = (name) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };

// The same two steps the cascade takes before the deterministic router (askRoutingCascade.ts: misspelling correction, then routing normalisation).
const resolvePrompt = (prompt) => {
  const raw = resolveAskOperation(correctKnownMisspellings(prompt));
  const resolution = /BOUNDARY$/.test(raw.operationId) ? raw : resolveAskOperation(normalizeForRouting(prompt));
  // GROUNDED_GUIDANCE is the router's no-match fall-through, not a claim by a rule (the cascade ignores it the same way).
  return { operationId: resolution.operationId, ruleId: resolution.operationId === 'GROUNDED_GUIDANCE' ? null : ruleIdOfResolution(resolution) };
};

function tuningRows() {
  const rows = [];
  for (const file of TUNING) { const corpus = require(path.join(FIXTURES, file)); for (const [op, prompts] of Object.entries(corpus)) for (const prompt of prompts) rows.push({ prompt, accept: new Set([op, ...(EQUIVALENT[op] ?? [])]), source: file }); }
  for (const entry of JSON.parse(fs.readFileSync(path.join(FIXTURES, 'askBasicQuestions.json'), 'utf8'))) rows.push({ prompt: entry.question, accept: new Set(entry.accept), source: 'askBasicQuestions.json' });
  return rows;
}
const tuningSetId = () => `tuning-${crypto.createHash('sha256').update(TUNING.map((f) => fs.readFileSync(path.join(FIXTURES, f))).join('') + fs.readFileSync(path.join(FIXTURES, 'askBasicQuestions.json'))).digest('hex').slice(0, 12)}`;

function report() {
  const rows = tuningRows(); const perRule = new Map(); let claimed = 0; let wrong = 0; let unclaimed = 0;
  for (const row of rows) {
    const r = resolvePrompt(row.prompt);
    if (!r.ruleId) { unclaimed += 1; continue; }
    const entry = perRule.get(r.ruleId) ?? { ruleId: r.ruleId, operationId: r.operationId, fired: 0, wrong: [] };
    entry.fired += 1; claimed += 1;
    if (!row.accept.has(r.operationId)) { entry.wrong.push(row.prompt); (entry.detail ||= []).push({ prompt: row.prompt, got: r.operationId, expected: [...row.accept][0] }); wrong += 1; }
    perRule.set(r.ruleId, entry);
  }
  const rules = cert.FAST_PATH_RULES; const silent = rules.filter((rule) => !perRule.has(rule.id));
  const ordered = [...perRule.values()].sort((a, b) => b.wrong.length - a.wrong.length || b.fired - a.fired);
  console.log(`FR-FAST-6 baseline on tuning data (${rows.length} prompts, ${tuningSetId()}; NOT sealed, cannot certify)`);
  console.log(`  rules ${rules.length}, certified ${rules.filter((r) => r.status === 'CERTIFIED').length}; prompts claimed by a rule ${claimed}, wrong ${wrong} (${(100 * wrong / Math.max(1, claimed)).toFixed(1)}%), not claimed ${unclaimed}`);
  console.log(`  rules that fired on no tuning prompt: ${silent.length} (untested here, not necessarily wrong)\n`);
  console.log('rule'.padEnd(46) + 'fired  wrong  first wrong prompts');
  for (const e of ordered.filter((x) => x.wrong.length)) console.log(e.ruleId.padEnd(46) + String(e.fired).padEnd(7) + String(e.wrong.length).padEnd(7) + e.wrong.slice(0, 2).join(' | '));
  console.log(`\n${ordered.filter((x) => !x.wrong.length).length} rules fired with no wrong claim on tuning data.`);
  if (args.includes('--detail')) for (const e of ordered.filter((x) => x.wrong.length)) for (const d of e.detail) console.log(`${e.ruleId}\t${d.prompt}\t=> ${d.got}\t(expected ${d.expected})`);
  const out = value('out');
  if (out) fs.writeFileSync(out, JSON.stringify({ tuningSetId: tuningSetId(), claimed, wrong, rules: ordered, silent: silent.map((r) => r.id) }, null, 1));
}

function certify() {
  const file = value('sealed'); if (!file) { console.error('certify needs --sealed=<path to a human-confirmed sealed set>'); process.exit(2); }
  const raw = fs.readFileSync(path.resolve(file)); const set = JSON.parse(raw);
  const sealedSetId = `${set.id}@${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12)}`;
  const issues = core.validateSealedSet(set, { tuningPrompts: new Set(tuningRows().map((r) => r.prompt.trim().toLowerCase())) });
  if (issues.length) { console.error(`sealed set rejected:\n  ${issues.slice(0, 20).join('\n  ')}${issues.length > 20 ? `\n  ... ${issues.length - 20} more` : ''}`); process.exit(1); }
  const evaluated = core.evaluateSealedSet({ rows: set.rows, resolve: resolvePrompt, rulesOf: cert.fastPathPoolOf, adjacentOf: cert.fastPathAdjacentOperations });
  const attempts = fs.existsSync(ATTEMPTS) ? JSON.parse(fs.readFileSync(ATTEMPTS, 'utf8')) : [];
  const certificates = {}; const newAttempts = []; const verdicts = [];
  for (const pool of Object.values(evaluated)) {
    const problems = [...pool.mixtureIssues];
    const pending = [];
    for (const [ruleId, row] of Object.entries(pool.rules)) {
      const rule = cert.FAST_PATH_RULES.find((r) => r.id === ruleId);
      if (core.reusedAfterFailure(attempts, ruleId, rule.version, sealedSetId.split('@')[0])) problems.push(`${ruleId}: an earlier version failed on this sealed set; a fresh held-out version is required (FR-FAST-8)`);
      const evidence = { ...row.evidence, tuningSetId: tuningSetId(), sealedSetId, certifiedAt: new Date().toISOString().slice(0, 10) };
      problems.push(...cert.validateFastPathRule({ ...rule, status: 'CERTIFIED', evidence }));
      pending.push({ ruleId, version: rule.version, evidence, row });
    }
    const passed = problems.length === 0;
    for (const p of pending) { newAttempts.push({ ruleId: p.ruleId, version: p.version, sealedSetId: sealedSetId.split('@')[0], passed }); if (passed) certificates[p.ruleId] = { version: p.version, evidence: p.evidence }; }
    verdicts.push({ pool: pool.pool, passed, trials: pool.trials, errors: pool.errors, upper: pool.incorrectUpperBound, problems });
  }
  const certifiedPools = verdicts.filter((v) => v.passed);
  const aggregate = { sealedFamilies: new Set(set.rows.map((r) => r.family)).size, failures: verdicts.reduce((s, v) => s + v.errors, 0), incorrectUpperBound: core.wilsonUpper(verdicts.reduce((s, v) => s + v.errors, 0), new Set(set.rows.map((r) => r.family)).size), sealedSetId };
  const aggregateIssues = cert.validateFastPathAggregate(aggregate);
  for (const v of verdicts.sort((a, b) => Number(a.passed) - Number(b.passed))) console.log(`${v.passed ? 'PASS' : 'FAIL'}  ${v.pool.padEnd(40)} trials ${v.trials}, errors ${v.errors}, upper bound ${(100 * v.upper).toFixed(2)}%${v.problems.length ? `\n        ${v.problems.slice(0, 4).join('\n        ')}` : ''}`);
  const stillDemoted = cert.FAST_PATH_RULES.map((r) => r.operationId).filter((op, i, all) => all.indexOf(op) === i && !evaluated[op]);
  console.log(`\npools certified ${certifiedPools.length}/${verdicts.length}; pools with no sealed rows (stay demoted): ${stillDemoted.length}`);
  console.log(`aggregate sealed gate: ${aggregateIssues.length ? `FAIL: ${aggregateIssues.join('; ')}` : 'PASS'}`);
  if (!args.includes('--write')) { console.log('\n(dry run: pass --write to record certificates and attempts)'); return; }
  fs.writeFileSync(ATTEMPTS, JSON.stringify([...attempts, ...newAttempts], null, 1) + '\n');
  if (aggregateIssues.length) { console.error('attempts recorded; certificates NOT written because the aggregate sealed gate failed (FR-FAST-2)'); process.exit(1); }
  const merged = { ...readGenerated(), ...certificates };
  fs.writeFileSync(GENERATED, `// GENERATED by scripts/ask-fast-path-certify.js certify --write. Do not edit. A certificate names the rule version it was issued for; a rule whose hash has changed is demoted again (FR-FAST-4).\nexport const GENERATED_FAST_PATH_CERTIFICATES = ${JSON.stringify(merged, null, 1)} as const;\n`);
  console.log(`wrote ${Object.keys(certificates).length} certificate(s) to ${path.relative(BACKEND, GENERATED)}`);
}
function readGenerated() { const m = fs.readFileSync(GENERATED, 'utf8').match(/= (\{[\s\S]*\}) as const;/); return m ? JSON.parse(m[1]) : {}; }

if (mode === 'report') report(); else if (mode === 'certify') certify(); else { console.error('usage: ask-fast-path-certify.js report | certify --sealed=<file> [--write]'); process.exit(2); }
