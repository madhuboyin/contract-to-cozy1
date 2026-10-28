const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const registry = require('../../src/services/ask/governance/askNotificationContinuationRegistry.ts');
const inbox = require('../../src/services/ask/askNotificationInbox.service.ts');
const settings = require('../../src/services/ask/askNotificationSettings.service.ts');
const { resolveNotificationPolicy } = require('../../src/services/notificationPreference.service.ts');

const NOW = new Date('2026-10-20T12:00:00.000Z');
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const note = (extra = {}) => ({ id: 'n1', userId: 'u1', type: 'CLAIM_SUBMITTED', entityType: null, entityId: null, actionUrl: null, metadata: null, ...extra });
const resolve = (n) => registry.continuationRuleFor(n).resolve(n);

function installAccess(propertyIds) {
  prisma.householdMember = { findUnique: async ({ where }) => (propertyIds.includes(where.propertyId_userId.propertyId) ? { role: 'OWNER', isPrimaryOwner: true } : null) };
  prisma.property = { ...(prisma.property ?? {}), findFirst: async () => null, findMany: async () => propertyIds.map((id) => ({ id, name: `Home ${id}`, address: '1 Main', city: 'Austin' })) };
}

test('registry is valid and every producer type the code writes has a registered continuation', () => {
  assert.deepEqual(registry.validateAskNotificationContinuationRegistry(), []);
  const root = path.resolve(__dirname, '../../..');
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'graphify-out' || entry.name === 'dist' || entry.name === 'tests' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.ts')) {
        const source = fs.readFileSync(full, 'utf8');
        for (const call of source.matchAll(/[nN]otificationService\.create\(\s*\{([\s\S]{0,900}?)\}\s*\)/g)) {
          const literal = call[1].match(/\btype:\s*'([A-Z_]+)'/);
          if (literal) found.add(literal[1]);
        }
      }
    }
  };
  walk(path.join(root, 'backend/src'));
  walk(path.join(root, 'workers/src'));
  assert.ok(found.size >= 10, `expected to find the producers' literal types, found ${[...found]}`);
  const unregistered = [...found].filter((type) => !(type in registry.ASK_NOTIFICATION_KNOWN_TYPES));
  assert.deepEqual(unregistered, [], 'a new notification producer must register how it continues');
  for (const [type, ruleId] of Object.entries(registry.ASK_NOTIFICATION_KNOWN_TYPES)) {
    if (ruleId === 'no-destination' || ruleId === 'stored-dashboard-link') continue;
    assert.ok(registry.ASK_NOTIFICATION_CONTINUATION_RULES.some((rule) => rule.id === ruleId), `${type} -> ${ruleId}`);
  }
});

test('stored dashboard links are accepted only as same-site paths', () => {
  assert.equal(registry.safeDashboardPath('/dashboard/maintenance?x=1'), '/dashboard/maintenance?x=1');
  for (const bad of ['https://evil.test/dashboard', '//evil.test/dashboard', '/dashboard/../admin', '/other', 'javascript:alert(1)', '/dashboard\\evil', '', null]) assert.equal(registry.safeDashboardPath(bad), null, String(bad));
});

test('a claim notification opens the claim\'s current Work item; a removed claim is reported deleted', async () => {
  prisma.claim = { findFirst: async ({ where }) => (where.id === 'c1' ? { id: 'c1', propertyId: 'p1' } : null) };
  const found = await resolve(note({ entityType: 'CLAIM', entityId: 'c1' }));
  assert.deepEqual(found, { state: 'FOUND', destination: { kind: 'WORK', workKey: 'claim:c1' }, propertyId: 'p1' });
  assert.equal((await resolve(note({ entityType: 'CLAIM', entityId: 'gone' }))).state, 'MISSING');
});

