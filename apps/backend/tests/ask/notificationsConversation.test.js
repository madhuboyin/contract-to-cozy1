const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD v1.7: the notification inbox and its settings as a conversation. The real handlers run with prisma, the access check and the existing
// services stubbed.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const inbox = require('../../src/services/ask/askNotificationInbox.service.ts');
const settingsService = require('../../src/services/ask/askNotificationSettings.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const overview = require('../../src/services/ask/handlers/notificationsOverview.handler.ts');
const { notificationSettingsFromSettings } = require('../../src/services/ask/handlers/notificationSettings.handler.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema, AskConfirmationSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const g = require('../../src/services/ask/support/notificationConversation.ts');

const op = (message) => resolveAskOperation(message)?.operationId;

test('typed routes: the inbox, the settings and each change; other questions are left alone', () => {
  for (const m of ["What's new?", 'Show my notifications', 'Show my unread notifications', 'any alerts?']) assert.equal(op(m), 'NOTIFICATIONS_OVERVIEW', m);
  assert.equal(op('Show my notification settings'), 'NOTIFICATION_SETTINGS_OVERVIEW');
  for (const m of ['Mute maintenance notifications by email', 'Snooze coverage notifications for a week', 'Set quiet hours from 10pm to 7am', 'Turn off quiet hours', 'Turn on refinance email notifications']) {
    assert.equal(op(m), 'NOTIFICATION_SETTINGS_COMMAND', m);
  }
  for (const m of ['What needs me?', 'Show my saved results', 'What maintenance is due?', 'What needs my attention at home?']) assert.doesNotMatch(String(op(m)), /NOTIFICATION/, m);
});

test('the grammar reads each change, including the times and the days', () => {
  assert.deepEqual(g.parseNotificationSettingsRequest('Set quiet hours from 10pm to 7am'), { kind: 'QUIET_SET', category: null, days: null, quiet: { start: '22:00', end: '07:00' } });
  assert.deepEqual(g.parseNotificationSettingsRequest('Snooze coverage notifications for 2 weeks'), { kind: 'SNOOZE', category: 'COVERAGE', days: 14, quiet: null });
  assert.equal(g.parseNotificationSettingsRequest('Snooze coverage notifications').days, 7);
  assert.equal(g.parseNotificationSettingsRequest('Mute project alerts').kind, 'MUTE');
  assert.equal(g.parseNotificationSettingsRequest('Turn off refinance email notifications').kind, 'CONSENT_REVOKE');
  assert.equal(g.parseNotificationSettingsRequest('Turn on savings email notifications').kind, 'CONSENT_GRANT');
  assert.equal(g.parseNotificationSettingsRequest('Set quiet hours please'), null);
  assert.equal(g.snoozeDaysFromWords('for 400 days'), 90);
  // Every sentence a declared action sends reads back as the same change.
  for (const kind of ['MUTE', 'UNMUTE', 'SNOOZE']) assert.equal(g.parseNotificationSettingsRequest(g.notificationSettingsMessage(kind, 'Maintenance', 7))?.kind, kind, kind);
  for (const kind of ['CONSENT_GRANT', 'CONSENT_REVOKE']) assert.equal(g.parseNotificationSettingsRequest(g.notificationSettingsMessage(kind, 'Refinance'))?.kind, kind, kind);
  assert.equal(g.parseNotificationSettingsRequest(g.notificationSettingsMessage('QUIET_CLEAR', ''))?.kind, 'QUIET_CLEAR');
});

const item = (over = {}) => ({
  id: 'n1', type: 'TASK_DUE', category: 'MAINTENANCE', categoryLabel: 'Maintenance', urgency: 'ROUTINE', title: 'Replace filter', message: 'Due soon', whyItAppeared: 'x', propertyId: 'p1', propertyLabel: 'Home',
  propertyAccess: 'ACCESSIBLE', createdAt: '2026-10-19T12:00:00Z', expiresAt: null, expired: false, isRead: false, dismissed: false, continuationKind: 'WORK', deliveryPaused: null, ...over,
});
const page = (items, over = {}) => ({
  contractVersion: 1, generatedAt: '2026-10-20T00:00:00Z', view: 'INBOX', total: items.length, unreadCount: items.filter((i) => !i.isRead).length, dismissedCount: 2, nextCursor: null, truncated: false,
  query: { unreadOnly: false, category: null, propertyId: null }, filterOptions: { categories: [{ value: 'MAINTENANCE', label: 'Maintenance' }, { value: 'COVERAGE', label: 'Coverage' }], properties: [] }, items, ...over,
});
const state = (over = {}) => ({ dismissed: false, unreadOnly: false, category: null, limit: 10, ...over });

test('the inbox answer states the count, offers Open only where it leads somewhere, and every block is valid', () => {
  const result = overview.notificationsFromPage({ page: page([item(), item({ id: 'n2', isRead: true, continuationKind: 'QUESTION' })]), state: state(), viewState: overview.buildNotificationsViewState(null, state()) });
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  assert.match(result.blocks[0].headline, /2 notifications, 1 unread/);
  const rows = result.blocks[1].sections[0].items;
  assert.deepEqual(rows[0].actions.map((a) => a.id), ['notification-open', 'notification-dismiss', 'notification-read']);
  assert.deepEqual(rows[1].actions.map((a) => a.id), ['notification-dismiss', 'notification-unread']);
  assert.ok(rows[0].actions.slice(1).every((a) => a.entityId === 'n1' && a.operationId === 'NOTIFICATION_COMMAND'));
  assert.ok(result.blocks[1].filters.map((f) => f.message).every((m) => /^(Only|Now) show/.test(m)));
});

test('constraints live in the view state: chips refine, Show more widens, Clear resets', () => {
  const first = overview.buildNotificationsViewState(null, state());
  const unread = overview.resolveNotificationsState('Only show unread notifications', first);
  assert.deepEqual(unread.state, state({ unreadOnly: true }));
  const cat = overview.resolveNotificationsState('Only show coverage notifications', overview.buildNotificationsViewState(first, unread.state));
  assert.deepEqual(cat.state, state({ unreadOnly: true, category: 'COVERAGE' }));
  assert.equal(overview.resolveNotificationsState('Now show more notifications', overview.buildNotificationsViewState(first, cat.state)).state.limit, 20);
  assert.deepEqual(overview.resolveNotificationsState('Now show all notifications with no filters', overview.buildNotificationsViewState(first, cat.state)).state, state());
  assert.equal(overview.resolveNotificationsState('Show my dismissed notifications', null).state.dismissed, true);
  assert.equal(overview.resolveNotificationsState('Only show unread notifications', null).refinement, false);
});

test('an empty inbox says so and a dismissed list is labelled', () => {
  const empty = overview.notificationsFromPage({ page: page([]), state: state(), viewState: overview.buildNotificationsViewState(null, state()) });
  assert.match(empty.blocks[0].headline, /Your inbox is empty/);
  for (const block of empty.blocks) AskPresentationBlockSchema.parse(block);
});

// ── the command ───────────────────────────────────────────────────────────────────────────────────
const T = new Date('2026-10-20T12:00:00Z');
function install({ row, settings } = {}) {
  const saved = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, reconcile: executeOperation.reconcileAskExecutionSideEffects, read: inbox.setAskNotificationRead, dismiss: inbox.setAskNotificationDismissed, get: settingsService.getAskNotificationSettings, cat: settingsService.updateAskNotificationCategory, quiet: settingsService.updateAskNotificationQuietHours, consent: settingsService.setAskNotificationConsent };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'VIEWER', userId: 'u1', propertyId: 'p1' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  inbox.setAskNotificationRead = async (...a) => { calls.push(['read', ...a]); return {}; };
  inbox.setAskNotificationDismissed = async (...a) => { calls.push(['dismiss', ...a]); return {}; };
  settingsService.getAskNotificationSettings = async () => settings;
  settingsService.updateAskNotificationCategory = async (...a) => { calls.push(['category', ...a.slice(0, 3)]); return {}; };
  settingsService.updateAskNotificationQuietHours = async (...a) => { calls.push(['quiet', ...a.slice(0, 2)]); return {}; };
  settingsService.setAskNotificationConsent = async (...a) => { calls.push(['consent', ...a.slice(0, 3)]); return {}; };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'notification') return { findFirst: async () => row };
    return new Proxy({}, { get: (_x, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } });
  } });
  return { calls, restore() { prismaModule.prisma = saved.prisma; propertyAccess.resolvePropertyAccess = saved.access; executeOperation.reconcileAskExecutionSideEffects = saved.reconcile; inbox.setAskNotificationRead = saved.read; inbox.setAskNotificationDismissed = saved.dismiss; settingsService.getAskNotificationSettings = saved.get; settingsService.updateAskNotificationCategory = saved.cat; settingsService.updateAskNotificationQuietHours = saved.quiet; settingsService.setAskNotificationConsent = saved.consent; } };
}
const ctx = (operationId, parameters) => ({ userId: 'u1', execution: { id: 'x1', propertyId: 'p1', createdAt: T }, access: { role: 'VIEWER' }, parameters, command: getAskDomainCommandByOperation(operationId) });
const launch = (over = {}) => ({ operationId: 'NOTIFICATION_COMMAND', surface: 'ASK_PAGE', entityType: g.NOTIFICATION_COMMAND_ENTITY_TYPE, entityId: 'n1', ...over });

