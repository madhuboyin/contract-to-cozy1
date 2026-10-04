const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const { scan, countRawProducers, compare, formatIncreases, BASELINE } = require('../../scripts/ask-raw-suggestion-producers.js');

// Plan C.14, "Phase 5 containment". This is a ratchet, not a claim that every follow-up is typed: legacy string chips still exist, and the
// guarantee is only that no new raw producer file or additional raw producer site appears, and legacy producers stay bounded at the
// reviewed per-file baseline. Counts may fall freely.

const count = (source) => countRawProducers('fixture.ts', source);

test('counts only non-empty top-level compact producers', () => {
  assert.equal(count("const r = { status: 'READY', suggestions: ['Show my inventory'] };"), 1);
  assert.equal(count("const r = { suggestions: cond ? ['A'] : [] };"), 1);
  assert.equal(count('const r = { suggestions: items.map((i) => `Open ${i.name}`) };'), 1);
  assert.equal(count("const r = { suggestions: ['A'] }; const s = { suggestions: ['B', 'C'] };"), 2);
});

test('does not count empty lists, pass-throughs, block-local metadata, shorthand or typed candidates', () => {
  assert.equal(count('const r = { suggestions: [] };'), 0);
  assert.equal(count('const r = { suggestions: [] as string[] };'), 0);
  assert.equal(count('const r = { suggestions: result.suggestions };'), 0);
  assert.equal(count('const r = { suggestions: stored.suggestions ?? [] };'), 0);
  assert.equal(count('const r = { suggestions: input.suggestions.slice(0, 5) };'), 0);
  assert.equal(count('const suggestions = []; const r = { suggestions };'), 0);
  assert.equal(count("const block = { type: 'BOUNDARY', id: 'b', suggestions: ['Ask about recorded maintenance'] };"), 0);
  assert.equal(count("const r = { suggestedNextActionCandidates: [{ label: 'Add the brand', message: 'x' }] };"), 0);
  assert.equal(count("const r = { other: { notSuggestions: ['x'] } };"), 0);
});

test('the scan ignores test files and files outside src/services/ask', () => {
  const files = Object.keys(scan());
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.match(file, /^src\/services\/ask\//);
    assert.doesNotMatch(file, /\.(test|spec)\.|__tests__/);
  }
});

test('compare: a new file or a per-file increase fails; a decrease or a removed file does not', () => {
  const baseline = { 'a.ts': 3, 'b.ts': 2, 'c.ts': 1 };
  const clean = compare({ 'a.ts': 3, 'b.ts': 1 }, baseline);
  assert.deepEqual(clean.increases, []);
  assert.deepEqual(clean.decreases, [{ file: 'b.ts', before: 2, now: 1 }, { file: 'c.ts', before: 1, now: 0 }]);
  const bad = compare({ 'a.ts': 4, 'b.ts': 2, 'c.ts': 1, 'd.ts': 1 }, baseline);
  assert.deepEqual(bad.increases, [
    { file: 'a.ts', before: 3, now: 4, isNewFile: false },
    { file: 'd.ts', before: 0, now: 1, isNewFile: true },
  ]);
  // A drop in one file does not buy headroom in another.
  assert.equal(compare({ 'a.ts': 4, 'b.ts': 0 }, baseline).increases.length, 1);
});

test('the failure message names each file and its count delta, and how to approve an increase', () => {
  const message = formatIncreases([{ file: 'x/new.ts', before: 0, now: 2, isNewFile: true }, { file: 'x/old.ts', before: 3, now: 4, isNewFile: false }]);
  assert.match(message, /x\/new\.ts: 0 -> 2 \(\+2\) \[new producer file\]/);
  assert.match(message, /x\/old\.ts: 3 -> 4 \(\+1\)/);
  assert.match(message, /--write/);
});

test('no production Ask file adds raw string-suggestion producers beyond the reviewed baseline', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
  const { increases } = compare(scan(), baseline);
  assert.deepEqual(increases, [], formatIncreases(increases));
});