test('each mapped entity opens its canonical Ask destination from live records', async () => {
  prisma.incident = { findFirst: async ({ where }) => (where.id === 'i1' && where.isSuppressed === false ? { id: 'i1', propertyId: 'p1' } : null) };
  prisma.seasonalChecklist = { findFirst: async () => ({ id: 's1', propertyId: 'p1' }) };
  prisma.homeCapitalTimelineAnalysis = { findFirst: async () => null };
  prisma.savingsBenefitAction = { findFirst: async () => ({ id: 'a1', propertyId: 'p1', state: 'STARTED', followUpAt: new Date(Date.now() + 86_400_000) }) };
  prisma.renovationRequirement = { findFirst: async () => ({ propertyId: 'p1', renovationCase: { id: 'r1', executionProject: { id: 'pr1' } } }) };
  prisma.askExecution = { findFirst: async ({ where }) => (where.userId === 'u1' && where.id === 'e1' ? { id: 'e1', sessionId: 's9', propertyId: 'p1' } : null) };
  assert.deepEqual((await resolve(note({ entityType: 'Incident', entityId: 'i1' }))).destination, { kind: 'WORK', workKey: 'incident:i1' });
  assert.deepEqual((await resolve(note({ entityType: 'SEASONAL_CHECKLIST', entityId: 's1' }))).destination, { kind: 'SAVED', artifactKey: 'seasonal:s1' });
  assert.equal((await resolve(note({ entityType: 'HOME_CAPITAL_TIMELINE', entityId: 'x', metadata: { propertyId: 'p1' } }))).destination.kind, 'QUESTION');
  assert.deepEqual((await resolve(note({ entityType: 'SavingsBenefitAction', entityId: 'a1' }))).destination, { kind: 'WORK', workKey: 'followUp:savings:a1' });
  assert.deepEqual((await resolve(note({ entityType: 'RenovationRequirement', entityId: 'q1' }))).destination, { kind: 'WORK', workKey: 'project:pr1' });
  assert.deepEqual((await resolve(note({ type: 'ASK_CAPTURE_CANDIDATE_READY', entityType: 'ASK_EXECUTION', entityId: 'e1' }))).destination, { kind: 'CONVERSATION', sessionId: 's9', executionId: 'e1' });
  assert.equal((await resolve(note({ entityType: 'ASK_EXECUTION', entityId: 'e1', userId: 'someone-else' }))).state, 'MISSING', 'another person\'s execution is never opened');
  assert.equal((await resolve(note({ entityType: 'Incident', entityId: 'hidden' }))).state, 'MISSING', 'a suppressed incident counts as gone');
});

test('maintenance tasks open their home work item when one exists, otherwise the status question; bookings open only as repairs', async () => {
  prisma.propertyMaintenanceTask = { findFirst: async () => ({ id: 't1', propertyId: 'p1' }) };
  prisma.operationalWorkExecution = { findFirst: async () => ({ workItemId: 'w1' }) };
  assert.deepEqual((await resolve(note({ entityType: 'PROPERTY_MAINTENANCE_TASK', entityId: 't1' }))).destination, { kind: 'WORK', workKey: 'workItem:w1' });
  prisma.operationalWorkExecution = { findFirst: async () => null };
  assert.equal((await resolve(note({ entityType: 'PROPERTY_MAINTENANCE_TASK', entityId: 't1' }))).destination.kind, 'QUESTION');
  let repair = true;
  prisma.booking = { findFirst: async (args) => (args.where.AND ? (repair ? { id: 'b1' } : null) : { id: 'b1', propertyId: 'p1' }) };
  assert.deepEqual((await resolve(note({ entityType: 'BOOKING', entityId: 'b1' }))).destination, { kind: 'WORK', workKey: 'repair:b1' });
  repair = false;
  const nonRepair = await resolve(note({ entityType: 'BOOKING', entityId: 'b1' }));
  assert.equal(nonRepair.state, 'NO_TARGET');
  assert.match(nonRepair.reason, /Ask cannot manage bookings/);
});

