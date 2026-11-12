#!/usr/bin/env node
// Phase 0a baseline for the Understanding Reliability FRD (docs/product/ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md, §12 Phase 0a).
// Offline, read-only, no database and no network. Reproduces the measurements the FRD cites:
//   routing        hit / clarification / fallback / misroute per corpus, and per routing STAGE (FR-FAST-6, §2.2a)
//   perturbation   how many correctly routed prompts stay correct after a meaning-preserving edit (FR-EVAL-3, §2.3)
//   answerGate     operations with a canonical block contract, a typed validator branch, or neither (§2.4)
//   writeCapable   operations that carry a domain command versus the `effect` label (FR-WRT-4)
// Intervals are Wilson 95% bounds on ROW-level counts; rows of one operation are not independent, so they are descriptive only
// (the FRD gates use source-family level inference, FR-EVAL-14).
//
//   node scripts/ask-understanding-baseline.js                 print the report
//   node scripts/ask-understanding-baseline.js --json=out.json write the full report as JSON
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(BACKEND, 'tsconfig.test-cache.json');
require(path.join(BACKEND, 'node_modules/ts-node/register'));

const { EQUIVALENT, classifyDecision } = require('./lib/askRoutingSweep');
const { resolveAskRoutingCascade } = require(path.join(BACKEND, 'src/services/ask/askRoutingCascade.ts'));
const { ASK_OPERATION_DEFINITIONS } = require(path.join(BACKEND, 'src/services/ask/askOperationRegistry.ts'));
const { getAskDomainCommandByOperation } = require(path.join(BACKEND, 'src/services/ask/askDomainCommandRegistry.ts'));
const { CANONICAL_ANSWER_BLOCK_ID_PREFIXES } = require(path.join(BACKEND, 'src/services/ask/support/canonicalAnswerBlocks.ts'));

const args = process.argv.slice(2);
const jsonPath = (args.find((a) => a.startsWith('--json=')) ?? '').slice(7) || null;
const OPTIONS = { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'baseline-property' };
const route = (message) => resolveAskRoutingCascade(message, OPTIONS);

const z = 1.959964;
function wilson(k, n) {
  if (!n) return { rate: null, lo: null, hi: null };
  const p = k / n; const d = 1 + (z * z) / n; const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { rate: p, lo: (c - h) / d, hi: (c + h) / d };
}
const pct = (x) => (x == null ? 'n/a' : `${(100 * x).toFixed(1)}%`);

// ---------------- routing ----------------
function routingBaseline(corpusFile) {
  const corpus = require(path.resolve(BACKEND, corpusFile));
  const stages = {}; const wrongByOp = {}; let n = 0;
  const outcomes = { hit: 0, clarOk: 0, clarBad: 0, fb: 0, mis: 0 };
  for (const [operationId, prompts] of Object.entries(corpus)) {
    if (!ASK_OPERATION_DEFINITIONS[operationId]) continue;
    const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
    for (const message of prompts) {
      n += 1;
      const decision = route(message); const result = classifyDecision(decision, acceptable);
      outcomes[result.outcome] += 1;
      const stage = (stages[decision.stage] ??= { hit: 0, mis: 0, other: 0 });
      if (result.outcome === 'hit') stage.hit += 1; else if (result.outcome === 'mis') { stage.mis += 1; if (decision.stage === 'DETERMINISTIC') wrongByOp[decision.operation.operationId] = (wrongByOp[decision.operation.operationId] ?? 0) + 1; } else stage.other += 1;
    }
  }
  const byStage = {};
  for (const [stage, v] of Object.entries(stages)) { const claimed = v.hit + v.mis; byStage[stage] = { ...v, claimed, precisionWhenClaiming: wilson(v.hit, claimed) }; }
  return { corpus: corpusFile, prompts: n, outcomes, hitRate: wilson(outcomes.hit, n), byStage, deterministicWrongClaimsByOperation: wrongByOp };
}

// ---------------- perturbation ----------------
const TWEAKS = {
  'prefix "hey cozy, "': (s) => `hey cozy, ${s}`,
  'suffix " please"': (s) => `${s} please`,
  'prefix "can you tell me "': (s) => `can you tell me ${s}`,
  'trailing "?"': (s) => `${s}?`,
  '"my" -> "the"': (s) => s.replace(/\bmy\b/gi, 'the'),
  'one transposed-letter typo': (s) => { const w = s.split(' '); const i = w.map((x, k) => [x.length, k]).sort((a, b) => b[0] - a[0])[0][1]; const x = w[i]; if (x.length > 4) w[i] = x.slice(0, 2) + x[3] + x[2] + x.slice(4); return w.join(' '); },
};
function perturbationBaseline(corpusFile) {
  const corpus = require(path.resolve(BACKEND, corpusFile));
  const stats = {}; let correct = 0; const toWrite = {};
  for (const [operationId, prompts] of Object.entries(corpus)) {
    if (!ASK_OPERATION_DEFINITIONS[operationId]) continue;
    const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
    for (const message of prompts) {
      if (classifyDecision(route(message), acceptable).outcome !== 'hit') continue;
      correct += 1;
      for (const [name, fn] of Object.entries(TWEAKS)) {
        const edited = fn(message); if (edited === message) continue;
        const stat = (stats[name] ??= { tried: 0, kept: 0 }); stat.tried += 1;
        const decision = route(edited);
        if (classifyDecision(decision, acceptable).outcome === 'hit') stat.kept += 1;
        else if (decision.stage !== 'CLARIFICATION' && decision.stage !== 'REMOTE_FALLBACK') {
          const def = ASK_OPERATION_DEFINITIONS[decision.operation.operationId];
          if (getAskDomainCommandByOperation(decision.operation.operationId)) toWrite[name] = (toWrite[name] ?? 0) + 1;
          void def;
        }
      }
    }
  }
  let t = 0; let k = 0; const byTweak = {};
  for (const [name, s] of Object.entries(stats)) { t += s.tried; k += s.kept; byTweak[name] = { ...s, retention: wilson(s.kept, s.tried) }; }
  return { corpus: corpusFile, originallyCorrect: correct, byTweak, overall: { tried: t, kept: k, retention: wilson(k, t) }, editedPromptsRoutedToAWriteCapableOperation: toWrite };
}

