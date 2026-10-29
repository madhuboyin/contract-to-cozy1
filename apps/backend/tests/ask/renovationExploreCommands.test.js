const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Exploring upgrade ideas inside Ask (FRD v1.486). Extra actions of RENOVATION_CASE_START. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const exploreService = require('../../src/services/renovationExplore.service.ts');
const command = require('../../src/services/ask/support/renovationExploreCommand.ts');
const { renovationExploreBlocks, renovationExploreCommandResult } = require('../../src/services/ask/handlers/renovationExploreCommands.handler.ts');

const OP = 'RENOVATION_CASE_START';
const IDS = command.RENOVATION_EXPLORE_ACTION_IDS;
const T = new Date('2026-09-01T00:00:00Z');
const option = (over = {}) => ({ id: 'opt-1', explorationId: 'exp-1', title: 'Widen the doorways', description: 'Wider doors for easier access.', status: 'GENERATED', renovationCaseId: null, updatedAt: T, ...over });
const version = (o) => require('node:crypto').createHash('sha256').update(`explore-option:${o.id}:${o.status}:${o.renovationCaseId ?? ''}:${o.updatedAt.toISOString()}`).digest('hex');

function stubs({ role = 'OWNER', opt = option(), exploration = null } = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, r: prisma.askConfirmationReceipt, e: prisma.renovationExploration, o: prisma.renovationUpgradeOption, c: exploreService.createExploration, u: exploreService.updateOptionDisposition, v: exploreService.convertOptionToCase, q: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  const receipts = [];
  prisma.askConfirmationReceipt = { findUnique: async () => ({ attemptCount: 1 }), updateMany: async (args) => { receipts.push(args); return { count: 1 }; } };
  prisma.renovationExploration = { findFirst: async () => exploration };
  prisma.renovationUpgradeOption = { findFirst: async (args) => (opt && args.where.id === opt.id && args.where.explorationId === opt.explorationId ? opt : null) };
  exploreService.createExploration = async (...args) => { calls.push(['create', ...args]); return { id: 'exp-9', options: [{}, {}, {}] }; };
  exploreService.updateOptionDisposition = async (...args) => { calls.push(['disposition', ...args]); return {}; };
  exploreService.convertOptionToCase = async (...args) => { calls.push(['convert', ...args]); return { id: 'case-1', name: 'Widen the doorways' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, receipts, restore: () => {
    prisma.askConfirmationReceipt = saved.r;
    propertyAccess.resolvePropertyAccess = saved.a; prisma.renovationExploration = saved.e; prisma.renovationUpgradeOption = saved.o; exploreService.createExploration = saved.c;
    exploreService.updateOptionDisposition = saved.u; exploreService.convertOptionToCase = saved.v; executeOperation.reconcileAskExecutionSideEffects = saved.q;
  } };
}
const launch = (actionId, entityId) => ({ operationId: OP, surface: 'ASK_PAGE', actionId, entityId, entityType: command.RENOVATION_OPTION_ENTITY_TYPE });
const invoke = (actionId, entityId) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: command.RENOVATION_EXPLORE_MESSAGES[actionId], launchContext: launch(actionId, entityId) });
const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the goals form maps to the canonical input as Desktop does, and the declared messages are not typed routes', () => {
  const parsed = command.parseRenovationExploreAnswer({ goal: 'energy', secondGoal: 'maintenance', spaces: 'kitchen, , attic', budgetMax: '25000', targetTiming: '', responsibilityContext: 'HOMEOWNER' });
  assert.equal(parsed.success, true);
  assert.deepEqual(command.renovationExploreServiceInput(parsed.data, 'key-1'), {
    goals: ['Energy efficiency / lower bills', 'Reduce ongoing maintenance burden'], responsibilityContext: 'HOMEOWNER', spacesAffected: ['kitchen', 'attic'], systemsAffected: [], budgetMaxCents: 2500000,
    accessibilityPreferences: [], resiliencePreferences: [], efficiencyPreferences: ['ENERGY_EFFICIENCY'], maintenancePreferences: ['LOW_MAINTENANCE'], idempotencyKey: 'key-1',
  });
  assert.equal(command.parseRenovationExploreAnswer({ goal: 'nope' }).success, false);
  assert.equal(command.parseRenovationExploreAnswer({ goal: 'energy', extra: 1 }).success, false);
  assert.equal(command.parseRenovationExploreAnswer({ goal: 'energy', budgetMax: -5 }).success, false);
  assert.deepEqual(command.parseOptionEntityId('exp-1:opt-1'), { explorationId: 'exp-1', optionId: 'opt-1' });
  assert.equal(command.parseOptionEntityId('nope'), null);
  for (const message of Object.values(command.RENOVATION_EXPLORE_MESSAGES)) {
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP);
  }
});