test('account, provider and unmapped notifications recover honestly; an unsafe stored link is never offered', async () => {
  assert.deepEqual((await resolve(note({ type: 'PASSWORD_RESET_REQUESTED', actionUrl: 'https://evil.test/reset?token=abc' }))).destination, { kind: 'LEGACY_LINK', path: '/dashboard/profile' });
  assert.equal((await resolve(note({ type: 'PROVIDER_CREDENTIAL_SUBMITTED' }))).state, 'NO_TARGET');
  const legacy = await resolve(note({ type: 'NEIGHBORHOOD_CHANGE_DETECTED', entityType: 'PROPERTY', actionUrl: '/dashboard/neighborhood?x=1' }));
  assert.deepEqual(legacy.destination, { kind: 'LEGACY_LINK', path: '/dashboard/neighborhood?x=1' });
  const unsafe = await resolve(note({ type: 'NEIGHBORHOOD_CHANGE_DETECTED', entityType: 'PROPERTY', actionUrl: 'https://evil.test/x' }));
  assert.equal(unsafe.state, 'NO_TARGET');
  assert.equal(registry.continuationRuleFor(note({ type: 'HOME_ACTION_PROACTIVE', entityType: 'HOME_ACTION', entityId: 'h1' })).kind, 'QUESTION');
});

test('opening reauthorizes the home first: lost access, removed targets and nothing-to-open each get their own outcome, and only a real open marks it read', async () => {
  const calls = { read: [], outcome: [] };
  prisma.notification = {
    findFirst: async ({ where }) => (where.id === 'n1' && where.userId === 'u1' ? { id: 'n1', type: 'CLAIM_SUBMITTED', entityType: 'CLAIM', entityId: 'c1', actionUrl: null, metadata: null } : null),
    updateMany: async (args) => { calls.read.push(args); return { count: 1 }; },
  };
  prisma.notificationOutcome = { upsert: async (args) => { calls.outcome.push(args); return {}; } };
  prisma.claim = { findFirst: async () => ({ id: 'c1', propertyId: 'p1' }) };
  installAccess(['p1']);
  const ok = await inbox.openAskNotification('u1', 'n1', 'HOMEOWNER');
  assert.equal(ok.outcome, 'AVAILABLE');
  assert.deepEqual(ok.destination, { kind: 'WORK', workKey: 'claim:c1' });
  assert.equal(ok.legacy, false);
  assert.equal(calls.read.length, 1);
  assert.equal(calls.outcome[0].create.type, 'OPENED');
  installAccess([]);
  calls.read.length = 0;
  const lost = await inbox.openAskNotification('u1', 'n1', 'HOMEOWNER');
  assert.equal(lost.outcome, 'ACCESS_LOST');
  assert.equal(lost.destination, null);
  assert.equal(calls.read.length, 0, 'an item that did not open is not marked read');
  installAccess(['p1']);
  prisma.claim = { findFirst: async () => null };
  assert.equal((await inbox.openAskNotification('u1', 'n1', 'HOMEOWNER')).outcome, 'DELETED');
  await assert.rejects(() => inbox.openAskNotification('u1', 'someone-elses', 'HOMEOWNER'), /not found/);
});

