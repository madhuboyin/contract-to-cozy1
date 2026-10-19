const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readMonitorWork } = require('../../src/services/ask/work/monitors.reader.ts');
const { readQueuedJobWork } = require('../../src/services/ask/work/queuedJobs.reader.ts');
const { readScheduledFollowUpWork } = require('../../src/services/ask/work/scheduledFollowUps.reader.ts');
const readers = require('../../src/services/ask/saved/savedTypeReaders.ts');
const { ASK_SEARCH_PROVIDERS } = require('../../src/services/ask/search/askSearchProviders.ts');
const { ASK_ARTIFACT_TYPE_REGISTRY, validateAskArtifactTypeRegistry } = require('../../src/services/ask/governance/askArtifactTypeRegistry.ts');
const { validateAskSavedTypes } = require('../../src/services/ask/askSaved.service.ts');

const NOW = new Date('2026-10-20T12:00:00.000Z');
const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
const ctx = { userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING', now: NOW };
const wctx = { userId: 'u1', propertyId: 'p1', role: 'OWNER' };
const wq = (search) => ({ view: 'NEEDS_YOU', allViews: true, search, after: null, limit: 6, status: null });
const sq = (extra = {}) => ({ after: null, limit: 6, search: null, freshness: null, archived: 'ACTIVE', archivedByYouIds: [], ...extra });
const noReceipts = () => { prisma.askConfirmationReceipt = { findMany: async () => [] }; };

test('monitors are searchable by the product they watch or the words that name them, across active and paused', async () => {
  const calls = [];
  prisma.refinanceRateMonitor = { findMany: async (a) => { calls.push(a); return [{ id: 'm1', propertyId: 'p1', product: 'FIXED_30_YEAR', thresholdBps: 575, status: 'PAUSED', confirmationVersion: 1, updatedAt: at(5) }]; }, count: async () => 1 };
  const page = await readMonitorWork(wctx, wq('30-year'));
  assert.equal(page.rows[0].lifecycleView, 'WAITING', 'a paused monitor is found although the view is not Waiting');
  assert.match(JSON.stringify(calls[0].where), /"product":\{"in":\["FIXED_30_YEAR"\]\}/);
  assert.match(JSON.stringify(calls[0].where), /"userId":"u1"/);
  await readMonitorWork(wctx, wq('refinance'));
  assert.doesNotMatch(JSON.stringify(calls[1].where), /"product"/);
  assert.match(JSON.stringify(calls[1].where), /"status":\{"in":\["ACTIVE","PAUSED"\]\}/, 'a stopped monitor is never found');
});

test('export jobs are searchable by report kind or the words export and report, for the requester only', async () => {
  const calls = { report: [], score: [] };
  prisma.homeReportExport = { findMany: async (a) => { calls.report.push(a); return []; }, count: async () => 0 };
  prisma.homeScoreExportJob = { findMany: async (a) => { calls.score.push(a); return []; }, count: async () => 0 };
  await readQueuedJobWork(wctx, wq('inventory'));
  assert.match(JSON.stringify(calls.report[0].where), /"type":\{"in":\["INVENTORY"\]\}/);
  assert.match(JSON.stringify(calls.score[0].where), /"id":\{"in":\[\]\}/, 'a score report does not match "inventory"');
  assert.match(JSON.stringify(calls.report[0].where), /"userId":"u1"/);
  await readQueuedJobWork(wctx, wq('score'));
  assert.doesNotMatch(JSON.stringify(calls.score[1].where), /"in":\[\]/);
  await readQueuedJobWork(wctx, wq('export'));
  assert.doesNotMatch(JSON.stringify(calls.report[2].where), /"type"/);
  assert.doesNotMatch(JSON.stringify(calls.report[2].where), /"status":"DELETED"|deletedAt":\{/);
  assert.match(JSON.stringify(calls.report[2].where), /"deletedAt":null/);
});

test('scheduled follow-ups are searchable through the claim or project they belong to; savings only by the words that name them', async () => {
  const calls = { claim: [], project: [], savings: [] };
  prisma.claim = { findMany: async (a) => { calls.claim.push(a); return []; }, count: async () => 0 };
  prisma.projectRecord = { findMany: async (a) => { calls.project.push(a); return []; }, count: async () => 0 };
  prisma.property = { findFirst: async () => ({ id: 'p1' }) };
  prisma.savingsBenefitAction = { findMany: async (a) => { calls.savings.push(a); return []; }, count: async () => 0 };
  const open = await readScheduledFollowUpWork(wctx, { view: 'NEEDS_YOU', allViews: true, search: 'water', after: null, limit: 6, status: null });
  assert.deepEqual(open.rows, []);
  assert.match(JSON.stringify(calls.claim[0].where), /"title":\{"contains":"water","mode":"insensitive"\}/);
  assert.match(JSON.stringify(calls.project[0].where), /"name":\{"contains":"water"/);
  assert.equal(calls.savings.length, 0, 'savings has no title, so an unrelated word never reads it');
  await readScheduledFollowUpWork({ ...wctx, operatingMode: 'OWNING' }, { view: 'NEEDS_YOU', allViews: true, search: 'savings', after: null, limit: 6, status: null });
  assert.equal(calls.savings.length, 1);
  const none = await readScheduledFollowUpWork(wctx, { view: 'NEEDS_YOU', search: 'water', after: null, limit: 6, status: null });
  assert.deepEqual(none.rows, [], 'without allViews the Scheduled-only rule still holds');
});

test('home score reports: homeowner mode only, the owner\'s own status decides current, superseded and withdrawn', async () => {
  noReceipts();
  const calls = [];
  prisma.homeScoreReport = {
    findMany: async (a) => { calls.push(a); return [
      { id: 'h2', status: 'FINAL', reportVersion: '2.0', scoreModelVersion: 'm3', generatedAt: at(18), createdAt: at(18), updatedAt: at(18) },
      { id: 'h1', status: 'SUPERSEDED', reportVersion: '2.0', scoreModelVersion: 'm2', generatedAt: at(2), createdAt: at(2), updatedAt: at(2) },
      { id: 'h0', status: 'REVOKED', reportVersion: '1.0', scoreModelVersion: null, generatedAt: at(1), createdAt: at(1), updatedAt: at(1) },
    ]; },
    count: async () => 3,
  };
  const [current, prior, revoked] = (await readers.readSavedHomeScoreReports(ctx, sq())).rows;
  assert.equal(current.freshness.state, 'CURRENT');
  assert.equal(prior.freshness.state, 'SUPERSEDED');
  assert.equal(revoked.archived.byOwner, true);
  assert.match(JSON.stringify(calls[0].where), /"reportMode":"HOMEOWNER"/);
  assert.doesNotMatch(JSON.stringify(calls), /shareToken|storageUrl/, 'share tokens are never read');
  assert.match(current.reopenUnavailableReason, /cannot reopen/);
});

test('saved refinance scenarios: only the ones the person saved, stale after 90 days, SENSITIVE', async () => {
  noReceipts();
  const calls = [];
  const old = new Date(NOW.getTime() - 120 * 86_400_000);
  prisma.refinanceScenarioSnapshot = { findMany: async (a) => { calls.push(a); return [{ id: 'r1', targetRate: 5.5, targetTerm: 'YEARS_30', monthlySavings: '212.4', createdAt: old, updatedAt: at(2) }]; }, count: async () => 1 };
  const [row] = (await readers.readSavedRefinanceScenarios(ctx, sq())).rows;
  assert.match(JSON.stringify(calls[0].where), /"isSaved":true/);
  assert.equal(row.freshness.state, 'STALE');
  assert.equal(row.visibility.sensitivity, 'SENSITIVE');
  assert.equal(row.summary, 'About $212 a month');
  assert.equal(row.title, 'Refinance at 5.5% (Years 30)');
});

test('the two newly connected Saved types and the three Work kinds are in the registries and the search providers', () => {
  assert.deepEqual(validateAskArtifactTypeRegistry(), []);
  assert.deepEqual(validateAskSavedTypes(), []);
  for (const id of ['HOME_SCORE_REPORT', 'REFINANCE_SCENARIO']) {
    assert.equal(ASK_ARTIFACT_TYPE_REGISTRY.find((entry) => entry.id === id).reader.state, 'CONNECTED', id);
    assert.ok(ASK_SEARCH_PROVIDERS.find((p) => p.id === `SAVED_${id}`).search, id);
  }
  assert.match(ASK_SEARCH_PROVIDERS.find((p) => p.id === 'RECORD_property-facts').unavailableReason, /How complete is my home record/);
});
