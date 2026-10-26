const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { isRenovationRequirementsRequest, renovationRequirementRows, isRenovationCaseOverviewRequest, renovationCaseRows, renovationNextStep, renovationLifecycleLabel } = require('../../src/services/ask/support/renovationCaseOverview.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const caseRow = (id, name, lifecycle, extra = {}) => ({ id, name, lifecycle, updatedAt: new Date('2026-10-20T00:00:00Z'), ...extra });

test('only a request for the cases themselves is the overview', () => {
  for (const yes of ['Show my renovation cases', 'show my renovations', 'List all renovations.', 'What are my renovation cases?', 'my remodel plans']) assert.equal(isRenovationCaseOverviewRequest(yes), true, yes);
  for (const no of ['Which renovations add the most value?', 'my renovation costs too much', 'Is my renovation ready to start?', 'What renovations should I do']) assert.equal(isRenovationCaseOverviewRequest(no), false, no);
});

test('the overview request routes to the renovation case answer, and the start command still wins', () => {
  assert.equal(resolveAskOperation('Show my renovation cases').operationId, 'RENOVATION_PERMIT_READINESS');
  assert.equal(resolveAskOperation('Start a renovation case.').operationId, 'RENOVATION_CASE_START');
});

test('next steps follow the lifecycle and say which ones Ask cannot do yet', () => {
  assert.deepEqual(renovationNextStep('REQUIREMENTS_RESEARCH'), { title: 'Determine permit, HOA and safety requirements', inAsk: true });
  assert.deepEqual(renovationNextStep('IDEA'), { title: 'Clarify the idea and constraints', inAsk: false });
  assert.equal(renovationNextStep('APPROVALS_IN_PROGRESS').inAsk, true);
  assert.deepEqual(renovationNextStep('PREPARING_TO_START', 'NOT_READY', 2), { title: 'Resolve 2 blocking readiness items', inAsk: true });
  assert.equal(renovationNextStep('PREPARING_TO_START', 'READY').title, 'Create or open the execution project');
  assert.equal(renovationNextStep('PREPARING_TO_START', null).title, 'Evaluate start readiness');
  assert.equal(renovationLifecycleLabel('APPROVALS_IN_PROGRESS'), 'Approvals in progress');
});

test('each case row carries its stage, readiness, next step and its own action, except the one detailed below', () => {
  const rows = renovationCaseRows([
    caseRow('a', 'Kitchen remodel', 'PREPARING_TO_START', { readinessSummary: { state: 'NOT_READY', blockingItems: 3 }, currentScopeVersion: { approvalStatus: 'APPROVED' } }),
    caseRow('b', 'Deck', 'REQUIREMENTS_RESEARCH'),
  ], 'a');
  assert.deepEqual(rows[0].meta, ['Preparing to start', 'Not ready to start', 'Scope approved', 'Detailed below']);
  assert.equal(rows[0].actions, undefined);
  assert.match(rows[0].description, /Resolve 3 blocking readiness items/);
  assert.deepEqual(rows[1].meta, ['Researching requirements', 'Readiness not evaluated']);
  assert.doesNotMatch(rows[1].description, /not currently available in Ask/, 'requirements research can be done in Ask now');
  assert.equal(rows[1].actions[0].message, 'Is my renovation Deck ready to start?');
  assert.equal(rows[1].actions[0].operationId, 'RENOVATION_PERMIT_READINESS');
});

test('the case list is schema-valid and its row actions survive the answer-trust validator', () => {
  const items = renovationCaseRows([caseRow('a', 'Kitchen', 'IDEA'), caseRow('b', 'Deck', 'IDEA')], 'a');
  const list = { type: 'GROUPED_LIST', filters: [], id: 'renovation-cases', title: 'Your renovation cases', sections: [{ id: 'cases', title: 'Renovation cases', count: 2, items }], actions: [] };
  assert.ok(AskPresentationBlockSchema.safeParse(list).success);
  const result = {
    status: 'ANSWERED', suggestions: [], blocks: [{ type: 'SUMMARY', id: 'renovation-cases-summary', title: 'You have 2 renovation cases', body: 'Listed with their stage.', tone: 'DEFAULT', actions: [] }, list],
    parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'renovation-permit.readiness', operationId: 'RENOVATION_PERMIT_READINESS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } },
  };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my renovation cases', operationId: 'RENOVATION_PERMIT_READINESS', result, propertyId: 'p1' });
  const kept = validated.blocks.find((block) => block.id === 'renovation-cases').sections[0].items.flatMap((item) => item.actions ?? []);
  assert.deepEqual(kept.map((action) => action.id), ['renovation-case-show-requirements', 'renovation-case-show-readiness', 'renovation-case-show-requirements']);
});

const requirement = (id, overrides = {}) => ({
  id, family: 'BUILDING_PERMIT', question: 'Does this scope need a building permit?', advisoryLikelihood: 'LIKELY_APPLIES', determination: 'UNDETERMINED', truthLayer: 'ADVISORY',
  confidence: 'MEDIUM', exactNextAction: 'Ask the building department.', dueAt: null, isBlocking: true, ...overrides,
});

test('a requirements request is narrow and routes to the renovation answer', () => {
  for (const yes of ['What requirements apply to my renovation?', 'Show the permit requirements for my remodel']) assert.equal(isRenovationRequirementsRequest(yes), true, yes);
  for (const no of ['Is my renovation ready to start?', 'Show my renovation cases', 'What are the requirements for a mortgage?']) assert.equal(isRenovationRequirementsRequest(no), false, no);
  assert.equal(resolveAskOperation('What requirements apply to my renovation?').operationId, 'RENOVATION_PERMIT_READINESS');
});

test('research candidates and sourced determinations are shown apart, with who confirmed what', () => {
  const { unresolved, determined } = renovationRequirementRows([
    requirement('a', { dueAt: new Date('2026-11-01T00:00:00Z'), limitation: 'Local rules vary.' }),
    requirement('b', { family: 'HOA_APPROVAL', determination: 'APPLIES', truthLayer: 'AUTHORITY_CONFIRMED', confirmedByName: 'J. Rivera', sourceUrl: 'https://www.cityname.gov/permits', sourceSection: 'Sec. 4', isBlocking: false }),
  ], () => 'Nov 1, 2026');
  assert.equal(unresolved.length, 1);
  assert.deepEqual(unresolved[0].meta, ['Research needed', 'Advisory likelihood: likely applies', 'Confidence: medium', 'Blocks starting']);
  assert.match(unresolved[0].detail, /Next step: Ask the building department\.\nResearch due Nov 1, 2026\nLimitation: Local rules vary\./);
  assert.equal(determined[0].title, 'Hoa approval');
  assert.match(determined[0].detail, /Confirmed by: J\. Rivera\nSource: cityname\.gov, Sec\. 4/);
  assert.equal(determined[0].meta.includes('Blocks starting'), false);
});

test('cases in a requirements stage offer Show requirements, and the rows are schema-valid', () => {
  const rows = renovationCaseRows([caseRow('a', 'Deck', 'REQUIREMENTS_RESEARCH'), caseRow('b', 'Roof', 'IN_EXECUTION')], 'b');
  assert.deepEqual(rows[0].actions.map((action) => action.id), ['renovation-case-show-readiness', 'renovation-case-show-requirements']);
  assert.equal(rows[1].actions, undefined);
  assert.equal(rows[0].actions[1].message, 'Show the requirements for my renovation Deck.');
  const { unresolved } = renovationRequirementRows([requirement('a')], () => 'x');
  const list = { type: 'GROUPED_LIST', filters: [], id: 'renovation-requirements', title: 'Requirements', sections: [{ id: 'unresolved', title: 'Needs research', count: 1, items: unresolved }], actions: [] };
  assert.ok(AskPresentationBlockSchema.safeParse(list).success);
});
