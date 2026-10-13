const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('ts-node/register');

// Owner ruling 2026-10-13 (FRD v1.331): sharing selected Home Briefing updates is owner-only, shows exactly what becomes public, expires, never includes later
// changes, shows access history and revokes at once. No database, browser or native module.

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
const service = require('../../src/homeBriefing/homeBriefing.service.ts');
const command = require('../../src/services/ask/support/homeBriefingCommand.ts');
const handler = require('../../src/services/ask/handlers/homeBriefingShareCommands.handler.ts');
const { homeBriefingFromView } = require('../../src/services/ask/handlers/homeBriefing.handler.ts');

const OP = 'HOME_BRIEFING_SHARE_COMMAND';
const M = command.BRIEFING_SHARE_MESSAGES;
const DELIVERY = '33333333-3333-4333-8333-333333333333';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SHARE = '44444444-4444-4444-8444-444444444444';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('the form: one to ten updates and a fixed set of lifetimes', () => {
  const p = command.parseBriefingShareAnswer;
  assert.equal(p({ itemIds: [A], expiresInDays: '7' }).success, true);
  assert.deepEqual(p({ itemIds: [A, A, B], expiresInDays: 7 }).data.itemIds, [A, B], 'duplicates collapse');
  assert.equal(p({ itemIds: [], expiresInDays: 7 }).success, false);
  assert.equal(p({ itemIds: ['x'], expiresInDays: 7 }).success, false);
  assert.equal(p({ itemIds: [A], expiresInDays: 365 }).success, false);
  assert.equal(p({ itemIds: [A], expiresInDays: 7, recipientEmail: 'a@b.c' }).success, false, 'no recipient field exists');
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const items = [
  { id: A, title: 'Permit closed nearby', summary: 'A permit on your street closed.', topic: 'LOCAL_CHANGE', updatedAt: T },
  { id: B, title: 'Roof inspection recorded', summary: 'An inspection was added.', topic: 'HOME_HISTORY', updatedAt: T },
];
function withData({ delivery = { id: DELIVERY, generatedAt: T, items }, share = { id: SHARE, status: 'ACTIVE', expiresAt: new Date('2026-12-01'), updatedAt: T, _count: { items: 2 } } } = {}) {
  const saved = { d: prisma.homeBriefingDelivery, s: prisma.homeBriefingShare };
  const where = [];
  prisma.homeBriefingDelivery = { findFirst: async (a) => { where.push(a.where); return delivery; } };
  prisma.homeBriefingShare = { findFirst: async (a) => { where.push(a.where); return share && a.where.id === share.id ? share : null; } };
  return { where, restore() { prisma.homeBriefingDelivery = saved.d; prisma.homeBriefingShare = saved.s; } };
}
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.BRIEFING_SHARE_ENTITY_TYPE, ...over });
const as = async (role, message, ctx) => { const r = withRole(role); try { return await invoke(message, ctx); } finally { r(); } };