test('the inbox lists a person\'s own items with home, category, why, source time, stated expiry and where it leads', async () => {
  const calls = [];
  const row = (id, day, extra = {}) => ({ id, type: 'CLAIM_SUBMITTED', title: `Title ${id}`, message: 'Body', entityType: 'CLAIM', entityId: 'c1', actionUrl: null, outcomes: [], isRead: false, dismissedAt: null, createdAt: at(day), metadata: { propertyId: 'p1', notificationPolicy: { category: 'WORKFLOW', urgency: 'MATERIAL' }, expiresAt: '2026-10-19T00:00:00.000Z' }, ...extra });
  prisma.notification = { findMany: async (args) => { calls.push(args); return [row('a', 5), row('b', 4, { metadata: { propertyId: 'gone-home' } }), row('c', 3, { metadata: null, type: 'SEASONAL_CHECKLIST_READY', entityType: 'SEASONAL_CHECKLIST' })]; }, count: async () => 3 };
  prisma.notificationPreference = { findMany: async () => [{ category: 'WORKFLOW', cadence: 'MUTED', enabled: false, snoozedUntil: null }] };
  installAccess(['p1']);
  const page = await inbox.listAskNotifications('u1', { limit: 2, unreadOnly: true, category: 'WORKFLOW', propertyId: 'p1' }, 'HOMEOWNER', NOW);
  assert.equal(page.items.length, 2);
  assert.equal(page.truncated, true);
  const [first, second] = page.items;
  assert.equal(first.propertyLabel, 'Home p1');
  assert.equal(first.propertyAccess, 'ACCESSIBLE');
  assert.equal(first.categoryLabel, 'Your requests and claims');
  assert.match(first.whyItAppeared, /request, claim or booking/);
  assert.equal(first.expiresAt, '2026-10-19T00:00:00.000Z');
  assert.equal(first.expired, true);
  assert.equal(first.continuationKind, 'WORK');
  assert.equal(first.deliveryPaused, 'MUTED');
  assert.equal(second.propertyAccess, 'LOST');
  assert.equal(second.propertyLabel, null, 'a home the person lost is not named');
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"userId":"u1"/);
  assert.match(where, /"dismissedAt":null/);
  assert.match(where, /"isRead":false/);
  assert.match(where, /"path":\["notificationPolicy","category"\],"equals":"WORKFLOW"/);
  assert.match(where, /"path":\["propertyId"\],"equals":"p1"/);
  const cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString('utf8'));
  assert.equal(cursor.i, 'b');
  await inbox.listAskNotifications('u1', { cursor: page.nextCursor, limit: 2, unreadOnly: true, category: 'WORKFLOW', propertyId: 'p1' }, 'HOMEOWNER', NOW);
  assert.match(JSON.stringify(calls[1].where), /"createdAt":\{"lt"/);
  await assert.rejects(() => inbox.listAskNotifications('u1', { cursor: page.nextCursor, view: 'DISMISSED' }, 'HOMEOWNER', NOW), /cursor is not valid/);
  await assert.rejects(() => inbox.listAskNotifications('u1', { category: 'NOPE' }, 'HOMEOWNER', NOW), /category is not valid/);
  const dismissed = await inbox.listAskNotifications('u1', { view: 'DISMISSED' }, 'HOMEOWNER', NOW);
  assert.match(JSON.stringify(calls.at(-1).where), /"dismissedAt":\{"not":null\}/);
  assert.equal(dismissed.view, 'DISMISSED');
});

test('dismiss and restore touch only the person\'s own notification and only its dismissed flag', async () => {
  const calls = [];
  prisma.notification = { updateMany: async (args) => { calls.push(args); return { count: args.where.userId === 'u1' ? 1 : 0 }; }, update: () => { throw new Error('nothing else is written'); }, delete: () => { throw new Error('never deleted'); } };
  await inbox.setAskNotificationDismissed('u1', 'n1', true, 'HOMEOWNER');
  assert.ok(calls[0].data.dismissedAt instanceof Date);
  assert.deepEqual(Object.keys(calls[0].data), ['dismissedAt']);
  await inbox.setAskNotificationDismissed('u1', 'n1', false, 'HOMEOWNER');
  assert.equal(calls[1].data.dismissedAt, null);
  await assert.rejects(() => inbox.setAskNotificationDismissed('other', 'n1', true, 'HOMEOWNER'), /not found/);
  await inbox.setAskNotificationRead('u1', 'n1', false, 'HOMEOWNER');
  assert.deepEqual(calls[3].data, { isRead: false, readAt: null });
});

function installPreferences(initial = []) {
  const rows = [...initial];
  const upserts = [];
  prisma.notificationPreference = {
    findMany: async () => rows,
    findFirst: async ({ where }) => rows.find((r) => r.category === where.category) ?? null,
    upsert: async (args) => { upserts.push(args); const data = { ...(args.create ?? {}), ...(args.update ?? {}) }; const i = rows.findIndex((r) => r.category === args.create.category); const merged = { scopeKey: 'GLOBAL', channel: 'EMAIL', category: args.create.category, ...(i >= 0 ? rows[i] : {}), ...data }; if (i >= 0) rows[i] = merged; else rows.push(merged); return merged; },
  };
  const consents = [];
  prisma.notificationChannelConsent = {
    findMany: async () => consents,
    findUnique: async ({ where }) => consents.find((c) => c.category === where.userId_category_channel.category) ?? null,
    upsert: async ({ create }) => { consents.push({ ...create, consentedAt: new Date(), revokedAt: null }); return create; },
    update: async ({ data }) => { consents.forEach((c) => Object.assign(c, data)); return {}; },
  };
  return { rows, upserts, consents };
}

