#!/usr/bin/env node
// BICC-0.1 (docs/architecture/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_IMPLEMENTATION_PLAN.md): scores ONE source revision on the
// fixed Phase 0a routing corpora. The corpora and the scorer always come from the checkout that runs this script (the "pool"); only the
// routing cascade and operation registry come from --src, so every revision is scored on the same prompts with the same definition.
//
//   node scripts/ask-bicc-routing-run.js --src=<backend root of the revision> --out=<file.json>
//
// Offline: no database, no network. This measures ROUTING outcomes (a proxy for EVAL-018 prompt success); it is not answer correctness (EVAL-006).
const fs = require('node:fs');
const path = require('node:path');

const POOL_BACKEND = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const SRC = path.resolve(String(args.src || POOL_BACKEND));
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(POOL_BACKEND, 'tsconfig.test-cache.json');
require(path.join(POOL_BACKEND, 'node_modules/ts-node/register'));

const { EQUIVALENT, classifyDecision } = require(path.join(POOL_BACKEND, 'scripts/lib/askRoutingSweep'));
const { resolveAskRoutingCascade } = require(path.join(SRC, 'src/services/ask/askRoutingCascade.ts'));
const { ASK_OPERATION_DEFINITIONS } = require(path.join(SRC, 'src/services/ask/askOperationRegistry.ts'));

const CORPORA = { main: 'tests/fixtures/askRoutingCorpus.js', heldOut1: 'tests/fixtures/askRoutingHoldoutCorpus.js', heldOut2: 'tests/fixtures/askRoutingHoldoutCorpus2.js' };
const OPTIONS = { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'bicc-baseline-property' };
// EVAL-018 mapping of the routing sweep's outcomes. A clarification whose options do not include a correct operation is a dead end.
const OUTCOME = { hit: 'CORRECT_ANSWER', clarOk: 'APPROPRIATE_CLARIFICATION', clarBad: 'DEAD_END_RECOVERY', fb: 'UNSUPPORTED_FALLBACK', mis: 'WRONG_ANSWER' };

const results = []; const ineligible = [];
for (const [corpusKey, file] of Object.entries(CORPORA)) {
  const corpus = require(path.join(POOL_BACKEND, file));
  for (const [operationId, prompts] of Object.entries(corpus)) {
    const acceptable = new Set([operationId, ...(EQUIVALENT[operationId] ?? [])]);
    prompts.forEach((message, index) => {
      const promptId = `${corpusKey}:${operationId}:${index}`;
      if (!ASK_OPERATION_DEFINITIONS[operationId]) { ineligible.push(promptId); return; }
      const decision = resolveAskRoutingCascade(message, OPTIONS);
      const scored = classifyDecision(decision, acceptable);
      results.push({ promptId, corpus: corpusKey, operationId, message, outcome: OUTCOME[scored.outcome], stage: decision.stage, got: scored.got });
    });
  }
}
const out = { src: SRC, operationsDefined: Object.keys(ASK_OPERATION_DEFINITIONS).length, results, ineligible };
if (args.out) fs.writeFileSync(String(args.out), JSON.stringify(out));
else console.log(JSON.stringify({ ...out, results: results.length }));