test('owner floor, declared-action only; a contributor and a viewer are refused; a refresh is not routable', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  const def = getAskDomainCommandByOperation(OP);
  assert.equal(def.roleFloor, 'OWNER');
  assert.equal(def.authorization, 'PROPERTY_ROLE');
  const w = withData();
  try {
    // The operation's own owner floor refuses first; the handler's check is defense in depth and is exercised directly below.
    assert.equal((await as('CONTRIBUTOR', M.CREATE, launch('CREATE', 'prop-1'))).reasonCode, 'ASK_PERMISSION_REQUIRED');
    assert.equal((await as('VIEWER', M.CREATE, launch('CREATE', 'prop-1'))).reasonCode, 'ASK_PERMISSION_REQUIRED');
    const direct = withRole('CONTRIBUTOR');
    try { assert.equal((await handler.briefingShareResult('user-1', 'prop-1', { kind: 'CREATE', entityId: 'prop-1', sourceExecutionId: null })).reasonCode, 'ASK_OWNER_REQUIRED'); } finally { direct(); }
    assert.equal((await as('OWNER', M.CREATE, launch('CREATE', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOME_BRIEFING_SHARE_NOT_DIRECTLY_ROUTABLE');
    const form = await as('OWNER', M.CREATE, launch('CREATE', 'prop-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), [A, B]);
    assert.deepEqual(w.where[0], { propertyId: 'prop-1', userId: 'user-1' }, 'only the session user\'s own deliveries are read');
  } finally { w.restore(); }
});

test('the review names exactly what becomes public and when it ends, and nothing is created at review', async () => {
  const w = withData();
  const saved = service.createSelectedHomeBriefingShare; let writes = 0;
  service.createSelectedHomeBriefingShare = async () => { writes += 1; };
  const restoreRole = withRole('OWNER');
  try {
    const review = await handler.briefingShareResult('user-1', 'prop-1', { kind: 'CREATE', entityId: 'prop-1', sourceExecutionId: null }, { itemIds: [A], expiresInDays: 7 });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.blocks[0].title, /exactly what becomes public/);
    assert.match(review.blocks[0].body, /Permit closed nearby: A permit on your street closed\./);
    assert.doesNotMatch(review.blocks[0].body, /Roof inspection/);
    assert.match(review.confirmation.description, /Anyone who has the link can read these updates/);
    assert.match(review.confirmation.description, /Updates added or changed later are not included/);
    assert.equal(writes, 0);
    const bad = await handler.briefingShareResult('user-1', 'prop-1', { kind: 'CREATE', entityId: 'prop-1', sourceExecutionId: null }, { itemIds: ['99999999-9999-4999-8999-999999999999'], expiresInDays: 7 });
    assert.equal(bad.reasonCode, 'HOME_BRIEFING_SHARE_SELECTION_INVALID');
  } finally { service.createSelectedHomeBriefingShare = saved; restoreRole(); w.restore(); }
});

test('nothing shareable and no briefing are said, not confirmed', async () => {
  for (const [delivery, code] of [[null, 'HOME_BRIEFING_NONE_YET'], [{ id: DELIVERY, generatedAt: T, items: [] }, 'HOME_BRIEFING_NOTHING_SHAREABLE']]) {
    const w = withData({ delivery }); const r = withRole('OWNER');
    try { assert.equal((await invoke(M.CREATE, launch('CREATE', 'prop-1'))).reasonCode, code); } finally { r(); w.restore(); }
  }
});

const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const createVersion = () => sha(`briefing-share:${DELIVERY}:${items.map((i) => `${i.id}${i.updatedAt.toISOString()}`).join(',')}`);

test('confirming creates one link for the selected updates only; the receipt carries the link once and no recipient detail; stale, ineligible and non-owner write nothing', async () => {
  const w = withData();
  const saved = { c: service.createSelectedHomeBriefingShare, r: service.revokeHomeBriefingShare, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  service.createSelectedHomeBriefingShare = async (a) => { calls.push(['create', a]); return { share: { id: SHARE, expiresAt: new Date('2026-12-01') }, shareUrl: '/home-briefing/share/TOKEN', selectedItemCount: a.itemIds.length }; };
  service.revokeHomeBriefingShare = async (a) => { calls.push(['revoke', a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({ briefingShareCommand: { kind: 'CREATE', entityId: 'prop-1' }, briefingShareContextVersion: createVersion(), briefingShareForm: { itemIds: [A], expiresInDays: 14 } }));
    assert.deepEqual(calls[0], ['create', { propertyId: 'prop-1', userId: 'user-1', deliveryId: DELIVERY, itemIds: [A], expiresInDays: 14 }]);
    const receipt = out.result.blocks[0];
    assert.equal(receipt.actions[0].href, '/home-briefing/share/TOKEN');
    assert.doesNotMatch(JSON.stringify(receipt), /@|recipient/i);
    await confirmCapabilityInvoke(OP, ctx({ briefingShareCommand: { kind: 'REVOKE', entityId: SHARE }, briefingShareContextVersion: sha(`briefing-share-revoke:${SHARE}:ACTIVE:${T.toISOString()}`) }));
    assert.deepEqual(calls[1], ['revoke', { propertyId: 'prop-1', userId: 'user-1', shareId: SHARE }]);
    const before = calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ briefingShareCommand: { kind: 'CREATE', entityId: 'prop-1' }, briefingShareContextVersion: 'old', briefingShareForm: { itemIds: [A], expiresInDays: 7 } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ briefingShareCommand: { kind: 'CREATE', entityId: 'prop-1' }, briefingShareContextVersion: createVersion(), briefingShareForm: { itemIds: ['99999999-9999-4999-8999-999999999999'], expiresInDays: 7 } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ briefingShareCommand: { kind: 'CREATE', entityId: 'prop-1' }, briefingShareContextVersion: createVersion(), briefingShareForm: { itemIds: [A], expiresInDays: 7 } }, 'CONTRIBUTOR')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(calls.length, before);
  } finally { service.createSelectedHomeBriefingShare = saved.c; service.revokeHomeBriefingShare = saved.r; executeOperation.reconcileAskExecutionSideEffects = saved.e; w.restore(); }
});

test('the answer offers sharing and the live links with their access history to an owner only; ids allowlisted; routes owner-floored', () => {
  const view = {
    preference: { enabled: true, cadence: 'WEEKLY', topics: [], channels: ['IN_APP'] },
    current: { generatedAt: new Date('2026-10-01'), items: [{ id: A, title: 'Permit closed', summary: 'x', topic: 'LOCAL_CHANGE', materiality: 'LOW', shareEligible: true, seenAt: null, actedAt: null, dismissedAt: null, notUsefulAt: null }] },
    archive: [], unreadMaterialCount: 1, archiveBoundary: '', editorialBoundary: '',
  };
  const shares = [{ id: SHARE, expiresAt: new Date('2026-12-01'), viewCount: 3, lastViewedAt: new Date('2026-10-05'), itemCount: 2 }];
  const owner = homeBriefingFromView(view, 'prop-1', true, { isOwner: true, shares });
  assert.ok(owner.blocks[0].actions.some((a) => a.id === 'home-briefing-share'));
  const live = owner.blocks.find((b) => b.id === 'home-briefing-live-shares').sections[0].items[0];
  assert.deepEqual(live.meta, ['Opened 3 times', 'Last opened Oct 5, 2026']);
  assert.deepEqual(live.actions.map((a) => a.id), ['home-briefing-share-revoke']);
  const member = homeBriefingFromView(view, 'prop-1', true, { isOwner: false, shares: [] });
  assert.ok(!member.blocks[0].actions.some((a) => a.id === 'home-briefing-share'));
  assert.ok(!member.blocks.some((b) => b.id === 'home-briefing-live-shares'));
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.BRIEFING_SHARE_ACTION_IDS)) assert.equal(applicable(id, 'HOME_BRIEFING_VIEW'), true, id);
  assert.equal(applicable('home-briefing-open-share', OP), true);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/homeBriefing/homeBriefing.routes.ts'), 'utf8');
  for (const route of ['/deliveries/:deliveryId/share', '/shares/:shareId/revoke']) {
    const at = source.indexOf(route);
    assert.ok(at > 0 && source.slice(at, at + 300).includes("requireHouseholdRole('OWNER')"), route);
  }
});
