const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({ transpileOnly: true });

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { fixOptionalPlurals } = require('../../src/services/ask/semantic/containment/presentationHumanizer.ts');

// UI review 2026-11-21, slice 4 (density and duplication): a list answer states its count once, repeats no heading, uses dense one-line rows, and carries one calm uncertainty note.
const run = async (rawText, patch = {}) => {
  const base = buildSeededCrossDomainSnapshot();
  const execution = await X.executeCrossDomainSnapshot({ rawText, snapshot: { ...base, ...patch }, role: 'OWNER', propertyAuthorized: true });
  return { execution, facet: execution.facetResults[0], operation: X.buildOperationResultFromCrossDomainExecution(execution) };
};
const project = (base, id, title, permitStatus) => ({ id, propertyId: base.propertyId, title, status: 'ACTIVE', permitStatus });

test('optional plurals agree with the count', () => {
  assert.equal(fixOptionalPlurals('0 project(s) and 1 permit requirement(s), 3 open claim(s), 2 propert(y)'), '0 projects and 1 permit requirement, 3 open claims, 2 propert(y)');
  assert.equal(fixOptionalPlurals('1 task(s)'), '1 task');
  assert.equal(fixOptionalPlurals('2 entry(s)'), '2 entries');
  assert.equal(fixOptionalPlurals('no counts item(s) here'), 'no counts item(s) here');
});

test('a summary that names the rows listed below it is shortened, and a disclosure after it is kept', () => {
  const rows = ['Gutter cleaning', 'Furnace service', 'Roof check'];
  assert.equal(X.withoutRowEnumeration('3 maintenance task(s): Gutter cleaning, Furnace service, Roof check.', rows), '3 maintenance task(s).');
  assert.equal(X.withoutRowEnumeration('3 open permit(s): A-1 (Open), B-2 (Open). 1 has no confirmed status, so it is counted on what you reported.', ['A-1', 'B-2']), '3 open permit(s). 1 has no confirmed status, so it is counted on what you reported.');
  assert.equal(X.withoutRowEnumeration('1 task: Only one.', ['Only one']), '1 task.', 'a single row named as the whole tail is the list said again');
  assert.equal(X.withoutRowEnumeration('Only one is due soon.', ['Only one']), 'Only one is due soon.', 'a row named inside a sentence is kept');
  assert.equal(X.withoutRowEnumeration('2 tasks: A, B.', ['A', 'B', 'C']), '2 tasks.');
});

test('a list answer is dense, has no "Matched records" heading, no repeated title and no "Showing N of N confirmed matches"', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const { facet } = await run('which active projects still need a permit?', { projects: [project(base, 'a', 'Roof', 'NEEDS_PERMIT'), project(base, 'b', 'Addition', 'NEEDS_PERMIT')] });
  const list = facet.blocks.find((b) => b.type === 'GROUPED_LIST' && !b.id.endsWith('-needs-confirmation'));
  assert.equal(list.listDensity, 'DENSE');
  assert.equal(list.title, '', 'the list does not repeat the answer heading');
  assert.equal(list.sections[0].title, '', 'no "Matched records" heading');
  assert.ok(!/Showing \d+ of \d+/.test(list.description ?? ''), 'a complete list does not announce its own size');
  const copy = JSON.stringify(facet.blocks);
  assert.ok(!/Matched records|confirmed matches|\(s\)/.test(copy));
});

test('the uncertainty note is one calm line with no instruction the homeowner cannot act on', async () => {
  const base = buildSeededCrossDomainSnapshot();
  const { facet } = await run('which active projects still need a permit?', { projects: [project(base, 'a', 'Roof', 'NEEDS_PERMIT'), project(base, 'b', 'Desk', 'UNKNOWN')] });
  const boundary = facet.blocks.find((b) => b.type === 'BOUNDARY');
  assert.equal(boundary.severity, 'INFO');
  assert.deepEqual(boundary.suggestions, []);
  assert.equal(boundary.body, '1 record could not be confirmed, so it isn’t counted either way.');
  assert.ok(!/Add or correct the missing details/.test(JSON.stringify(facet.blocks)));
  const unconfirmed = facet.blocks.find((b) => b.id.endsWith('-needs-confirmation'));
  assert.equal(unconfirmed.listDensity, 'DENSE');
});

test('answer first: the headline is the answer’s own first sentence and the rest is one supporting line', () => {
  const { answerFirst } = require('../../src/services/ask/semantic/slice/richPresentationAdapter.ts');
  assert.deepEqual(answerFirst('1 project needs a permit. 2 more have no permit requirement recorded.', 'Project permit requirements'), { headline: '1 project needs a permit.', supportLine: '2 more have no permit requirement recorded.' });
  assert.deepEqual(answerFirst('No active projects need a permit.', 'Project permit requirements'), { headline: 'No active projects need a permit.' });
  assert.deepEqual(answerFirst('Open claims', 'Open claims'), {}, 'a sentence that is only the title adds nothing');
  assert.deepEqual(answerFirst('', 'Title'), {});
  assert.equal(answerFirst('A'.repeat(260) + '.', 'T').headline, undefined, 'an over-long first sentence is not a headline');
});

test('a list of a known record kind names its group by that kind, never an empty heading the domain renderers would print as "· 1"', async () => {
  const { facet } = await run('what claims are open?');
  const list = facet.blocks.find((b) => b.type === 'GROUPED_LIST');
  assert.equal(list.recordKind, 'CLAIM');
  assert.equal(list.sections[0].title, 'Claims');
});
