const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  summarizeHomeOperationsMeasurement,
} = require('../../src/services/adminAnalytics/homeOperationsMeasurementService.ts');

// Item #23 (§14 "Measurement"). Pure-function tests, same style as
// renovationOperationalHealth.test.js.

const now = new Date('2026-08-01T12:00:00.000Z');

function workItem(overrides = {}) {
  return {
    id: overrides.id ?? 'wi-1',
    propertyId: overrides.propertyId ?? 'property-1',
    state: 'CANDIDATE',
    acceptanceState: 'PROPOSED',
    disposition: null,
    priority: 'PLAN',
    dueAt: null,
    createdAt: now,
    acceptedAt: null,
    startedAt: null,
    reportedCompletedAt: null,
    verifiedAt: null,
    ...overrides,
  };
}

test('empty snapshot returns nulls, not fabricated zeros-as-rates, and populates gaps', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [], sources: [], scheduledEvents: [], reopenedEvents: [],
    briefingItems: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
  }, now);

  assert.equal(result.northStar.verifiedImportantOutcomes, 0);
  assert.equal(result.northStar.perPropertyRate, null, 'zero-property denominator must not divide into a fake 0');
  assert.equal(result.funnel.acceptanceRate, null);
  assert.equal(result.funnel.recommendationUnderstoodRate, null);
  assert.ok(result.gaps.length >= 8, 'every documented gap must be listed');
  assert.ok(result.gaps.some((g) => g.startsWith('recommendationUnderstoodRate:')));
});

test('north star counts VERIFIED NOW/SOON items across distinct properties', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [
      workItem({ id: 'a', propertyId: 'p1', state: 'VERIFIED', priority: 'NOW' }),
      workItem({ id: 'b', propertyId: 'p1', state: 'VERIFIED', priority: 'CONSIDER' }), // not "important"
      workItem({ id: 'c', propertyId: 'p2', state: 'ACCEPTED', priority: 'SOON' }), // not verified yet
      workItem({ id: 'd', propertyId: 'p2', state: 'VERIFIED', priority: 'SOON' }),
    ],
    sources: [], scheduledEvents: [], reopenedEvents: [], briefingItems: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
  }, now);

  assert.equal(result.northStar.verifiedImportantOutcomes, 2);
  assert.equal(result.northStar.activeProperties, 2);
  assert.equal(result.northStar.perPropertyRate, 1);
});

test('funnel stage timings compute from work-item timestamps plus WORK_SCHEDULED events', () => {
  const acceptedAt = new Date('2026-07-01T00:00:00.000Z');
  const scheduledAt = new Date('2026-07-02T00:00:00.000Z'); // +24h
  const startedAt = new Date('2026-07-04T00:00:00.000Z'); // +48h from scheduled
  const reportedCompletedAt = new Date('2026-07-05T00:00:00.000Z'); // +24h from started
  const verifiedAt = new Date('2026-07-06T00:00:00.000Z'); // +24h from reported

  const result = summarizeHomeOperationsMeasurement({
    workItems: [workItem({ id: 'wi-1', acceptedAt, startedAt, reportedCompletedAt, verifiedAt })],
    sources: [], reopenedEvents: [], briefingItems: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
    scheduledEvents: [{ workItemId: 'wi-1', occurredAt: scheduledAt }],
  }, now);

  assert.equal(result.funnel.acceptedToScheduledHours.averageHours, 24);
  assert.equal(result.funnel.scheduledToStartedHours.averageHours, 48);
  assert.equal(result.funnel.startedToReportedCompleteHours.averageHours, 24);
  assert.equal(result.funnel.reportedToVerifiedHours.averageHours, 24);
});

