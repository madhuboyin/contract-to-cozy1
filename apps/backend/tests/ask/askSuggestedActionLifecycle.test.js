const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const svc = require('../../src/services/ask/suggestedActions/askSuggestedActionLifecycle.service.ts');
const reg = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { selectExactFourSuggestedNextActions } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourPolicy.ts');

// ASK_COZY_EXACT_FOUR_REGISTRY_PACKET section 8 / plan C.15.4 step 5: durable lifecycle record. No local database: a fake delegate
// implements exactly the operations the service uses.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-04T12:00:00.000Z');
const later = (ms) => new Date(NOW.getTime() + ms);

function fakeDb(options = {}) {
  const rows = new Map();
  const calls = [];
  const idOf = (w) => JSON.stringify([w.userId, w.propertyId, w.operationId, w.outcomeKey, w.entityType, w.entityId]);
  const matches = (row, w) => {
    for (const [k, v] of Object.entries(w)) {
      if (k === 'OR') { if (!v.some((clause) => matches(row, clause))) return false; continue; }
      const actual = row[k] ?? null;
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        if ('lt' in v && !(actual !== null && actual < v.lt)) return false;
        if ('gt' in v && !(actual !== null && actual > v.gt)) return false;
        if ('not' in v && !(actual !== v.not)) return false;
      } else if (actual !== v && !(v instanceof Date && actual instanceof Date && actual.getTime() === v.getTime())) return false;
    }
    return true;
  };
  const delegate = {
    async upsert(args) {
      calls.push(['upsert', args]);
      if (options.failWrites) throw new Error('db down');
      const w = args.where.userId_propertyId_operationId_outcomeKey_entityType_entityId;
      const existing = rows.get(idOf(w));
      if (!existing) { rows.set(idOf(w), { ...args.create }); return; }
      for (const [k, v] of Object.entries(args.update)) existing[k] = (v && typeof v === 'object' && 'increment' in v) ? existing[k] + v.increment : v;
    },
    async updateMany(args) {
      calls.push(['updateMany', args]);
      if (options.failWrites) throw new Error('db down');
      let count = 0;
      for (const row of rows.values()) if (matches(row, args.where)) { Object.assign(row, args.data); count += 1; }
      return { count };
    },
    async findMany(args) {
      if (options.failReads) throw new Error('db down');
      return [...rows.values()].filter((row) => matches(row, args.where));
    },
  };
  return { db: { askSuggestedActionLifecycle: delegate }, rows, calls };
}