test('a viewer is refused and nothing is written', async () => {
  const s = stubs({ role: 'VIEWER' });
  try {
    assert.equal((await invoke(IDS.START, null)).reasonCode, 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ renovationExploreCommand: { actionId: IDS.START } }, 'VIEWER')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
});

test('explore: the form, a review that says AI generates the ideas, then the canonical createExploration keyed to the execution', async () => {
  const s = stubs();
  try {
    const form = await invoke(IDS.START, null);
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.RENOVATION_EXPLORE_CAPTURE_KEY);
    const input = { actionId: IDS.START, entityId: null, sourceExecutionId: null };
    assert.equal((await renovationExploreCommandResult('user-1', 'prop-1', input, { goal: 'nope' })).reasonCode, 'RENOVATION_EXPLORE_INPUT_INVALID');
    const review = await renovationExploreCommandResult('user-1', 'prop-1', input, { goal: 'energy', budgetMax: 20000, spaces: 'attic' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /generated with AI/);
    assert.deepEqual(review.confirmation.fields.map((f) => f.label), ['Goals', 'Areas', 'Most you would spend']);
    assert.equal(s.calls.length, 0);
    const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
    assert.equal(s.calls[0][0], 'create');
    assert.deepEqual(s.calls[0].slice(1, 3), ['prop-1', 'user-1']);
    assert.equal(s.calls[0][3].idempotencyKey, 'ask:exec-1:renovation-explore');
    assert.equal(s.calls[0][3].budgetMaxCents, 2000000);
    assert.equal(out.result.blocks[0].title, 'Upgrade ideas ready');
    assert.equal(out.artifactId, 'exp-9');
  } finally { s.restore(); }
});

test('save, set aside and create a plan: each is reviewed, bound to the idea version, and calls the canonical service', async () => {
  const s = stubs();
  try {
    const id = 'exp-1:opt-1';
    const save = await invoke(IDS.SAVE, id);
    assert.equal(save.status, 'NEEDS_CONFIRMATION');
    assert.equal(save.contextVersion, version(option()));
    await confirmCapabilityInvoke(OP, ctx(save.parameters));
    assert.deepEqual(s.calls[0], ['disposition', 'prop-1', 'exp-1', 'opt-1', { status: 'SAVED' }]);
    const aside = await invoke(IDS.SET_ASIDE, id);
    const asideOut = await confirmCapabilityInvoke(OP, ctx(aside.parameters));
    assert.deepEqual(s.calls[1], ['disposition', 'prop-1', 'exp-1', 'opt-1', { status: 'REJECTED' }]);
    assert.equal(asideOut.result.blocks[0].title, 'Idea set aside');
    const plan = await invoke(IDS.CREATE_PLAN, id);
    assert.match(plan.confirmation.description, /does not apply for a permit/);
    const planOut = await confirmCapabilityInvoke(OP, ctx(plan.parameters));
    assert.deepEqual(s.calls[2], ['convert', 'prop-1', 'exp-1', 'opt-1', 'user-1', { governanceTier: 'LOW_CONSEQUENCE' }]);
    assert.equal(planOut.artifactType, 'RENOVATION_CASE');
    assert.equal(planOut.artifactId, 'case-1');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...save.parameters, renovationExploreContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(s.calls.length, 3);
  } finally { s.restore(); }
});

test('an idea that already has a plan cannot change, and a set-aside idea cannot become a plan', async () => {
  let s = stubs({ opt: option({ status: 'SELECTED', renovationCaseId: 'case-1' }) });
  try { for (const a of [IDS.SAVE, IDS.SET_ASIDE, IDS.CREATE_PLAN]) assert.equal((await invoke(a, 'exp-1:opt-1')).reasonCode, 'RENOVATION_OPTION_ALREADY_SELECTED'); } finally { s.restore(); }
  s = stubs({ opt: option({ status: 'REJECTED' }) });
  try {
    assert.equal((await invoke(IDS.CREATE_PLAN, 'exp-1:opt-1')).reasonCode, 'RENOVATION_OPTION_REJECTED');
    assert.equal((await invoke(IDS.SAVE, 'exp-1:opt-1')).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke(IDS.SAVE, 'exp-1:missing')).reasonCode, 'RENOVATION_OPTION_NOT_FOUND');
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
});

test('the service refusing a change comes back as a person-readable stale confirmation, not a raw error', async () => {
  const s = stubs();
  try {
    const save = await invoke(IDS.SAVE, 'exp-1:opt-1');
    exploreService.updateOptionDisposition = async () => { throw Object.assign(new Error('A selected option cannot be rejected or returned to saved state.'), { code: 'RENOVATION_OPTION_ALREADY_SELECTED', statusCode: 409 }); };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(save.parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /selected option/.test(e.message));
  } finally { s.restore(); }
});

