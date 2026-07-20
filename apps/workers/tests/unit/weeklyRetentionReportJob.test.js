// apps/workers/tests/unit/weeklyRetentionReportJob.test.js
//
// W4 item 4: runWeeklyRetentionReportJob had no dedicated test. Covers the
// RETENTION_REPORT_EMAIL skip gate, the zero-events short message, and the
// week-over-week retention-rate math (including the no-prior-week-baseline
// edge case).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ currentWeekEvents = [], previousWeekEvents = [] }) {
  const calls = { sentEmails: [] };

  const prismaMock = {
    productAnalyticsEvent: {
      findMany: async ({ where }) => {
        // Distinguish the two calls by their date-range shape: the current-week
        // query uses `lte`, the previous-week query uses `lt`.
        return where.occurredAt.lte !== undefined ? currentWeekEvents : previousWeekEvents;
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const emailPath = require.resolve('../../src/email/email.service.ts');
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
      sendEmail: async (to, subject, html) => {
        calls.sentEmails.push({ to, subject, html });
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/weeklyRetentionReport.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
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
    const { runWeeklyRetentionReportJob, calls } = loadJob({});

    await runWeeklyRetentionReportJob();

    assert.equal(calls.sentEmails.length, 0);
  });
});

test('sends a "no events" message when there were zero events this week', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { runWeeklyRetentionReportJob, calls } = loadJob({ currentWeekEvents: [] });

    await runWeeklyRetentionReportJob();

    assert.equal(calls.sentEmails.length, 1);
    assert.match(calls.sentEmails[0].html, /No product analytics events recorded/);
  });
});

test('computes week-over-week retention rate from properties active in both weeks', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { runWeeklyRetentionReportJob, calls } = loadJob({
      currentWeekEvents: [
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'property-1', userId: 'user-1' },
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'property-2', userId: 'user-2' },
      ],
      previousWeekEvents: [
        { propertyId: 'property-1', userId: 'user-1' },
        { propertyId: 'property-3', userId: 'user-3' },
      ],
    });

    await runWeeklyRetentionReportJob();

    const html = calls.sentEmails[0].html;
    assert.match(html, /Active properties last week: <strong>2<\/strong>/);
    // property-1 is the only property active in both weeks → 1 retained / 2 previous = 50%
    assert.match(html, /Retained into this week: <strong>1<\/strong> \(50%\)/);
  });
});

test('reports "no prior-week baseline" instead of a bogus 0%/NaN% when there were zero prior-week properties', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { runWeeklyRetentionReportJob, calls } = loadJob({
      currentWeekEvents: [{ eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'property-1', userId: 'user-1' }],
      previousWeekEvents: [],
    });

    await runWeeklyRetentionReportJob();

    assert.match(calls.sentEmails[0].html, /no prior-week baseline/);
  });
});

test('groups events by type and by feature correctly', async () => {
  await withEnv({ RETENTION_REPORT_EMAIL: 'ops@example.com' }, async () => {
    const { runWeeklyRetentionReportJob, calls } = loadJob({
      currentWeekEvents: [
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'p1', userId: 'u1' },
        { eventType: 'TOOL_USED', featureKey: 'budget', propertyId: 'p2', userId: 'u2' },
        { eventType: 'TOOL_USED', featureKey: null, propertyId: 'p3', userId: 'u3' },
        { eventType: 'PAGE_VIEW', featureKey: 'dashboard', propertyId: 'p1', userId: 'u1' },
      ],
      previousWeekEvents: [],
    });

    await runWeeklyRetentionReportJob();

    const html = calls.sentEmails[0].html;
    assert.match(html, /TOOL_USED<\/td><td[^>]*>3/);
    assert.match(html, /PAGE_VIEW<\/td><td[^>]*>1/);
    assert.match(html, /budget<\/td><td[^>]*>2/);
    assert.match(html, /\(none\)<\/td><td[^>]*>1/);
  });
});