const id = (over = {}) => ({ operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', outcomeKey: 'CAPTURE_SAFETY_DETAILS', entityType: null, entityId: null, ...over });
const offer = (over = {}) => ({ ...id(), slotClass: 'PROFILE_GAP', currentResultOwnership: false, reasonCode: 'AREA_INCOMPLETE', ...over });
const only = (rows) => [...rows.values()];

// ---- schema ------------------------------------------------------------------------------------------------------------------

test('schema: identity is user + property + operation + outcome + entity scope, reason code is metadata, and no text is stored', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const model = schema.slice(schema.indexOf('model AskSuggestedActionLifecycle {'));
  const block = model.slice(0, model.indexOf('\n}\n'));
  assert.match(block, /@@unique\(\[userId, propertyId, operationId, outcomeKey, entityType, entityId\]\)/);
  assert.match(block, /lastReasonCode String\?/);
  assert.ok(!/reasonCode\s+String\s+@default/.test(block), 'no non-null reasonCode identity column');
  for (const forbidden of ['label', 'message', 'text', 'prompt']) assert.ok(!new RegExp(`^\\s+${forbidden}\\b`, 'm').test(block), `no ${forbidden} column`);
  assert.match(block, /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(block, /property\s+Property\s+@relation\(fields: \[propertyId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(schema, /enum AskSuggestedActionDismissalReason \{\s+NOT_NOW\s+NOT_RELEVANT\s+\}/);
});

// ---- registry defaults ---------------------------------------------------------------------------------------------------------

test('cooldown defaults and which classes get one (7 days unrelated opportunity, 24 hours profile, 30 days Not now)', () => {
  assert.equal(reg.COOLDOWN_MS.unrelatedOpportunityOffer, 7 * DAY);
  assert.equal(reg.COOLDOWN_MS.profileOffer, 24 * HOUR);
  assert.equal(reg.COOLDOWN_MS.notNow, 30 * DAY);
  assert.equal(reg.offerCooldownMs('PROFILE_GAP', false), 24 * HOUR);
  assert.equal(reg.offerCooldownMs('HOME_OPPORTUNITY', false), 7 * DAY);
  assert.equal(reg.offerCooldownMs('GOVERNED_CAPABILITY', false), 7 * DAY);
  assert.equal(reg.offerCooldownMs('HOME_OPPORTUNITY', true), null, 'owned by the current answer: no cooldown');
  for (const exempt of ['CONTINUE_WORK', 'URGENT_WORK', 'EXACT_RECORD']) assert.equal(reg.offerCooldownMs(exempt, false), null);
  assert.equal(reg.offerCooldownMs('CURATED_STARTER', false), null, 'starters are the last-resort fill and are not cooled');
});

test('lifecycle key is operation + outcome + entity scope and ignores everything else', () => {
  assert.equal(reg.lifecycleKey(id()), reg.lifecycleKey({ ...id(), entityType: '', entityId: '' }));
  assert.notEqual(reg.lifecycleKey(id()), reg.lifecycleKey(id({ outcomeKey: 'CAPTURE_CORE_DETAILS' })));
  assert.notEqual(reg.lifecycleKey(id()), reg.lifecycleKey(id({ entityType: 'INVENTORY_ITEM', entityId: 'item-1' })));
});

// ---- pure suppression ----------------------------------------------------------------------------------------------------------

test('isLifecycleRowSuppressed: time cooldown, NOT_RELEVANT until the fingerprint changes, completion unless repeatable', () => {
  const row = (over = {}) => ({ operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', outcomeKey: 'CAPTURE_SAFETY_DETAILS', entityType: '', entityId: '', completedAt: null, dismissalReason: null, suppressedUntil: null, contextFingerprint: null, ...over });
  assert.equal(svc.isLifecycleRowSuppressed(row(), NOW), false);
  assert.equal(svc.isLifecycleRowSuppressed(row({ suppressedUntil: later(HOUR) }), NOW), true);
  assert.equal(svc.isLifecycleRowSuppressed(row({ suppressedUntil: later(-HOUR) }), NOW), false, 'expired cooldown');
  const notRelevant = row({ dismissalReason: 'NOT_RELEVANT', contextFingerprint: 'fp-1' });
  assert.equal(svc.isLifecycleRowSuppressed(notRelevant, NOW, 'fp-1'), true);
  assert.equal(svc.isLifecycleRowSuppressed(notRelevant, NOW, 'fp-2'), false, 'lapses when the material state changes');
  assert.equal(svc.isLifecycleRowSuppressed(row({ dismissalReason: 'NOT_RELEVANT' }), NOW, null), true, 'no fingerprint on either side stays suppressed');
  assert.equal(svc.isLifecycleRowSuppressed(row({ dismissalReason: 'NOT_NOW', suppressedUntil: later(-DAY) }), NOW), false);
  assert.equal(svc.isLifecycleRowSuppressed(row({ completedAt: NOW }), NOW), true);
  assert.equal(svc.isLifecycleRowSuppressed(row({ operationId: 'MAINTENANCE_TASK_CREATE', outcomeKey: 'RESTART_AFTER_EXPIRY', completedAt: NOW }), NOW), false, 'a registry-repeatable outcome is not suppressed by completion');
});

// ---- offers --------------------------------------------------------------------------------------------------------------------

test('offers: only cooldown-governed classes are recorded, with offer-based suppression and no text', async () => {
  const { db, rows } = fakeDb();
  const result = await svc.recordSuggestedActionOffers({
    userId: 'u1', propertyId: 'p1', now: NOW, offers: [
      offer(),
      offer({ outcomeKey: 'CAPTURE_CORE_DETAILS', slotClass: 'HOME_OPPORTUNITY', operationId: 'SELL_HOLD_RENT_VIEW' }),
      offer({ outcomeKey: 'OWNED', slotClass: 'HOME_OPPORTUNITY', currentResultOwnership: true }),
      offer({ outcomeKey: 'EXACT', slotClass: 'EXACT_RECORD' }),
      offer({ outcomeKey: 'STARTER', slotClass: 'CURATED_STARTER' }),
    ],
  }, db);
  assert.deepEqual(result, { attempted: 2, ok: true });
  const [profile, opportunity] = only(rows);
  assert.equal(profile.suppressedUntil.getTime(), NOW.getTime() + 24 * HOUR);
  assert.equal(opportunity.suppressedUntil.getTime(), NOW.getTime() + 7 * DAY);
  assert.equal(profile.offerCount, 1);
  assert.equal(profile.firstOfferedAt.getTime(), NOW.getTime());
  assert.equal(profile.lastReasonCode, 'AREA_INCOMPLETE');
  assert.ok(!JSON.stringify(profile).includes('label') && !('message' in profile));
});

test('a changed reason code updates metadata on the SAME row (it cannot create a parallel row and bypass cooldown)', async () => {
  const { db, rows } = fakeDb();
  await svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: NOW, offers: [offer({ reasonCode: 'REASON_A' })] }, db);
  await svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: later(2 * DAY), offers: [offer({ reasonCode: 'REASON_B' })] }, db);
  assert.equal(rows.size, 1);
  const row = only(rows)[0];
  assert.equal(row.lastReasonCode, 'REASON_B');
  assert.equal(row.offerCount, 2);
  assert.equal(row.firstOfferedAt.getTime(), NOW.getTime());
  assert.equal(row.lastOfferedAt.getTime(), later(2 * DAY).getTime());
});

test('an offer never shortens a longer "Not now"; concurrent offers only lengthen suppression', async () => {
  const { db, rows } = fakeDb();
  await svc.recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: id(), reason: 'NOT_NOW', now: NOW }, db);
  const notNowUntil = NOW.getTime() + 30 * DAY;
  assert.equal(only(rows)[0].suppressedUntil.getTime(), notNowUntil);
  await svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: later(DAY), offers: [offer()] }, db);
  assert.equal(only(rows)[0].suppressedUntil.getTime(), notNowUntil, '24h profile cooldown must not shorten the 30-day Not now');
  const concurrent = fakeDb();
  await Promise.all([1, 2, 3].map((n) => svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: later(n * HOUR), offers: [offer()] }, concurrent.db)));
  assert.equal(concurrent.rows.size, 1);
  assert.equal(only(concurrent.rows)[0].offerCount, 3);
  assert.equal(only(concurrent.rows)[0].suppressedUntil.getTime(), later(3 * HOUR).getTime() + 24 * HOUR, 'the latest offer wins; never earlier');
});