// ---------------- answer gate contracts ----------------
function answerGateBaseline() {
  const src = fs.readFileSync(path.join(BACKEND, 'src/services/ask/askSemanticAnswerValidator.ts'), 'utf8');
  const typed = new Set(); for (const m of src.matchAll(/input\.operationId === '([A-Z_]+)'/g)) typed.add(m[1]);
  const defs = Object.values(ASK_OPERATION_DEFINITIONS); const routable = defs.filter((d) => d.messageRoutable);
  const prefixed = new Set(Object.keys(CANONICAL_ANSWER_BLOCK_ID_PREFIXES));
  const neither = routable.filter((d) => !prefixed.has(d.operationId) && !typed.has(d.operationId));
  const byEffect = {}; for (const d of neither) byEffect[d.semantic.effect] = (byEffect[d.semantic.effect] ?? 0) + 1;
  return { operations: defs.length, routable: routable.length, withCanonicalPrefix: routable.filter((d) => prefixed.has(d.operationId)).length, withTypedValidatorBranch: routable.filter((d) => typed.has(d.operationId)).length, withNeither: neither.length, neitherByEffect: byEffect, note: 'The typed-branch count is a regex over the validator source and undercounts branches written through a helper.' };
}

// ---------------- write-capable set ----------------
function writeCapableBaseline() {
  const routable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.messageRoutable);
  const withCommand = routable.filter((d) => getAskDomainCommandByOperation(d.operationId));
  const labelledWrite = routable.filter((d) => d.semantic.effect === 'WRITE');
  return {
    routable: routable.length, labelledWrite: labelledWrite.length, withDomainCommand: withCommand.length,
    commandButNotLabelledWrite: withCommand.filter((d) => d.semantic.effect !== 'WRITE').map((d) => `${d.operationId} (${d.semantic.effect})`).sort(),
    labelledWriteButNoCommand: labelledWrite.filter((d) => !getAskDomainCommandByOperation(d.operationId)).map((d) => d.operationId).sort(),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  routing: ['tests/fixtures/askRoutingCorpus.js', 'tests/fixtures/askRoutingHoldoutCorpus.js', 'tests/fixtures/askRoutingHoldoutCorpus2.js'].map(routingBaseline),
  perturbation: perturbationBaseline('tests/fixtures/askRoutingCorpus.js'),
  answerGate: answerGateBaseline(),
  writeCapable: writeCapableBaseline(),
};

if (jsonPath) fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
console.log('Ask understanding baseline (Phase 0a)\n');
for (const r of report.routing) {
  console.log(`routing  ${r.corpus}: ${r.prompts} prompts, hit ${pct(r.hitRate.rate)} [${pct(r.hitRate.lo)}–${pct(r.hitRate.hi)}], outcomes ${JSON.stringify(r.outcomes)}`);
  for (const [stage, v] of Object.entries(r.byStage)) console.log(`         ${stage.padEnd(16)} claimed ${String(v.claimed).padStart(3)}  precision ${pct(v.precisionWhenClaiming.rate)} [${pct(v.precisionWhenClaiming.lo)}–${pct(v.precisionWhenClaiming.hi)}]`);
}
console.log(`\nperturbation (${report.perturbation.originallyCorrect} originally correct prompts):`);
for (const [name, v] of Object.entries(report.perturbation.byTweak)) console.log(`  ${name.padEnd(30)} ${v.kept}/${v.tried}  ${pct(v.retention.rate)}`);
console.log(`  ${'ALL'.padEnd(30)} ${report.perturbation.overall.kept}/${report.perturbation.overall.tried}  ${pct(report.perturbation.overall.retention.rate)}`);
console.log(`  edited prompts routed to a write-capable operation: ${JSON.stringify(report.perturbation.editedPromptsRoutedToAWriteCapableOperation)}`);
const g = report.answerGate;
console.log(`\nanswer gate: ${g.routable} routable; canonical prefix ${g.withCanonicalPrefix}; typed branch ${g.withTypedValidatorBranch}; neither ${g.withNeither} ${JSON.stringify(g.neitherByEffect)}`);
const w = report.writeCapable;
console.log(`\nwrite-capable: ${w.withDomainCommand} routable operations carry a domain command; ${w.labelledWrite} are labelled WRITE`);
console.log(`  command but not labelled WRITE: ${w.commandButNotLabelledWrite.join(', ')}`);
console.log(`  labelled WRITE but no command:  ${w.labelledWriteButNoCommand.join(', ')}`);
