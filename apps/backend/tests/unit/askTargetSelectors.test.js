const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

// Capability discovery Phase 7 (IW-SHELL-022): domain-owned target selectors. The real fact catalog, completeness projection, selector registry
// and contract run; only the database-backed reads (the Property Context snapshot, the DIY service, the guide evaluation) are replaced.
const selectors = require('../../src/services/ask/askTargetSelectors.ts');
const propertyContext = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const { diyService } = require('../../src/services/diy.service.ts');
const projectGuide = require('../../src/services/diy/projectGuide.ts');
const { PROPERTY_FACT_CATALOG } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');
const { PROPERTY_AREA_CAPTURE_SCOPES } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const { AREA_CAPTURE_MESSAGES } = require('../../src/services/ask/support/capture.ts');
const { AskTargetSelectionSchema, ASK_TARGET_SELECTOR_IDS } = require('../../src/productFramework/ask/askTargetSelection.contract.ts');
const { resolveDiscoveryAttribution } = require('../../src/services/ask/askCapabilityLifecycle.ts');

const { loadAskTargetSelection, ASK_TARGET_SELECTORS, getAskTargetSelector, DIY_GUIDE_LAUNCH_MESSAGE } = selectors;
const access = (role) => async () => ({ role });
const NOW = new Date('2026-10-10T12:00:00.000Z');
const load = (id, role = 'OWNER', extra = {}) => loadAskTargetSelection(id, 'u1', 'p1', { access: access(role), now: () => NOW, ...extra });

function withStubs(stubs, run) {
  const originals = [];
  for (const [target, key, value] of stubs) { originals.push([target, key, target[key]]); target[key] = value; }
  return Promise.resolve(run()).finally(() => { for (const [target, key, value] of originals) target[key] = value; });
}

// A snapshot in which every writable fact of the listed scopes is KNOWN and everything else is unknown.
const snapshotWith = ({ completeScopes = [], conflicted = [], stale = [] } = {}) => {
  const facts = {};
  for (const fact of PROPERTY_FACT_CATALOG) {
    if (completeScopes.includes(fact.scope)) facts[fact.key] = { state: 'KNOWN', value: 'x' };
  }
  for (const key of conflicted) facts[key] = { state: 'CONFLICTED', value: 'x' };
  for (const key of stale) facts[key] = { state: 'STALE', value: 'x' };
  return { propertyId: 'p1', contextVersion: 'ctx-1', scopes: [...PROPERTY_AREA_CAPTURE_SCOPES], facts };
};
const viaSnapshot = (snapshot) => [propertyContext, 'getPropertyContext', async () => snapshot];

test('the registry names exactly the two selectors, each launching its own target operation', () => {
  assert.deepEqual(Object.keys(ASK_TARGET_SELECTORS).sort(), [...ASK_TARGET_SELECTOR_IDS].sort());
  assert.equal(ASK_TARGET_SELECTORS.PROPERTY_AREA.operationId, 'PROPERTY_CONTEXT_AREA_CAPTURE');
  assert.equal(ASK_TARGET_SELECTORS.DIY_PROJECT.operationId, 'DIY_PROJECT_GUIDE');
  assert.equal(getAskTargetSelector('NOPE'), undefined);
});

test('an unknown selector is a not-found error, and an access failure is an error, not an empty selection', async () => {
  await assert.rejects(load('NOPE'), (error) => error.code === 'ASK_TARGET_SELECTOR_NOT_FOUND');
  await assert.rejects(loadAskTargetSelection('PROPERTY_AREA', 'u1', 'p1', { access: async () => { const e = new Error('no'); e.code = 'ASK_PROPERTY_NOT_FOUND'; throw e; } }), (error) => error.code === 'ASK_PROPERTY_NOT_FOUND');
});