// ---- dismissal, selection, completion -------------------------------------------------------------------------------------------

test('dismissal: NOT_NOW suppresses 30 days, NOT_RELEVANT until the fingerprint changes; it is durable even with no prior offer', async () => {
  const notNow = fakeDb();
  assert.equal(await svc.recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: id(), reason: 'NOT_NOW', now: NOW }, notNow.db), true);
  let loaded = await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: later(29 * DAY) }, notNow.db);
  assert.ok(loaded.keys.has(reg.lifecycleKey(id())));
  loaded = await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: later(31 * DAY) }, notNow.db);
  assert.equal(loaded.keys.size, 0, 'Not now lapses after 30 days');

  const notRelevant = fakeDb();
  await svc.recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: id(), reason: 'NOT_RELEVANT', now: NOW, contextFingerprint: 'fp-1' }, notRelevant.db);
  const key = reg.lifecycleKey(id());
  const same = await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: later(365 * DAY), currentFingerprints: new Map([[key, 'fp-1']]) }, notRelevant.db);
  assert.ok(same.keys.has(key), 'no time limit');
  const changed = await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: later(DAY), currentFingerprints: new Map([[key, 'fp-2']]) }, notRelevant.db);
  assert.equal(changed.keys.size, 0, 'lapses when the material state changes');
});

test('completion suppresses the outcome durably unless it is repeatable; selection only marks an existing row', async () => {
  const { db, rows } = fakeDb();
  await svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: NOW, offers: [offer()] }, db);
  assert.equal(await svc.recordSuggestedActionSelected('u1', 'p1', id(), later(HOUR), db), true);
  assert.equal(only(rows)[0].selectedAt.getTime(), later(HOUR).getTime());
  await svc.recordSuggestedActionCompleted('u1', 'p1', id(), later(2 * HOUR), db);
  const loaded = await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: later(90 * DAY) }, db);
  assert.ok(loaded.keys.has(reg.lifecycleKey(id())), 'completed: suppressed long after the offer cooldown ended');
  const empty = fakeDb();
  await svc.recordSuggestedActionSelected('u1', 'p1', id(), NOW, empty.db);
  assert.equal(empty.rows.size, 0, 'selection never creates a row');
});

