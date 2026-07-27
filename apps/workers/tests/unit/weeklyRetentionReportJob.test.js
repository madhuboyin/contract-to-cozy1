// apps/workers/tests/unit/weeklyRetentionReportJob.test.js
//
// W4 item 4: runWeeklyRetentionReportJob had no dedicated test. Covers the
// RETENTION_REPORT_EMAIL skip gate, the zero-events short message, and the
// week-over-week retention-rate math (including the no-prior-week-baseline
// edge case).
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runWeeklyRetentionReportJob } = require('../../src/jobs/weeklyRetentionReport.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ currentWeekEvents = [], previousWeekEvents = [] }) {
  const calls = { sentEmails: [] };
  const deps = {
    prisma: {
      productAnalyticsEvent: {
        findMany: async ({ where }) => {
          // Distinguish the two calls by their date-range shape: the current-week
          // query uses `lte`, the previous-week query uses `lt`.
          return where.occurredAt.lte !== undefined ? currentWeekEvents : previousWeekEvents;
        },
      },
    },
    sendEmail: async (to, subject, html) => {
      calls.sentEmails.push({ to, subject, html });
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) delete process.env[key];
        else process.env[key] = originals[key];
      }
    }
  })();
}

test('skips sending entirely when RETENTION_REPORT_EMAIL is unset', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: undefined }, async () => {
    const { deps, calls } = fakeDeps({});

    await runWeeklyRetentionReportJob(deps);

    assert.equal(calls.sentEmails.length, 0);
  });
});

test('sends a "no events" message when there were zero events this week', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { deps, calls } = fakeDeps({ currentWeekEvents: [] });

    await runWeeklyRetentionReportJob(deps);

    assert.equal(calls.sentEmails.length, 1);
    assert.match(calls.sentEmails[0].html, /No product analytics events recorded/);
  });
});

test('computes week-over-week retention rate from properties active in both weeks', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { deps, calls } = fakeDeps({
      currentWeekEvents: [
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'property-1', userId: 'user-1' },
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'property-2', userId: 'user-2' },
      ],
      previousWeekEvents: [
        { propertyId: 'property-1', userId: 'user-1' },
        { propertyId: 'property-3', userId: 'user-3' },
      ],
    });

    await runWeeklyRetentionReportJob(deps);

    const html = calls.sentEmails[0].html;
    // property-1 is the only property active in both weeks → 1 retained / 2 previous = 50%
    assert.match(html, />50%</);
    assert.match(html, /1 of 2 properties active last week came back this week/);
  });
});

test('reports "no baseline" instead of a bogus 0%/NaN% when there were zero prior-week properties', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { deps, calls } = fakeDeps({
      currentWeekEvents: [{ eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'property-1', userId: 'user-1' }],
      previousWeekEvents: [],
    });

    await runWeeklyRetentionReportJob(deps);

    const html = calls.sentEmails[0].html;
    assert.match(html, /No properties were active last week/);
    assert.doesNotMatch(html, /NaN/);
  });
});

test('groups events by type and by feature correctly', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { deps, calls } = fakeDeps({
      currentWeekEvents: [
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'p1', userId: 'u1' },
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'p2', userId: 'u2' },
        { eventType: 'TOOL_USED', featureKey: null, propertyId: 'p3', userId: 'u3' },
        { eventType: 'PAGE_VIEW', featureKey: 'dashboard', propertyId: 'p1', userId: 'u1' },
      ],
      previousWeekEvents: [],
    });

    await runWeeklyRetentionReportJob(deps);

    const html = calls.sentEmails[0].html;
    // Labels are humanized (SCREAMING_SNAKE_CASE / snake_case / kebab-case →
    // Title Case) and rows no longer sit directly adjacent to their count
    // cell (a bar-chart cell sits between them), so match label ... count
    // within the same row rather than immediate <td> adjacency.
    assert.match(html, />Tool Used<\/td>[\s\S]*?>3<\/td>/);
    assert.match(html, />Page View<\/td>[\s\S]*?>1<\/td>/);
    assert.match(html, />Budget<\/td>[\s\S]*?>2<\/td>/);
    assert.match(html, />Untagged<\/td>[\s\S]*?>1<\/td>/);
  });
});