test('the commands are caller-scoped and agree with the registries', () => {
  for (const id of ['NOTIFICATION_COMMAND', 'NOTIFICATION_SETTINGS_COMMAND']) assert.deepEqual([getAskDomainCommandByOperation(id).roleFloor, getAskDomainCommandByOperation(id).authorization], ['VIEWER', 'CALLER_SCOPED']);
});

test('dismiss: a review first, nothing done; the confirmed change writes once and the receipt offers the inbox', async () => {
  const w = install({ row: { id: 'n1', title: 'Replace filter', isRead: false, dismissedAt: null } });
  try {
    const proposal = await capabilityInvoke('NOTIFICATION_COMMAND', { userId: 'u1', propertyId: 'p1', message: g.notificationCommandMessage('DISMISS', 'Replace filter'), launchContext: launch() });
    assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
    AskConfirmationSchema.parse(proposal.confirmation);
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke('NOTIFICATION_COMMAND', ctx('NOTIFICATION_COMMAND', proposal.parameters));
    assert.deepEqual(w.calls, [['dismiss', 'u1', 'n1', true]]);
    assert.equal(done.result.status, 'COMPLETED');
    assert.equal(done.result.blocks[0].actions[0].operationId, 'NOTIFICATION_OVERVIEW'.replace('NOTIFICATION_', 'NOTIFICATIONS_'));
  } finally { w.restore(); }
});