test('area selector: only areas with askable missing, conflicted, or stale facts are offered, with a plain summary and the real launch', async () => {
  const writable = (scope) => PROPERTY_FACT_CATALOG.filter((fact) => fact.scope === scope && fact.writable).map((fact) => fact.key);
  const systems = writable('SYSTEMS');
  await withStubs([viaSnapshot(snapshotWith({ completeScopes: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SAFETY'], conflicted: [systems[0]], stale: [systems[1]] }))], async () => {
    const selection = await load('PROPERTY_AREA');
    AskTargetSelectionSchema.parse(selection);
    assert.equal(selection.state, 'OPTIONS');
    assert.deepEqual(selection.options.map((option) => option.targetId), ['SYSTEMS']);
    const option = selection.options[0];
    assert.match(option.summary, /1 detail to review/);
    assert.match(option.summary, /1 detail to refresh/);
    assert.deepEqual([option.availability, option.reasonCodes], ['AVAILABLE', []]);
    assert.deepEqual(option.launch, { operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', message: AREA_CAPTURE_MESSAGES.SYSTEMS, entityType: 'PROPERTY_CONTEXT_AREA', entityId: 'SYSTEMS' });
    assert.equal(selection.truncated, false);
  });
});

test('area selector: a record with everything known is NONE_ELIGIBLE with an honest explanation, not an error', async () => {
  await withStubs([viaSnapshot(snapshotWith({ completeScopes: [...PROPERTY_AREA_CAPTURE_SCOPES] }))], async () => {
    const selection = await load('PROPERTY_AREA');
    assert.equal(selection.state, 'NONE_ELIGIBLE');
    assert.deepEqual(selection.options, []);
    assert.match(selection.explanation, /nothing to add/i);
  });
});

test('area selector: an empty record offers every area, and a viewer sees them as unavailable with the permission reason', async () => {
  await withStubs([viaSnapshot(snapshotWith())], async () => {
    const owner = await load('PROPERTY_AREA', 'OWNER');
    assert.deepEqual(owner.options.map((option) => option.targetId), [...PROPERTY_AREA_CAPTURE_SCOPES]);
    assert.ok(owner.options.every((option) => option.availability === 'AVAILABLE'));
    const viewer = await load('PROPERTY_AREA', 'VIEWER');
    assert.ok(viewer.options.every((option) => option.availability === 'UNAVAILABLE' && option.reasonCodes[0] === 'ASK_PERMISSION_REQUIRED'));
  });
});

test('area selector: a source failure is UNAVAILABLE and is never reported as "nothing to choose"', async () => {
  await withStubs([[propertyContext, 'getPropertyContext', async () => { throw new Error('db down'); }]], async () => {
    const selection = await load('PROPERTY_AREA');
    assert.equal(selection.state, 'UNAVAILABLE');
    assert.notEqual(selection.state, 'NONE_ELIGIBLE');
    assert.deepEqual(selection.options, []);
    assert.match(selection.explanation, /could not be checked/i);
  });
});

test('area selector: the Property Context is read once for all areas, not once per area', async () => {
  let reads = 0;
  await withStubs([[propertyContext, 'getPropertyContext', async () => { reads += 1; return snapshotWith(); }]], async () => {
    await load('PROPERTY_AREA');
    assert.equal(reads, 1);
  });
});

// ---- DIY project selector -------------------------------------------------------------------------------------------------------------------------
const listing = (items, nextCursor) => [diyService, 'listProjects', async () => ({ items, nextCursor })];
const project = (id, over = {}) => ({ id, title: `Project ${id}`, status: 'IN_PROGRESS', templateId: 't', aiGuideId: null, templateRevisionId: 'r', ...over });
const sourceFor = (id) => ({ project: { id, steps: [{ stepNumber: 1, status: 'COMPLETED', title: 'Prep' }, { stepNumber: 2, status: 'PENDING', title: 'Turn off the water' }] } });
const guideStub = (states) => [projectGuide, 'evaluateProjectGuide', (source) => states[source.project.id] ?? { kind: 'REFUSED', reason: 'NOT_ELIGIBLE' }];
const sourceStub = [diyService, 'getProjectGuideSource', async (id) => sourceFor(id)];

test('project selector: only guideable projects are offered; the current reviewed guide is available, a changed one is shown unavailable with why', async () => {
  await withStubs([
    listing([project('a'), project('b', { status: 'PLANNING' }), project('c'), project('d'), project('ai', { aiGuideId: 'g' }), project('page', { templateId: null }), project('old', { templateRevisionId: null })]),
    sourceStub,
    guideStub({ a: { kind: 'GUIDE', sourceState: 'CURRENT' }, b: { kind: 'GUIDE', sourceState: 'CURRENT' }, c: { kind: 'GUIDE', sourceState: 'SUPERSEDED' }, d: { kind: 'GUIDE', sourceState: 'WITHDRAWN' } }),
  ], async () => {
    const selection = await load('DIY_PROJECT');
    AskTargetSelectionSchema.parse(selection);
    assert.equal(selection.state, 'OPTIONS');
    assert.deepEqual(selection.options.map((option) => [option.targetId, option.availability, option.reasonCodes]), [
      ['a', 'AVAILABLE', []], ['b', 'AVAILABLE', []], ['c', 'UNAVAILABLE', ['GUIDE_SUPERSEDED']], ['d', 'UNAVAILABLE', ['GUIDE_WITHDRAWN']],
    ]);
    assert.equal(selection.options[0].summary, 'In progress · Next: Turn off the water');
    assert.equal(selection.options[1].summary.startsWith('Planning'), true);
    assert.deepEqual(selection.options[0].launch, { operationId: 'DIY_PROJECT_GUIDE', message: DIY_GUIDE_LAUNCH_MESSAGE, entityType: 'DIY_PROJECT', entityId: 'a' });
  });
});

test('project selector: projects that exist but cannot be guided give NONE_ELIGIBLE with an explanation, and no projects at all does too', async () => {
  await withStubs([listing([project('x')]), sourceStub, guideStub({})], async () => {
    const selection = await load('DIY_PROJECT');
    assert.equal(selection.state, 'NONE_ELIGIBLE');
    assert.match(selection.explanation, /reviewed guide/i);
  });
  await withStubs([listing([])], async () => assert.equal((await load('DIY_PROJECT')).state, 'NONE_ELIGIBLE'));
});

test('project selector: a source failure, even for one project, is UNAVAILABLE rather than a shorter list or an empty one', async () => {
  await withStubs([[diyService, 'listProjects', async () => { throw new Error('db down'); }]], async () => assert.equal((await load('DIY_PROJECT')).state, 'UNAVAILABLE'));
  await withStubs([listing([project('a'), project('b')]), [diyService, 'getProjectGuideSource', async (id) => { if (id === 'b') throw new Error('read failed'); return sourceFor(id); }], guideStub({ a: { kind: 'GUIDE', sourceState: 'CURRENT' } })], async () => {
    const selection = await load('DIY_PROJECT');
    assert.equal(selection.state, 'UNAVAILABLE');
    assert.deepEqual(selection.options, []);
  });
});

test('project selector: more projects than are examined is flagged as truncated', async () => {
  const many = Array.from({ length: 15 }, (_, index) => project(`p${index}`));
  await withStubs([listing(many), sourceStub, guideStub(Object.fromEntries(many.map((item) => [item.id, { kind: 'GUIDE', sourceState: 'CURRENT' }])))], async () => {
    const selection = await load('DIY_PROJECT');
    assert.equal(selection.options.length, 12);
    assert.equal(selection.truncated, true);
  });
  await withStubs([listing([project('a')], 'cursor-2'), sourceStub, guideStub({ a: { kind: 'GUIDE', sourceState: 'CURRENT' } })], async () => assert.equal((await load('DIY_PROJECT')).truncated, true));
});

test('a single option is still just an option: the selection never launches anything itself', async () => {
  await withStubs([listing([project('only')]), sourceStub, guideStub({ only: { kind: 'GUIDE', sourceState: 'CURRENT' } })], async () => {
    const selection = await load('DIY_PROJECT');
    assert.equal(selection.options.length, 1);
    // Reading a selection has no write path at all: the module imports no mutating service call.
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/askTargetSelectors.ts'), 'utf8');
    assert.doesNotMatch(source, /\.(create|update|delete|upsert|createMany|updateMany)\(/);
  });
});

test('lifecycle attribution accepts a chosen option\'s message and rejects the idea\'s own prompt', () => {
  const claim = { entryId: 'understand-add-detail', surface: 'TOPIC', topicId: 'HOME_RECORD' };
  const ok = resolveDiscoveryAttribution({ claim, declaredOperationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', message: AREA_CAPTURE_MESSAGES.SYSTEMS });
  assert.deepEqual([ok.entryId, ok.capabilityId, ok.operationId, ok.topicId], ['understand-add-detail', 'property-brief', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'HOME_RECORD']);
  assert.equal(resolveDiscoveryAttribution({ claim, declaredOperationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', message: 'Help me add a missing detail' }), null);
  assert.equal(resolveDiscoveryAttribution({ claim, declaredOperationId: 'DIY_PROJECT_GUIDE', message: AREA_CAPTURE_MESSAGES.SYSTEMS }), null);
  const diy = resolveDiscoveryAttribution({ claim: { entryId: 'maintain-diy-continue', surface: 'TOPIC', topicId: 'DIY_PROJECTS' }, declaredOperationId: 'DIY_PROJECT_GUIDE', message: DIY_GUIDE_LAUNCH_MESSAGE });
  assert.equal(diy.capabilityId, 'diy');
});

test('the endpoint is wired: a GET route, a controller mapping not-found and permission errors, behind the existing Ask authentication', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/ask.routes.ts'), 'utf8');
  assert.match(routes, /router\.get\('\/ask\/target-selectors\/:selectorId', getAskTargetSelectionHandler\)/);
  assert.match(routes, /router\.use\('\/ask', authenticate, requireAskEligibleAccount\)/);
  const controller = fs.readFileSync(path.join(__dirname, '../../src/controllers/ask.controller.ts'), 'utf8');
  assert.match(controller, /ASK_TARGET_SELECTOR_NOT_FOUND[\s\S]{0,120}404/);
  assert.match(controller, /ASK_PROPERTY_NOT_FOUND[\s\S]{0,160}403/);
});
