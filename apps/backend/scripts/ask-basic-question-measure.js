#!/usr/bin/env node
// A fixed set of basic owner questions through the real routing cascade, reported by how far each gets: DIRECT (a deterministic or provisional read was selected and it is an accepted operation), CLARIFIES (a clarification that offers an
// accepted operation), WRONG (routed to another operation), FALLBACK (guidance fallback or nothing). The set and the accepted operations are tests/fixtures/askBasicQuestions.json. `--without-provisional` measures the strict-only routing
// (no uncertified rule may start a read) for comparison. This measures ROUTING; delivery of a read is judged by the gate (tests/ask/provisionalRead.test.js). It is not the sealed evaluation and proves nothing about real homeowner prompts.
require('ts-node/register/transpile-only');
const path = require('node:path');
const { resolveAskRoutingCascade } = require(path.join(__dirname, '../src/services/ask/askRoutingCascade.ts'));
const { PROVISIONAL_READ_OPERATIONS } = require(path.join(__dirname, '../src/services/ask/fastPath/fastPathCertificates.ts'));
const questions = require('../tests/fixtures/askBasicQuestions.json');
if (process.argv.includes('--without-provisional')) PROVISIONAL_READ_OPERATIONS.clear();
const count = { DIRECT: 0, CLARIFIES: 0, WRONG: 0, FALLBACK: 0 }; const rows = [];
for (const { question, accept } of questions) {
  const d = resolveAskRoutingCascade(question, { localRoutingEnabled: true });
  const op = d.operation.operationId; const direct = (d.stage === 'DETERMINISTIC' || d.stage === 'PROVISIONAL' || d.stage === 'LOCAL_CLASSIFIER') && !d.requiresClarification && accept.includes(op);
  const clar = d.requiresClarification && d.candidates.some((c) => accept.includes(c.operationId));
  const kind = direct ? 'DIRECT' : clar ? 'CLARIFIES' : (d.stage === 'REMOTE_FALLBACK' || op === 'GROUNDED_GUIDANCE') ? 'FALLBACK' : 'WRONG';
  count[kind] += 1; rows.push([kind, d.stage, op, question]);
}
const n = questions.length; const pct = (k) => `${count[k]}/${n} (${Math.round((100 * count[k]) / n)}%)`;
if (process.argv.includes('--verbose')) for (const r of rows) console.log(r[0].padEnd(10), r[1].padEnd(14), r[2].padEnd(26), r[3]);
console.log(`${process.argv.includes('--without-provisional') ? 'WITHOUT provisional' : 'WITH provisional'}: DIRECT ${pct('DIRECT')}  CLARIFIES ${pct('CLARIFIES')}  FALLBACK ${pct('FALLBACK')}  WRONG ${pct('WRONG')}  -> answered-or-clarified ${Math.round((100 * (count.DIRECT + count.CLARIFIES)) / n)}%`);
