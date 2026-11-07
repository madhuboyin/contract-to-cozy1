const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

const { BASELINE_PATH, runSweep, baselineFrom, compareToBaseline } = require('../../scripts/lib/askRoutingSweep.js');
const corpus = require('../fixtures/askRoutingCorpus.js');

// The natural-language routing ratchet. tests/fixtures/askRoutingCorpus.js holds hand-written phrasings per operation; the baseline records
// which of them route correctly today and which route to a wrong operation. Routing may get better (a fallback becomes a hit), but a phrasing
// that worked must keep working and no phrasing may start routing to the wrong operation.
//   An intended change that loses a phrasing:  fix the routing, or move the phrasing out of the corpus with a reason in the commit.
//   Routing improved, or phrasings were added: node scripts/ask-routing-sweep.js --write-baseline   (it refuses to record a regression)

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const result = runSweep(corpus);

const describe = (entries) => entries.map((entry) => `  [${entry.operationId}] ${entry.message}  ->  ${entry.now}`).join('\n');

test('every operation named in the corpus is a registered operation', () => {
  assert.deepEqual(result.unknownOperations, []);
});

test('ratchet: no phrasing that routed correctly stops, and none newly routes to a wrong operation', () => {
  const comparison = compareToBaseline(result, baseline);
  assert.equal(comparison.lost.length, 0, `Phrasings that routed correctly no longer do:\n${describe(comparison.lost)}`);
  assert.equal(comparison.newMisroutes.length, 0, `Phrasings that now route to a wrong operation:\n${describe(comparison.newMisroutes)}`);
});

test('the baseline lists only phrasings that are in the corpus, so it cannot drift from it', () => {
  const inCorpus = new Set(Object.entries(corpus).flatMap(([operationId, prompts]) => prompts.map((message) => `${operationId}\u0000${message}`)));
  for (const section of ['knownGood', 'knownMisrouted']) {
    for (const [operationId, prompts] of Object.entries(baseline[section])) {
      for (const message of prompts) assert.ok(inCorpus.has(`${operationId}\u0000${message}`), `${section} lists a phrasing that is not in the corpus: [${operationId}] ${message}`);
    }
  }
});

test('the baseline is current: every phrasing that routes correctly today is recorded, so an improvement cannot silently regress later', () => {
  const recorded = new Set(Object.entries(baseline.knownGood).flatMap(([operationId, prompts]) => prompts.map((message) => `${operationId}\u0000${message}`)));
  const unrecorded = Object.entries(result.perOp).flatMap(([operationId, row]) => row.hits.filter((message) => !recorded.has(`${operationId}\u0000${message}`)).map((message) => `  [${operationId}] ${message}`));
  assert.deepEqual(unrecorded, [], `Routing improved or phrasings were added; record it with: node scripts/ask-routing-sweep.js --write-baseline\n${unrecorded.join('\n')}`);
});

test('the ratchet itself detects a lost phrasing and a new misroute, and allows an improvement', () => {
  const synthetic = (row) => ({ perOp: { OP: { hits: [], misrouted: [], misses: [], ...row } } });
  const base = { knownGood: { OP: ['kept', 'will be lost'] }, knownMisrouted: { OP: ['already wrong'] } };

  const lost = compareToBaseline(synthetic({ hits: ['kept'], misses: [{ message: 'will be lost', outcome: 'fb', got: 'GROUNDED_GUIDANCE' }] }), base);
  assert.deepEqual(lost.lost.map((entry) => entry.message), ['will be lost']);
  assert.equal(lost.newMisroutes.length, 0);

  const worse = compareToBaseline(synthetic({ hits: ['kept', 'will be lost'], misrouted: ['brand new wrong'], misses: [{ message: 'brand new wrong', outcome: 'mis', got: 'OTHER_OP' }] }), base);
  assert.deepEqual(worse.newMisroutes.map((entry) => entry.message), ['brand new wrong']);

  const better = compareToBaseline(synthetic({ hits: ['kept', 'will be lost', 'already wrong', 'was a fallback'] }), base);
  assert.deepEqual([better.lost.length, better.newMisroutes.length], [0, 0]);

  const regenerated = baselineFrom({ perOp: { OP: { hits: ['b', 'a'], misrouted: ['z'] } } });
  assert.deepEqual(regenerated, { version: 1, knownGood: { OP: ['a', 'b'] }, knownMisrouted: { OP: ['z'] } });
});