test('settings show every category with its email state, consent disclosure, and that safety cannot be paused', async () => {
  installPreferences([{ category: 'MAINTENANCE', cadence: 'MUTED', enabled: false, snoozedUntil: null }, { category: 'RECALL', cadence: 'IMMEDIATE', enabled: true, snoozedUntil: new Date(NOW.getTime() + 86_400_000) }, { category: 'ALL', cadence: 'WEEKLY_BRIEF', enabled: true, quietStart: '22:00', quietEnd: '07:00', timezone: 'America/Chicago', snoozedUntil: null }]);
  const result = await settings.getAskNotificationSettings('u1', 'HOMEOWNER', NOW);
  const by = Object.fromEntries(result.categories.map((c) => [c.category, c]));
  assert.equal(by.MAINTENANCE.email.mode, 'MUTED');
  assert.equal(by.RECALL.email.mode, 'SNOOZED');
  assert.equal(by.GENERAL.email.mode, 'ON');
  assert.equal(by.SAFETY.canPause, false);
  assert.equal(by.ACTIVE_DAMAGE.canPause, false);
  assert.equal(by.REFINANCE.consent.required, true);
  assert.match(by.REFINANCE.consent.disclosure, /refinance rates/);
  assert.deepEqual(result.quietHours, { start: '22:00', end: '07:00', timezone: 'America/Chicago' });
  assert.equal(result.channels.find((c) => c.channel === 'IN_APP').configurable, false);
  assert.deepEqual(result.unavailableChannels.map((c) => c.channel), ['PUSH', 'SMS', 'WHATSAPP']);
  assert.ok(result.capabilitySettings.length >= 4);
});

test('muting, snoozing and turning on write only the person\'s own email preference, and the rules are enforced on the server', async () => {
  const state = installPreferences();
  const muted = await settings.updateAskNotificationCategory('u1', 'MAINTENANCE', { mode: 'MUTED' }, 'HOMEOWNER', NOW);
  assert.equal(muted.email.mode, 'MUTED');
  assert.equal(state.upserts[0].create.cadence, 'MUTED');
  assert.equal(state.upserts[0].create.enabled, false);
  assert.equal(state.upserts[0].create.channel, 'EMAIL');
  const until = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
  const snoozed = await settings.updateAskNotificationCategory('u1', 'MAINTENANCE', { mode: 'SNOOZED', snoozedUntil: until }, 'HOMEOWNER', NOW);
  assert.equal(snoozed.email.mode, 'SNOOZED');
  assert.equal(snoozed.email.snoozedUntil, until);
  const on = await settings.updateAskNotificationCategory('u1', 'MAINTENANCE', { mode: 'ON' }, 'HOMEOWNER', NOW);
  assert.equal(on.email.mode, 'ON');
  assert.equal(state.upserts.at(-1).update.snoozedUntil, null, 'turning on clears a snooze');
  await assert.rejects(() => settings.updateAskNotificationCategory('u1', 'SAFETY', { mode: 'MUTED' }, 'HOMEOWNER', NOW), (error) => error.code === 'ASK_NOTIFICATION_NOT_ALLOWED');
  await assert.rejects(() => settings.updateAskNotificationCategory('u1', 'ACTIVE_DAMAGE', { mode: 'SNOOZED', snoozedUntil: until }, 'HOMEOWNER', NOW), (error) => error.code === 'ASK_NOTIFICATION_NOT_ALLOWED');
  await assert.rejects(() => settings.updateAskNotificationCategory('u1', 'MAINTENANCE', { mode: 'SNOOZED', snoozedUntil: new Date(NOW.getTime() - 1000).toISOString() }, 'HOMEOWNER', NOW), /future/);
  await assert.rejects(() => settings.updateAskNotificationCategory('u1', 'MAINTENANCE', { mode: 'SNOOZED', snoozedUntil: new Date(NOW.getTime() + 200 * 86_400_000).toISOString() }, 'HOMEOWNER', NOW), /at most 90 days/);
  await assert.rejects(() => settings.updateAskNotificationCategory('u1', 'NOPE', { mode: 'ON' }, 'HOMEOWNER', NOW), /not valid/);
});

