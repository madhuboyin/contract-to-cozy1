const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || 'true';
require('ts-node/register');
const { BASELINE_PATH, runCompoundSweep, compareToBaseline, summarize, RANK } = require('../../scripts/lib/askCompoundSweep');
const corpus = require('../fixtures/askCompoundCorpus.js');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

test('compound corpus: every named operation exists and every `full` operation is also a `needs` operation', () => {
  for (const row of corpus) {
    for (const id of [...row.needs, ...row.full]) assert.ok(ASK_OPERATION_DEFINITIONS[id], `${id} in "${row.prompt}"`);
    for (const id of row.full) assert.ok(row.needs.includes(id), `${id} is full but not needed in "${row.prompt}"`);
  }
  assert.equal(new Set(corpus.map((row) => row.prompt)).size, corpus.length, 'prompts are unique');
});

test('compound ratchet: no prompt does worse than its recorded outcome, and every prompt is recorded', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const diff = compareToBaseline(runCompoundSweep(corpus), baseline);
  assert.deepEqual(diff.worse.map((r) => `${r.was} -> ${r.outcome}: ${r.prompt}`), []);
  assert.deepEqual(diff.unrecorded.map((r) => r.prompt), [], 'new prompts: run scripts/ask-compound-sweep.js --write-baseline');
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.better.map((r) => `${r.was} -> ${r.outcome}: ${r.prompt}`), [], 'an improvement must be recorded: run scripts/ask-compound-sweep.js --write-baseline');
});

test('compound ratchet: the owner prompt is answered in full, and the single-clause controls keep their operation', () => {
  const results = runCompoundSweep(corpus);
  const by = (text) => results.find((r) => r.prompt.startsWith(text));
  assert.equal(by('In case if i want to replace my roof').outcome, 'FULL');
  for (const text of ['How old is my roof?', 'Show my capital plan for major', 'Should I repair or replace my roof?', 'Is my dishwasher still under warranty']) {
    assert.equal(by(text).outcome, 'FULL', text);
  }
  assert.ok(RANK.FULL > RANK.PARTIAL && summarize(results).n === corpus.length);
});
