const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({ transpileOnly: true });

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');

// UI review 2026-11-21, P0 #2: confirmed, unknown, conflicted and excluded results are separate collections. A project whose permit requirement is not recorded must
// never be counted as, listed as, or described as a confirmed match.
const PROMPT = 'which active projects still need a permit?';
const project = (base, id, title, permitStatus) => ({ id, propertyId: base.propertyId, title, status: 'ACTIVE', permitStatus });

const runPermits = async (projects) => {
  const base = buildSeededCrossDomainSnapshot();
  const execution = await X.executeCrossDomainSnapshot({ rawText: PROMPT, snapshot: { ...base, projects: projects(base) }, role: 'OWNER', propertyAuthorized: true });
  const facet = execution.facetResults.find((f) => f.receipt && f.receipt.predicateIds.includes('predicate.project.needs_permit_or_unresolved'));
  assert.ok(facet, 'the permit facet executed');
  const lists = facet.blocks.filter((b) => b.type === 'GROUPED_LIST');
  const primary = lists.find((b) => !b.id.endsWith('-needs-confirmation'));
  const unconfirmed = lists.find((b) => b.id.endsWith('-needs-confirmation'));
  const titles = (list) => (list ? list.sections.flatMap((s) => s.items.map((i) => i.title)) : []);
  return { facet, primary, unconfirmed, titles };
};

test('zero confirmed and one unknown: the unknown record is its own collection, not a "confirmed match"', async () => {
  const { facet, primary, unconfirmed, titles } = await runPermits((base) => [project(base, 'p-desk', 'Office Desk', 'UNKNOWN')]);
  assert.equal(facet.summary, 'No projects are confirmed as needing a permit. 1 has no permit requirement recorded.');
  assert.equal(primary, undefined, 'no confirmed-matches list exists when nothing is confirmed');
  assert.deepEqual(titles(unconfirmed), ['Office Desk']);
  assert.equal(unconfirmed.title, 'Needs confirmation');
  assert.equal(unconfirmed.sections[0].items[0].subtitle, 'Permit requirement not recorded');
  assert.equal(facet.receipt.population.confirmedCount, 0);
  assert.equal(facet.receipt.population.unknownCount, 1);
  assert.deepEqual(facet.recordIds, []);
  assert.ok(facet.blocks.some((b) => b.type === 'BOUNDARY'), 'the uncertainty disclosure is still present');
  assert.equal(facet.presentationEquivalence.ok, true, JSON.stringify(facet.presentationEquivalence.reasons));
  assert.equal(facet.entailment.outcome, 'PASS');
  const allCopy = JSON.stringify(facet.blocks);
  assert.ok(!/Showing \d+ of \d+ confirmed matches/.test(allCopy), 'no "confirmed matches" line for a record that was not confirmed');
  assert.ok(!/project\(s\)|requirement\(s\)/.test(allCopy), 'no "(s)" pluralisation');
});

test('confirmed projects are listed as matches; unknown ones apart; confirmed-not-required are excluded; counts and grammar are exact', async () => {
  const { facet, primary, unconfirmed, titles } = await runPermits((base) => [
    project(base, 'p-panel', '200A Electrical Panel Upgrade', 'NEEDS_PERMIT'),
    project(base, 'p-deck', 'Deck rebuild', 'UNKNOWN'),
    project(base, 'p-fence', 'Fence repair', 'UNKNOWN'),
    project(base, 'p-paint', 'Interior paint', 'CONFIRMED_NOT_REQUIRED'),
  ]);
  assert.equal(facet.summary, '1 project needs a permit. 2 more have no permit requirement recorded.');
  assert.deepEqual(titles(primary), ['200A Electrical Panel Upgrade']);
  assert.deepEqual(titles(unconfirmed), ['Deck rebuild', 'Fence repair']);
  assert.ok(!titles(primary).concat(titles(unconfirmed)).includes('Interior paint'));
  assert.equal(facet.receipt.population.confirmedCount, 1);
  assert.equal(facet.receipt.population.unknownCount, 2);
  assert.deepEqual(facet.recordIds, ['p-panel']);
  assert.equal(facet.presentationEquivalence.ok, true, JSON.stringify(facet.presentationEquivalence.reasons));
  assert.deepEqual(facet.metrics, { confirmedNeedsCount: 1, unknownCount: 2 });
});

test('several confirmed and none unknown: plural grammar, no unconfirmed collection', async () => {
  const { facet, primary, unconfirmed } = await runPermits((base) => [project(base, 'a', 'Roof', 'NEEDS_PERMIT'), project(base, 'b', 'Addition', 'NEEDS_PERMIT')]);
  assert.equal(facet.summary, '2 projects need a permit.');
  assert.equal(primary.sections.flatMap((s) => s.items).length, 2);
  assert.equal(unconfirmed, undefined);
});

test('the verifier rejects an unconfirmed list whose size disagrees with the receipt, or that lists a confirmed record', async () => {
  const { facet } = await runPermits((base) => [project(base, 'p-panel', 'Panel', 'NEEDS_PERMIT'), project(base, 'p-deck', 'Deck', 'UNKNOWN')]);
  const { verifyRichPresentationPopulationEquivalence } = require('../../src/services/ask/semantic/slice/richPresentationAdapter.ts');
  const tampered = facet.blocks.map((b) => b.id.endsWith('-needs-confirmation') ? { ...b, sections: [{ ...b.sections[0], items: [...b.sections[0].items, { id: 'p-panel', title: 'Panel' }] }] } : b);
  const report = verifyRichPresentationPopulationEquivalence(facet.receipt, tampered);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((r) => r.startsWith('unconfirmed_count_mismatch')));
  assert.ok(report.reasons.some((r) => r.startsWith('unconfirmed_listed_as_confirmed')));
});