test('the ideas are read from what is stored with no link; only a contributor or owner sees actions; every id is allowlisted', async () => {
  const exploration = { id: 'exp-1', goals: ['Increase resale value'], options: [
    { id: 'o1', title: 'New', description: 'd', status: 'GENERATED', costMinCents: 100000, costMaxCents: 300000, timeline: '2 weeks', professionalToConsult: 'Contractor', permitGuidance: 'Likely', benefits: ['b1'], renovationCaseId: null },
    { id: 'o2', title: 'Done', description: 'd', status: 'SELECTED', costMinCents: 500000, costMaxCents: 500000, timeline: null, professionalToConsult: '', permitGuidance: '', benefits: [], renovationCaseId: 'c' },
    { id: 'o3', title: 'Aside', description: 'd', status: 'REJECTED', costMinCents: null, costMaxCents: null, timeline: null, professionalToConsult: '', permitGuidance: '', benefits: [], renovationCaseId: null },
  ] };
  let s = stubs({ exploration });
  try {
    const [owner] = await renovationExploreBlocks('prop-1', true);
    const [fresh, selected, aside] = owner.sections[0].items;
    assert.equal(fresh.href, null);
    assert.deepEqual(fresh.actions.map((a) => a.id), [IDS.SAVE, IDS.SET_ASIDE, IDS.CREATE_PLAN]);
    assert.equal(fresh.actions[0].entityId, 'exp-1:o1');
    assert.deepEqual(selected.actions, []);
    assert.deepEqual(aside.actions.map((a) => a.id), [IDS.SAVE]);
    assert.ok(fresh.meta.includes('$1,000 to $3,000'));
    assert.deepEqual(owner.actions.map((a) => a.id), [IDS.START]);
    const [viewer] = await renovationExploreBlocks('prop-1', false);
    assert.ok(viewer.sections[0].items.every((item) => item.actions.length === 0));
    assert.deepEqual(viewer.actions, []);
  } finally { s.restore(); }
  s = stubs({ exploration: null });
  try {
    assert.deepEqual((await renovationExploreBlocks('prop-1', true))[0].actions.map((a) => a.label), ['Explore upgrade ideas']);
    assert.deepEqual(await renovationExploreBlocks('prop-1', false), []);
  } finally { s.restore(); }
  for (const id of Object.values(IDS)) {
    assert.equal(isAskActionApplicable({
      action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
    }), true, id);
  }
});

test('a generation longer than the 60-second claim keeps renewing it, and stops renewing when done', async (t) => {
  const s = stubs();
  t.mock.timers.enable({ apis: ['setInterval'] });
  try {
    const review = await renovationExploreCommandResult('user-1', 'prop-1', { actionId: IDS.START, entityId: null, sourceExecutionId: null }, { goal: 'energy' });
    let finish;
    exploreService.createExploration = async () => new Promise((resolve) => { finish = () => resolve({ id: 'exp-9', options: [{}] }); });
    const pending = confirmCapabilityInvoke(OP, ctx(review.parameters));
    for (let i = 0; i < 20 && !finish; i += 1) await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(15_000 * 5);
    assert.equal(s.receipts.length, 5);
    assert.ok(s.receipts.every((r) => r.where.executionId === 'exec-1' && r.where.status === 'CLAIMED' && r.data.leaseExpiresAt > new Date()));
    finish();
    await pending;
    t.mock.timers.tick(15_000 * 3);
    assert.equal(s.receipts.length, 5);
  } finally { s.restore(); t.mock.timers.reset(); }
});

test('the same goal twice is refused, and what is missing from the home record is listed without a link', async () => {
  assert.equal(command.parseRenovationExploreAnswer({ goal: 'energy', secondGoal: 'energy' }).success, false);
  const exploration = { id: 'exp-1', goals: ['Increase resale value'], missingFacts: [{ factKey: 'core.yearBuilt', correctionAction: '/dashboard/properties/p/profile' }, { factKey: 'structure.roofMaterial' }],
    options: [{ id: 'o1', title: 'New', description: 'd', status: 'GENERATED', costMinCents: null, costMaxCents: null, timeline: null, professionalToConsult: '', permitGuidance: '', benefits: [], renovationCaseId: null }] };
  const s = stubs({ exploration });
  try {
    const blocks = await renovationExploreBlocks('prop-1', true);
    assert.equal(blocks.length, 2);
    assert.match(blocks[1].body, /the year the home was built; roof material/);
    assert.ok(!JSON.stringify(blocks[1]).includes('/dashboard'));
  } finally { s.restore(); }
});