test('scoping: another user, another property and another entity are not suppressed', async () => {
  const { db } = fakeDb();
  await svc.recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: id(), reason: 'NOT_NOW', now: NOW }, db);
  const load = (userId, propertyId) => svc.loadSuppressedLifecycleKeys({ userId, propertyId, now: later(DAY) }, db);
  assert.equal((await load('u1', 'p1')).keys.size, 1);
  assert.equal((await load('u2', 'p1')).keys.size, 0);
  assert.equal((await load('u1', 'p2')).keys.size, 0);
  const entity = reg.lifecycleKey(id({ entityType: 'INVENTORY_ITEM', entityId: 'item-1' }));
  assert.ok(!(await load('u1', 'p1')).keys.has(entity));
});

// ---- failure behavior ------------------------------------------------------------------------------------------------------------

test('writes fail open (reported, never thrown) and a failed read applies no cooldown', async () => {
  const failing = fakeDb({ failWrites: true, failReads: true });
  assert.deepEqual(await svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: NOW, offers: [offer()] }, failing.db), { attempted: 1, ok: false });
  assert.equal(await svc.recordSuggestedActionDismissal({ userId: 'u1', propertyId: 'p1', identity: id(), reason: 'NOT_NOW', now: NOW }, failing.db), false);
  assert.equal(await svc.recordSuggestedActionSelected('u1', 'p1', id(), NOW, failing.db), false);
  assert.equal(await svc.recordSuggestedActionCompleted('u1', 'p1', id(), NOW, failing.db), false);
  assert.deepEqual(await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: NOW }, failing.db), { keys: new Set(), ok: false });
});

// ---- policy integration ----------------------------------------------------------------------------------------------------------

test('loaded lifecycle keys suppress offered profile chips in the exact-four policy but never the exact record', async () => {
  const { db } = fakeDb();
  await svc.recordSuggestedActionOffers({ userId: 'u1', propertyId: 'p1', now: NOW, offers: [offer({ operationId: 'INVENTORY_ITEM_CORRECT', outcomeKey: 'ADD_BRAND', entityType: 'INVENTORY_ITEM', entityId: 'item-1' })] }, db);
  const { keys } = await svc.loadSuppressedLifecycleKeys({ userId: 'u1', propertyId: 'p1', now: later(HOUR) }, db);
  const candidate = (slotClass) => ({
    source: 'MISSING_DETAIL', sourceOperationId: 'INVENTORY_LOOKUP', label: 'Add the brand', message: 'What brand?', operationId: 'INVENTORY_ITEM_CORRECT',
    interactionType: 'MUTATE_RECORD', outcomeKey: 'ADD_BRAND', slotClass, tier: 'RELATED', requiredFacts: [], reasonCodes: [],
    entityContext: { propertyId: 'p1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: 'v1' },
    signals: { exactEntityMatch: false, currentResultOwnership: false, activeGoalMatch: false, materiality: 1, sourceConfidence: 0.5 },
    traits: { recovery: false, promotional: false, continuesPending: false },
  });
  const eligibility = {
    mode: 'NORMAL', sourcePropertyId: 'p1', operationAvailability: new Map([['INVENTORY_ITEM_CORRECT', null]]), operationRequiresProperty: () => true,
    operationTargetEntityType: () => 'INVENTORY_ITEM', entities: new Map([['INVENTORY_ITEM:item-1', { exists: true, propertyId: 'p1', currentContextVersion: 'v1' }]]),
    validatedEntityTypes: new Set(['INVENTORY_ITEM']), pendingInteractionActive: false, completedSemanticKeyHashes: new Set(), askedMessageKeys: new Set(),
    messageKey: (m) => m.toLowerCase(), currentOutcomeKeyHashes: new Set(),
  };
  const run = (slotClass) => selectExactFourSuggestedNextActions({
    nominations: new Map([['grant.test', [candidate(slotClass)]]]), eligibility, actionableCompleteness: 0.5, cooldownLifecycleKeys: keys,
    slotGrants: { 'grant.test': { allowed: new Set(['PROFILE_GAP', 'EXACT_RECORD']), fallback: 'PROFILE_GAP' } },
  });
  assert.equal(run('PROFILE_GAP').selected.length, 0, 'cooled profile chip is suppressed');
  assert.equal(run('EXACT_RECORD').selected.length, 1, 'the exact record in view is never cooled');
});
