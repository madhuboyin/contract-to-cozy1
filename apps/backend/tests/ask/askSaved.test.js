const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { ASK_ARTIFACT_TYPE_REGISTRY, validateAskArtifactTypeRegistry, evaluateArtifactTypeApplicability, artifactTypeReadFloor } = require('../../src/services/ask/governance/askArtifactTypeRegistry.ts');
const { composeAskSavedPage, resolveAskSavedArtifact, parseArtifactKey, validateAskSavedTypes } = require('../../src/services/ask/askSaved.service.ts');
const readers = require('../../src/services/ask/saved/savedTypeReaders.ts');

const NOW = new Date('2026-10-20T12:00:00.000Z');
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const input = (role = 'OWNER') => ({ userId: 'u1', propertyId: 'p1', role, operatingMode: 'OWNING', now: NOW });
const ctx = { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING', now: NOW };
const query = (extra = {}) => ({ after: null, limit: 5, search: null, freshness: null, archived: 'ACTIVE', archivedByYouIds: [], ...extra });
const parsed = (extra = {}) => ({ after: null, limit: 5, search: null, artifactType: null, freshness: null, archived: false, ...extra });
const fail = () => { throw new Error('Saved must not write payloads or canonical records'); };
const noReceipts = () => { prisma.askConfirmationReceipt = { findMany: async () => [] }; };

test('registry is valid, every type has a reader, and every material decision output retains its prior versions', () => {
  assert.deepEqual(validateAskArtifactTypeRegistry(), []);
  assert.deepEqual(validateAskSavedTypes(), []);
  for (const entry of ASK_ARTIFACT_TYPE_REGISTRY.filter((candidate) => candidate.materialDecisionOutput)) assert.notEqual(entry.versionBehavior, 'UPDATES_IN_PLACE', entry.id);
  const broken = { ...ASK_ARTIFACT_TYPE_REGISTRY.find((entry) => entry.id === 'SELL_HOLD_RENT_ANALYSIS'), versionBehavior: 'UPDATES_IN_PLACE' };
  assert.match(validateAskArtifactTypeRegistry([broken]).join('\n'), /replaced in place/);
  assert.match(validateAskArtifactTypeRegistry([ASK_ARTIFACT_TYPE_REGISTRY[0], ASK_ARTIFACT_TYPE_REGISTRY[0]]).join('\n'), /Duplicate artifact type id/);
  assert.equal(artifactTypeReadFloor(ASK_ARTIFACT_TYPE_REGISTRY.find((entry) => entry.id === 'QUOTE_COMPARISON')), 'VIEWER');
  assert.equal(evaluateArtifactTypeApplicability(ASK_ARTIFACT_TYPE_REGISTRY[0], { householdRole: 'VIEWER', operatingMode: 'OWNING' }), 'APPLICABLE');
  assert.deepEqual(parseArtifactKey('decision:s1').definition.id, 'DECISION_RECOMMENDATION');
  assert.equal(parseArtifactKey('nope:1'), null);
});

test('home reports: the requester\'s own, expired and regenerated exports are told apart, and nothing is written', async () => {
  noReceipts();
  const calls = [];
  prisma.homeReportExport = {
    findMany: async (args) => {
      calls.push(args);
      if (args.where.regeneratedFromId) return [{ id: 'r2', regeneratedFromId: 'r1' }];
      return [
        { id: 'r2', type: 'HOME_REPORT_PACK', status: 'READY', requestedAt: at(15), completedAt: at(15), expiresAt: at(30), regeneratedFromId: 'r1', shareToken: 'tok', shareRevokedAt: null },
        { id: 'r1', type: 'HOME_REPORT_PACK', status: 'READY', requestedAt: at(5), completedAt: at(5), expiresAt: at(30), regeneratedFromId: null, shareToken: null, shareRevokedAt: null },
        { id: 'r0', type: 'INVENTORY', status: 'EXPIRED', requestedAt: at(1), completedAt: at(1), expiresAt: at(2), regeneratedFromId: null, shareToken: null, shareRevokedAt: null },
      ];
    },
    count: async () => 3, update: fail, create: fail, delete: fail,
  };
  const page = await readers.readSavedReportExports(ctx, query());
  const [newest, older, expired] = page.rows;
  assert.deepEqual([newest.freshness.state, older.freshness.state, expired.freshness.state], ['CURRENT', 'SUPERSEDED', 'EXPIRED']);
  assert.equal(older.version.supersededBy, 'report:r2');
  assert.equal(newest.version.supersedes, 'report:r1');
  assert.equal(newest.capabilities.share, true);
  assert.equal(expired.capabilities.export, false);
  assert.equal(newest.visibility.scope, 'REQUESTER_ONLY');
  assert.match(newest.reopenUnavailableReason, /cannot reopen/);
  const listing = calls.find((call) => !call.where.regeneratedFromId);
  assert.match(JSON.stringify(listing.where), /"userId":"u1"/);
  assert.match(JSON.stringify(listing.where), /"deletedAt":null/);
});

test('decision recommendations: a recompute keeps the prior version, marked superseded and linked, never overwritten', async () => {
  noReceipts();
  const thread = { id: 't1', title: 'Furnace', lifecycleStatus: 'RECOMMENDATION_AVAILABLE', contextStatus: 'CURRENT', decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityType: 'InventoryItem', primaryEntityId: 'inv1', version: 4 };
  prisma.recommendationSnapshot = {
    findMany: async () => [
      { id: 's2', verdictCode: 'REPLACE', generatedAt: at(18), supersedesSnapshotId: 's1', supersededBy: [], currentForThread: { id: 't1' }, decisionThread: thread },
      { id: 's1', verdictCode: 'REPAIR', generatedAt: at(3), supersedesSnapshotId: null, supersededBy: [{ id: 's2' }], currentForThread: null, decisionThread: thread },
    ],
    count: async () => 2, update: fail, create: fail,
  };
  const page = await readers.readSavedDecisionRecommendations(ctx, query());
  const [current, prior] = page.rows;
  assert.equal(current.freshness.state, 'CURRENT');
  assert.equal(prior.freshness.state, 'SUPERSEDED');
  assert.equal(prior.version.superseded, true);
  assert.equal(prior.version.supersededBy, 'decision:s2');
  assert.equal(current.version.supersedes, 'decision:s1');
  assert.equal(current.reopen.operationId, 'HVAC_DECISION_CONTINUE');
  assert.equal(current.reopen.decisionThreadId, 't1');
  assert.equal(current.visibility.sensitivity, 'SENSITIVE');
  assert.equal(page.rows.length, 2, 'both versions stay listed');
});

test('a decision of a family Ask cannot continue is still saved, with an honest reopen reason; a stale context says so', async () => {
  noReceipts();
  const thread = { id: 't9', title: 'Roof', lifecycleStatus: 'RECOMMENDATION_AVAILABLE', contextStatus: 'STALE', decisionDefinitionId: 'ROOF_REPAIR_REPLACE', primaryEntityType: null, primaryEntityId: null, version: 1 };
  prisma.recommendationSnapshot = { findMany: async () => [{ id: 's9', verdictCode: 'REPAIR', generatedAt: at(3), supersedesSnapshotId: null, supersededBy: [], currentForThread: { id: 't9' }, decisionThread: thread }], count: async () => 1 };
  const [row] = (await readers.readSavedDecisionRecommendations(ctx, query())).rows;
  assert.equal(row.reopen, null);
  assert.match(row.reopenUnavailableReason, /cannot continue/);
  assert.equal(row.freshness.state, 'STALE');
});

test('sell/hold/rent analyses: the newest is current, earlier ones are retained as superseded with links, and reopening is not offered', async () => {
  noReceipts();
  prisma.sellHoldRentAnalysis = {
    findMany: async (args) => (args.select.winner
      ? [{ id: 'a2', years: 5, winner: 'HOLD', confidence: 'HIGH', computedAt: at(19), createdAt: at(19), updatedAt: at(19) }, { id: 'a1', years: 5, winner: 'SELL', confidence: 'LOW', computedAt: at(2), createdAt: at(2), updatedAt: at(2) }]
      : [{ id: 'a2' }, { id: 'a1' }]),
    count: async () => 2, update: fail, create: fail,
  };
  const [latest, earlier] = (await readers.readSavedSellHoldRentAnalyses(ctx, query())).rows;
  assert.equal(latest.freshness.state, 'CURRENT');
  assert.equal(earlier.freshness.state, 'SUPERSEDED');
  assert.equal(earlier.version.supersededBy, 'analysis:a2');
  assert.equal(latest.version.supersedes, 'analysis:a1');
  assert.equal(earlier.summary, 'Best option: Sell · Low confidence');
  assert.equal(latest.reopen, null);
  assert.match(latest.reopenUnavailableReason, /recomputes/);
});

test('quote comparisons, briefs and seasonal checklists inherit the owner\'s archive and freshness', async () => {
  noReceipts();
  prisma.quoteComparisonWorkspace = { findMany: async () => [{ id: 'q1', status: 'ARCHIVED', serviceCategory: 'ROOFING', scopeSummary: null, decisionSummary: null, selectedVendorName: 'Acme', decisionRecordedAt: at(7), createdAt: at(1), updatedAt: at(7) }], count: async () => 1 };
  const [quote] = (await readers.readSavedQuoteComparisons(ctx, query({ archived: 'ARCHIVED' }))).rows;
  assert.equal(quote.archived.byOwner, true);
  assert.equal(quote.title, 'Roofing quotes');
  assert.equal(quote.summary, 'Selected Acme');
  assert.equal(quote.reopen.operationId, 'QUOTE_COMPARISON_REVIEW');
  assert.equal(quote.reopen.entityType, 'QUOTE_COMPARISON_WORKSPACE');
  prisma.propertyBrief = { findMany: async () => [{ id: 'b1', title: 'For my agent', purpose: 'PROSPECTIVE_BUYER', status: 'SHARED', asOf: at(1), createdAt: at(1), updatedAt: at(2), shares: [{ status: 'ACTIVE' }] }], count: async () => 1 };
  const old = new Date(NOW.getTime() - 120 * 86_400_000);
  prisma.propertyBrief.findMany = async () => [{ id: 'b1', title: 'For my agent', purpose: 'PROSPECTIVE_BUYER', status: 'SHARED', asOf: old, createdAt: old, updatedAt: at(2), shares: [{ status: 'ACTIVE' }] }];
  const [brief] = (await readers.readSavedPropertyBriefs(ctx, query())).rows;
  assert.equal(brief.freshness.state, 'STALE');
  assert.match(brief.summary, /shared/);
  assert.equal(brief.capabilities.share, true);
  const viewerBrief = (await readers.readSavedPropertyBriefs({ ...ctx, role: 'VIEWER' }, query())).rows[0];
  assert.equal(viewerBrief.capabilities.share, false);
  prisma.seasonalChecklist = { findMany: async () => [{ id: 'c1', season: 'WINTER', year: 2025, status: 'DISMISSED', totalTasks: 6, tasksCompleted: 2, seasonEndDate: new Date('2026-03-01T00:00:00Z'), generatedAt: at(1), createdAt: at(1), updatedAt: at(2) }], count: async () => 1 };
  const [seasonal] = (await readers.readSavedSeasonalChecklists(ctx, query({ archived: 'ARCHIVED' }))).rows;
  assert.equal(seasonal.freshness.state, 'STALE');
  assert.equal(seasonal.archived.byOwner, true);
  assert.equal(seasonal.title, 'Winter 2025 checklist');
});

test('the archive filter, search, freshness and keyset reach the query; "archived by you" ids hide a row from the active list', async () => {
  noReceipts();
  const calls = [];
  prisma.quoteComparisonWorkspace = { findMany: async (args) => { calls.push(args); return []; }, count: async (args) => { calls.push(args); return 0; } };
  await readers.readSavedQuoteComparisons(ctx, query({ archivedByYouIds: ['q9'], search: 'roof', freshness: 'CURRENT', after: { sortAt: at(7).toISOString(), artifactKey: 'comparison:q1' } }));
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"NOT":\{"OR":\[\{"status":"ARCHIVED"\},\{"id":\{"in":\["q9"\]\}\}\]\}/);
  assert.match(where, /"scopeSummary":\{"contains":"roof","mode":"insensitive"\}/);
  assert.match(where, /"updatedAt":\{"lt"/);
  const archivedList = JSON.stringify(calls.find((call, index) => index > 0 && JSON.stringify(call.where).includes('"OR":[{"status":"ARCHIVED"}')).where);
  assert.match(archivedList, /"id":\{"in":\["q9"\]\}/);
  await readers.readSavedQuoteComparisons(ctx, query({ entityId: 'q-old', archived: 'ACTIVE' }));
  assert.doesNotMatch(JSON.stringify(calls.at(-2).where), /ARCHIVED/, 'opening one by key ignores archive state');
});

test('the page merges types in (sortAt desc, key asc) order, pages with a cursor, and counts active and archived', async () => {
  const row = (key, sortAt) => ({ artifactKey: key, propertyId: 'p1', sortAt, entity: { id: key.split(':')[1] } });
  const reader = (rows, other) => async (_c, q) => ({ rows: rows.filter((r) => !q.after || r.sortAt < q.after.sortAt || (r.sortAt === q.after.sortAt && r.artifactKey > q.after.artifactKey)).slice(0, q.limit), total: rows.length, otherTotal: other });
  const all = { QUOTE_COMPARISON: reader([row('comparison:a', at(5).toISOString()), row('comparison:b', at(2).toISOString())], 1), SEASONAL_CHECKLIST: reader([row('seasonal:a', at(5).toISOString())], 2) };
  const empty = async () => ({ rows: [], total: 0, otherTotal: 0 });
  const readersMap = Object.fromEntries(ASK_ARTIFACT_TYPE_REGISTRY.map((entry) => [entry.id, all[entry.id] ?? empty]));
  const first = await composeAskSavedPage(input(), parsed({ limit: 2 }), readersMap);
  assert.deepEqual(first.rows.map((r) => r.artifactKey), ['comparison:a', 'seasonal:a']);
  assert.equal(first.truncated, true);
  assert.equal(first.partial, false);
  assert.equal(first.total, 3);
  assert.deepEqual(first.counts, { active: 3, archived: 3 });
  const boundary = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
  const second = await composeAskSavedPage(input(), parsed({ limit: 2, after: { sortAt: boundary.t, artifactKey: boundary.k } }), readersMap);
  assert.deepEqual(second.rows.map((r) => r.artifactKey), ['comparison:b']);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(first.filterOptions.types.map((o) => o.value).sort(), ASK_ARTIFACT_TYPE_REGISTRY.map((e) => e.id).sort());
});

test('a failing type is reported, never dropped or counted as zero, and makes the page partial with no total', async () => {
  const empty = async () => ({ rows: [], total: 0, otherTotal: 0 });
  const readersMap = Object.fromEntries(ASK_ARTIFACT_TYPE_REGISTRY.map((entry) => [entry.id, entry.id === 'PROPERTY_BRIEF' ? async () => { throw new Error('boom'); } : empty]));
  const page = await composeAskSavedPage(input(), parsed(), readersMap);
  assert.equal(page.partial, true);
  assert.equal(page.total, null);
  assert.equal(page.totalScope, 'PARTIAL');
  assert.equal(page.types.find((t) => t.artifactType === 'PROPERTY_BRIEF').state, 'FAILED');
  assert.equal(page.types.length, ASK_ARTIFACT_TYPE_REGISTRY.length);
});

test('resolve: a live artifact opens; a removed one is DELETED; a role that lost access is ACCESS_LOST; a bad key is DELETED', async () => {
  noReceipts();
  const present = { artifactKey: 'comparison:q1', propertyId: 'p1', entity: { id: 'q1' } };
  const map = { QUOTE_COMPARISON: async (_c, q) => ({ rows: q.entityId === 'q1' ? [present] : [], total: 1, otherTotal: null }) };
  assert.equal((await resolveAskSavedArtifact({ ...input(), artifactKey: 'comparison:q1' }, map)).outcome, 'AVAILABLE');
  assert.equal((await resolveAskSavedArtifact({ ...input(), artifactKey: 'comparison:gone' }, map)).outcome, 'DELETED');
  assert.equal((await resolveAskSavedArtifact({ ...input(), artifactKey: 'bogus' }, map)).outcome, 'DELETED');
  const none = await resolveAskSavedArtifact({ ...input(), artifactKey: 'comparison:q1' }, {});
  assert.equal(none.outcome, 'UNAVAILABLE');
});

test('the preference table holds only a key, and Saved reads write nothing', async () => {
  const fields = Object.keys(require('@prisma/client').Prisma.AskSavedArtifactPreferenceScalarFieldEnum).sort();
  assert.deepEqual(fields, ['archivedAt', 'artifactKey', 'id', 'propertyId', 'userId']);
});