test('financial email needs its own consent: turning it on is refused until granted, and revoking consent turns it off', async () => {
  const state = installPreferences();
  await assert.rejects(() => settings.updateAskNotificationCategory('u1', 'REFINANCE', { mode: 'ON' }, 'HOMEOWNER', NOW), (error) => error.code === 'ASK_NOTIFICATION_CONSENT_REQUIRED');
  const granted = await settings.setAskNotificationConsent('u1', 'REFINANCE', true, 'HOMEOWNER');
  assert.deepEqual([granted.granted, granted.version], [true, 'notification-channel-consent-v1']);
  assert.equal((await settings.updateAskNotificationCategory('u1', 'REFINANCE', { mode: 'ON' }, 'HOMEOWNER', NOW)).email.mode, 'ON');
  const revoked = await settings.setAskNotificationConsent('u1', 'REFINANCE', false, 'HOMEOWNER');
  assert.equal(revoked.granted, false);
  assert.equal(state.rows.find((r) => r.category === 'REFINANCE').cadence, 'MUTED');
  await assert.rejects(() => settings.setAskNotificationConsent('u1', 'MAINTENANCE', true, 'HOMEOWNER'), /does not use a separate consent/);
});

test('quiet hours need both times in HH:MM and a real timezone', async () => {
  const state = installPreferences();
  assert.deepEqual(await settings.updateAskNotificationQuietHours('u1', { start: '22:00', end: '07:00', timezone: 'America/Chicago' }, 'HOMEOWNER'), { start: '22:00', end: '07:00', timezone: 'America/Chicago' });
  assert.equal(state.upserts[0].create.category, 'ALL');
  await assert.rejects(() => settings.updateAskNotificationQuietHours('u1', { start: '22:00', end: null, timezone: 'UTC' }, 'HOMEOWNER'), /both a start and an end/);
  await assert.rejects(() => settings.updateAskNotificationQuietHours('u1', { start: '25:00', end: '07:00', timezone: 'UTC' }, 'HOMEOWNER'), /both a start and an end/);
  await assert.rejects(() => settings.updateAskNotificationQuietHours('u1', { start: '22:00', end: '07:00', timezone: 'Mars/Base' }, 'HOMEOWNER'), /timezone is not valid/);
});

test('delivery policy honors a snooze on the server: email pauses until it lapses, and a critical in-app notice is never snoozed', async () => {
  const future = new Date(NOW.getTime() + 86_400_000);
  const past = new Date(NOW.getTime() - 86_400_000);
  const policyFor = async (snoozedUntil, extra = {}) => {
    prisma.notificationPreference = { findMany: async () => [{ scopeKey: 'GLOBAL', category: 'MAINTENANCE', channel: 'EMAIL', enabled: true, cadence: 'IMMEDIATE', quietStart: null, quietEnd: null, timezone: 'UTC', snoozedUntil }] };
    return resolveNotificationPolicy({ userId: 'u1', type: 'MAINTENANCE_REMINDER', category: 'MAINTENANCE', legacyEmailEnabled: true, now: NOW, ...extra });
  };
  const email = (policy) => policy.channels.find((c) => c.channel === 'EMAIL');
  assert.equal(email(await policyFor(future)).enabled, false, 'snoozed');
  assert.equal(email(await policyFor(past)).enabled, true, 'a lapsed snooze resumes by itself');
  assert.equal(email(await policyFor(null)).enabled, true);
  const critical = await policyFor(future, { urgency: 'CRITICAL' });
  assert.equal(critical.channels.find((c) => c.channel === 'IN_APP').enabled, true);
});