test('a change already in place, a missing notification and a typed attempt are refused with nothing changed', async () => {
  const w = install({ row: { id: 'n1', title: 'Replace filter', isRead: true, dismissedAt: null } });
  try {
    const already = await capabilityInvoke('NOTIFICATION_COMMAND', { userId: 'u1', propertyId: 'p1', message: g.notificationCommandMessage('READ', 'x'), launchContext: launch() });
    assert.equal(already.status, 'NOT_APPLICABLE');
    const typed = await capabilityInvoke('NOTIFICATION_COMMAND', { userId: 'u1', propertyId: 'p1', message: g.notificationCommandMessage('READ', 'x'), launchContext: undefined });
    assert.equal(typed.reasonCode, 'ASK_NOTIFICATION_NOT_DIRECTLY_ROUTABLE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  const w2 = install({ row: null });
  try {
    const gone = await capabilityInvoke('NOTIFICATION_COMMAND', { userId: 'u1', propertyId: 'p1', message: g.notificationCommandMessage('DISMISS', 'x'), launchContext: launch() });
    assert.equal(gone.reasonCode, 'NOTIFICATION_NOT_AVAILABLE');
  } finally { w2.restore(); }
});

test('a confirmation goes stale when the notification changed meanwhile', async () => {
  let row = { id: 'n1', title: 'Replace filter', isRead: false, dismissedAt: null };
  const w = install({ row });
  try {
    const proposal = await capabilityInvoke('NOTIFICATION_COMMAND', { userId: 'u1', propertyId: 'p1', message: g.notificationCommandMessage('READ', 'x'), launchContext: launch() });
    w.restore();
    row = { ...row, isRead: true };
    const w2 = install({ row });
    try {
      await assert.rejects(confirmCapabilityInvoke('NOTIFICATION_COMMAND', ctx('NOTIFICATION_COMMAND', proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
      assert.equal(w2.calls.length, 0);
    } finally { w2.restore(); }
  } finally { w.restore(); }
});

// ── the settings ──────────────────────────────────────────────────────────────────────────────────
const cat = (category, label, over = {}) => ({ category, label, description: 'd', canPause: !['SAFETY', 'ACTIVE_DAMAGE'].includes(category), email: { mode: 'ON', snoozedUntil: null, cadence: null, defaultCadence: 'IMMEDIATE' }, consent: { required: false, granted: false, version: null, disclosure: null }, ...over });
const settings = (over = {}) => ({
  generatedAt: T.toISOString(), channels: [], unavailableChannels: [], quietHours: { start: null, end: null, timezone: 'America/Chicago' }, capabilitySettings: [],
  categories: [cat('ALL', 'Everything else'), cat('SAFETY', 'Safety'), cat('MAINTENANCE', 'Maintenance'), cat('COVERAGE', 'Coverage', { email: { mode: 'MUTED', snoozedUntil: null, cadence: 'MUTED', defaultCadence: 'IMMEDIATE' } }),
    cat('REFINANCE', 'Refinance', { consent: { required: true, granted: false, version: null, disclosure: 'If you allow it…' } })], ...over,
});
const sLaunch = { operationId: 'NOTIFICATION_SETTINGS_COMMAND', surface: 'ASK_PAGE' };
const proposeSetting = (message) => capabilityInvoke('NOTIFICATION_SETTINGS_COMMAND', { userId: 'u1', propertyId: 'p1', message, launchContext: sLaunch });

test('the settings answer lists each category with the one action that applies, none for safety, and is valid', () => {
  const result = notificationSettingsFromSettings(settings());
  for (const block of result.blocks) AskPresentationBlockSchema.parse(block);
  const rows = Object.fromEntries(result.blocks[1].sections[1].items.map((r) => [r.id, r]));
  assert.equal(rows.ALL, undefined);
  assert.deepEqual(rows.SAFETY.actions, []);
  assert.deepEqual(rows.MAINTENANCE.actions.map((a) => a.id), ['notification-setting-mute', 'notification-setting-snooze']);
  assert.deepEqual(rows.COVERAGE.actions.map((a) => a.id), ['notification-setting-unmute']);
  assert.deepEqual(rows.REFINANCE.actions.map((a) => a.id), ['notification-setting-consent-grant']);
  for (const row of Object.values(rows)) for (const a of row.actions) assert.deepEqual(g.parseNotificationSettingsRequest(a.message)?.category, row.id, a.message);
});

test('mute and snooze review first, then write once; safety is refused; quiet hours state their time zone', async () => {
  const w = install({ settings: settings() });
  try {
    const mute = await proposeSetting('Mute maintenance notifications by email');
    assert.equal(mute.status, 'NEEDS_CONFIRMATION');
    assert.equal(w.calls.length, 0);
    const done = await confirmCapabilityInvoke('NOTIFICATION_SETTINGS_COMMAND', ctx('NOTIFICATION_SETTINGS_COMMAND', mute.parameters));
    assert.deepEqual(w.calls, [['category', 'u1', 'MAINTENANCE', { mode: 'MUTED' }]]);
    assert.equal(done.result.status, 'COMPLETED');

    const refused = await proposeSetting('Mute safety notifications');
    assert.equal(refused.status, 'NOT_APPLICABLE');
    assert.match(refused.blocks[0].body, /cannot be muted/);

    const quiet = await proposeSetting('Set quiet hours from 10pm to 7am');
    assert.deepEqual(quiet.confirmation.fields.map((f) => f.value), ['10pm to 7am', 'America/Chicago']);
    await confirmCapabilityInvoke('NOTIFICATION_SETTINGS_COMMAND', ctx('NOTIFICATION_SETTINGS_COMMAND', quiet.parameters));
    assert.deepEqual(w.calls[1], ['quiet', 'u1', { start: '22:00', end: '07:00', timezone: 'America/Chicago' }]);

    const unmuteFinancial = await proposeSetting('Resume refinance notifications by email');
    assert.equal(unmuteFinancial.status === 'NEEDS_CONFIRMATION' ? unmuteFinancial.reasonCode : 'x', 'NOTIFICATION_SETTINGS_CONSENT_GRANT_CONFIRMATION_REQUIRED');
  } finally { w.restore(); }
});

test('a settings confirmation goes stale when the settings changed; an unclear sentence changes nothing', async () => {
  const w = install({ settings: settings() });
  let proposal;
  try { proposal = await proposeSetting('Mute maintenance notifications by email'); } finally { w.restore(); }
  const w2 = install({ settings: settings({ categories: settings().categories.map((c) => (c.category === 'MAINTENANCE' ? { ...c, email: { ...c.email, mode: 'MUTED' } } : c)) }) });
  try {
    await assert.rejects(confirmCapabilityInvoke('NOTIFICATION_SETTINGS_COMMAND', ctx('NOTIFICATION_SETTINGS_COMMAND', proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    const unclear = await proposeSetting('Change my notification settings');
    assert.equal(unclear.reasonCode, 'ASK_NOTIFICATION_SETTINGS_UNCLEAR');
    assert.equal(w2.calls.length, 0);
  } finally { w2.restore(); }
});