test('acceptance rate excludes items still pending a decision (CANDIDATE)', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [
      workItem({ id: 'a', acceptanceState: 'ACCEPTED' }),
      workItem({ id: 'b', acceptanceState: 'ACCEPTED' }),
      workItem({ id: 'c', acceptanceState: 'DECLINED' }),
      workItem({ id: 'd', acceptanceState: 'PROPOSED' }), // still undecided -- excluded from the rate entirely
    ],
    sources: [], scheduledEvents: [], reopenedEvents: [], briefingItems: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
  }, now);

  assert.equal(result.funnel.acceptanceRate, percentOf(2, 3));
});

function percentOf(n, d) {
  return Math.round((n / d) * 10_000) / 10_000;
}

test('overdue rate only considers open items that actually have a dueAt', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [
      workItem({ id: 'overdue', state: 'ACCEPTED', dueAt: new Date('2026-01-01T00:00:00.000Z') }),
      workItem({ id: 'not-overdue', state: 'ACCEPTED', dueAt: new Date('2027-01-01T00:00:00.000Z') }),
      workItem({ id: 'closed-overdue', state: 'CLOSED', dueAt: new Date('2026-01-01T00:00:00.000Z') }), // closed -- excluded
      workItem({ id: 'no-due-date', state: 'ACCEPTED', dueAt: null }), // no dueAt -- excluded
    ],
    sources: [], scheduledEvents: [], reopenedEvents: [], briefingItems: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
  }, now);

  assert.equal(result.funnel.overdueRate, 0.5);
});

test('reopen rate is reopen events over items that ever reached reported-complete or verified', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [
      workItem({ id: 'a', reportedCompletedAt: now }),
      workItem({ id: 'b', verifiedAt: now }),
      workItem({ id: 'c' }), // never completed -- excluded from denominator
    ],
    sources: [], scheduledEvents: [], briefingItems: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
    reopenedEvents: [{ workItemId: 'a', occurredAt: now }],
  }, now);

  assert.equal(result.funnel.reopenRate, percentOf(1, 2));
  assert.equal(result.trust.falseCompletionIncidents, 1);
});

test('notifications without actionable change counts fully-unengaged briefing items', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [], sources: [], scheduledEvents: [], reopenedEvents: [], projectExecutions: [], projects: [], writeBackProjectIds: [],
    briefingItems: [
      { openedAt: null, seenAt: null, actedAt: null, dismissedAt: null, notUsefulAt: null },
      { openedAt: new Date(), seenAt: null, actedAt: null, dismissedAt: null, notUsefulAt: null },
    ],
  }, now);

  assert.equal(result.trust.notificationsWithoutActionableChange.count, 1);
  assert.equal(result.trust.notificationsWithoutActionableChange.rate, 0.5);
});

test('home-operations measurement endpoint inherits the admin analytics MFA, role, and capability gate', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminAnalytics.routes.ts'),
    'utf8',
  );
  assert.match(
    routeSource,
    /router\.use\('\/admin\/analytics', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\), requireCapability\('ANALYTICS_VIEW'\)\)/,
  );
  assert.match(routeSource, /'\/admin\/analytics\/home-operations'/);
  assert.match(routeSource, /getHomeOperationsMeasurementHandler/);
});

test('project write-back failures are scoped to projects with a PROJECT execution link', () => {
  const result = summarizeHomeOperationsMeasurement({
    workItems: [], sources: [], scheduledEvents: [], reopenedEvents: [], briefingItems: [],
    projectExecutions: [
      { workItemId: 'wi-1', executionEntityId: 'proj-tracked' },
    ],
    projects: [
      { id: 'proj-tracked', status: 'COMPLETED', outcomeStatus: 'VERIFIED_SUCCESS' },
      { id: 'proj-untracked', status: 'COMPLETED', outcomeStatus: 'VERIFIED_SUCCESS' }, // no execution link -- excluded
    ],
    writeBackProjectIds: [], // tracked project completed with no write-back -- a failure
  }, now);

  assert.equal(result.trust.projectWriteBackFailures.completedProjects, 1);
  assert.equal(result.trust.projectWriteBackFailures.successfulWriteBacks, 0);
  assert.equal(result.trust.projectWriteBackFailures.failureRate, 1);
});
