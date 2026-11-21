const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');

// Hand-computed fixture.
//   P1 electrical E-100  official ISSUED                          -> open
//   P2 plumbing   P-200  official UNKNOWN, reported SUBMITTED     -> open (counted on what the household reported, named)
//   P3 building   B-300  official FINALED                         -> finaled
//   P4 roofing    R-400  official EXPIRED                         -> expired
//   P5 mechanical M-500  official VOIDED                          -> neither open, expired nor finaled
//   P6 fire       F-600  official UNKNOWN, reported COMPLETED     -> open (counted, named); reported finaled but NOT counted as finaled
// Open = P1, P2, P6 (3). Expired = P4. Finaled = P3.
const base = buildSeededCrossDomainSnapshot();
const permit = (id, category, permitNumber, officialStatus, reportedStatus) => ({ id, propertyId: base.propertyId, category, permitNumber, officialStatus, reportedStatus });
const permits = [
  permit('P1', 'ELECTRICAL', 'E-100', 'ISSUED', null),
  permit('P2', 'PLUMBING', 'P-200', 'UNKNOWN', 'SUBMITTED'),
  permit('P3', 'BUILDING', 'B-300', 'FINALED', null),
  permit('P4', 'ROOFING', 'R-400', 'EXPIRED', null),
  permit('P5', 'MECHANICAL', 'M-500', 'VOIDED', null),
  permit('P6', 'FIRE', 'F-600', 'UNKNOWN', 'COMPLETED_REPORTED'),
];

async function ask(message, snapshot = { ...base, permits }) {
  const parsed = parseCrossDomainSemanticRequest(message);
  const execution = await X.executeCrossDomainSnapshot({ rawText: message, snapshot, role: 'OWNER', propertyAuthorized: true });
  const result = X.buildOperationResultFromCrossDomainExecution(execution);
  return { parsed, execution, result, summary: result.blocks.find((b) => b.type === 'SUMMARY')?.body ?? '' };
}
const labels = (execution, index = 0) => execution.facetResults[index].rows.map((row) => row.label);

test('open and pending permits are the records not finaled, expired or voided, with the unconfirmed ones named', async () => {
  for (const message of ['show my pending permits', 'which permits are open', 'any open permits for this home']) {
    const { parsed, execution, summary } = await ask(message);
    assert.deepEqual(parsed.plan.facets.map((f) => f.evidence.jobMatch), ['query.permit.filter'], message);
    assert.deepEqual(labels(execution), ['Electrical permit E-100', 'Plumbing permit P-200', 'Fire permit F-600'], message);
    assert.match(summary, /^3 open permit\(s\) \(not finaled, expired or voided\): /);
    assert.match(summary, /Plumbing permit P-200 \(Official status not confirmed · reported by the household: Submitted\)/);
    assert.match(summary, /2 have no confirmed official status, so they are counted as open on what the household reported\./);
    assert.equal(execution.facetResults[0].entailment.outcome, 'PASS');
  }
});

test('"any open permits for this home" is not answered with seller readiness', async () => {
  const { parsed } = await ask('any open permits for this home');
  assert.equal(parsed.plan.facets.length, 1);
  assert.notEqual(parsed.plan.facets[0].evidence.jobMatch, 'job.seller.listing_readiness');
});

test('"open projects for this home" is not answered with seller readiness either; a listing question still is', async () => {
  const { parsed } = await ask('open projects for this home');
  assert.ok(!parsed.plan.facets.some((f) => f.evidence.jobMatch === 'job.seller.listing_readiness'));
  const seller = await ask('what seller readiness items are still open');
  assert.deepEqual(seller.parsed.plan.facets.map((f) => f.evidence.jobMatch), ['job.seller.listing_readiness']);
});

test('expired uses only the official status', async () => {
  const { execution, summary } = await ask('which permits are expired');
  assert.deepEqual(labels(execution), ['Roofing permit R-400']);
  assert.match(summary, /^1 expired permit\(s\): Roofing permit R-400 \(Official: Expired\)\.$/);
});

test('finaled lists the official finaled record and names the one only the household reported as completed', async () => {
  const { execution, summary } = await ask('show finaled permits');
  assert.deepEqual(labels(execution), ['Building permit B-300']);
  assert.match(summary, /1 more is reported finaled by the household but not confirmed by the authority, so not counted here: Fire permit F-600\./);
});

test('no permits recorded says so without claiming nothing was permitted; none open says how many exist', async () => {
  const none = await ask('which permits are open', { ...base, permits: [] });
  assert.match(none.summary, /^No permits are recorded for this home\. That is not the same as nothing having been permitted/);
  const noneOpen = await ask('which permits are open', { ...base, permits: [permits[2], permits[3], permits[4]] });
  assert.match(noneOpen.summary, /^No open permits are recorded \(not finaled, expired or voided\); 3 permits are recorded in all\./);
});

test('open claims or pending permits answers both parts', async () => {
  const { execution, result, summary } = await ask('Are there any open claims or pending permits for this home?');
  assert.deepEqual(execution.facetResults.map((f) => f.owner.owner === 'UNRESOLVED'), [false, false]);
  assert.match(summary, /open claims?/);
  assert.match(summary, /3 pending permits/);
  assert.doesNotMatch(summary, /couldn’t answer/);
  assert.equal(result.blocks[0].title, 'Open claims and pending permits');
  assert.match(result.blocks[0].body, /^\d+ open claims? · 3 pending permits\.$/);
  const records = result.blocks.filter((block) => block.type === 'GROUPED_LIST');
  assert.deepEqual(records.map((block) => block.id), ['incident-claim-list', 'permit-tracker-permits']);
  assert.deepEqual(records.flatMap((block) => block.sections.flatMap((section) => section.items.map((item) => item.entityType))), [
    ...Array(execution.facetResults[0].recordIds.length).fill('CLAIM'),
    ...Array(execution.facetResults[1].recordIds.length).fill('PERMIT_RECORD'),
  ]);
  assert.ok(records.every((block) => block.listDensity === 'DENSE'));
});

test('the compound answer keeps an explicit empty permits section and separates the record-availability limitation', async () => {
  const { result } = await ask('Are there any open claims or pending permits for this home?', { ...base, permits: [] });
  assert.match(result.blocks[0].body, /^\d+ open claims? · No recorded pending permits\.$/);
  const permitList = result.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === 'permit-tracker-permits');
  assert.equal(permitList.title, 'Pending permits');
  assert.equal(permitList.sections[0].count, 0);
  assert.deepEqual(permitList.sections[0].items, []);
  const limitation = result.blocks.find((block) => block.type === 'BOUNDARY' && block.id === 'permit-record-availability');
  assert.match(limitation.body, /local permitting office/);
  assert.doesNotMatch(result.blocks[0].body, /permitting office/);
});

test('what the rule cannot answer is named, not dropped; a bare permits question and the project question keep their routes', async () => {
  const mixed = await ask('open permits and open projects');
  assert.equal(mixed.result.status, 'READY_WITH_LIMITATIONS');
  assert.match(mixed.summary, /I couldn’t answer “open projects” here, so that part isn’t included in this answer\./);
  const bare = await ask('do I have any permits');
  assert.equal(bare.execution.status, 'NONE_FITS', 'a bare permits question stays with the Permit Tracker read');
  const project = await ask('which projects need a permit');
  assert.deepEqual(project.parsed.plan.facets.map((f) => f.evidence.jobMatch), ['query.project.needs_permit']);
});
