// apps/workers/src/jobs/weeklyRetentionReport.job.ts
//
// Scheduled version of apps/backend/scripts/weekly-retention-report.ts —
// same ProductAnalyticsEvent queries, emailed instead of printed to a
// console someone has to remember to open.
//
// Coverage note: this reports on events already persisted server-side.
// Frontend-only lifecycle events (property_onboarded, first_wow_moment,
// session_started, return_visit, outcome_win_generated, savings_verified)
// flow through Faro RUM into Grafana/Loki instead and are NOT included —
// query Grafana separately for those until/unless they're also emitted
// server-side.
import { prisma } from '../lib/prisma';
import { sendEmail } from '../email/email.service';
import { logger } from '../lib/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - days * DAY_MS);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function renderCountTable(rows: [string, number][]): string {
  if (rows.length === 0) {
    return '<p style="margin:0;color:#777;"><em>None</em></p>';
  }
  const items = rows
    .map(
      ([label, count]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#333;">${label}</td>` +
        `<td style="padding:4px 0;color:#333;text-align:right;">${count}</td></tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;font-size:13px;">${items}</table>`;
}

export async function runWeeklyRetentionReportJob(): Promise<void> {
  const to = process.env.RETENTION_REPORT_EMAIL;
  if (!to) {
    logger.warn('[WEEKLY-RETENTION-REPORT] RETENTION_REPORT_EMAIL not set, skipping send');
    return;
  }

  const now = new Date();
  const currentWeekStart = startOfDaysAgo(7);
  const previousWeekStart = startOfDaysAgo(14);

  const currentWeekEvents = await prisma.productAnalyticsEvent.findMany({
    where: { occurredAt: { gte: currentWeekStart, lte: now } },
    select: { eventType: true, featureKey: true, propertyId: true, userId: true },
  });

  const previousWeekEvents = await prisma.productAnalyticsEvent.findMany({
    where: { occurredAt: { gte: previousWeekStart, lt: currentWeekStart } },
    select: { propertyId: true, userId: true },
  });

  const subject = `Weekly Product Analytics — ${formatDate(currentWeekStart)} to ${formatDate(now)}`;

  if (currentWeekEvents.length === 0) {
    await sendEmail(
      to,
      subject,
      `<p>No product analytics events recorded in the last 7 days.</p>` +
        `<p style="color:#777;">(Expected until the pilot is live and the instrumented tools are actually used.)</p>`
    );
    return;
  }

  const currentProperties = new Set(currentWeekEvents.map((e) => e.propertyId).filter(Boolean));
  const currentUsers = new Set(currentWeekEvents.map((e) => e.userId).filter(Boolean));
  const previousProperties = new Set(previousWeekEvents.map((e) => e.propertyId).filter(Boolean));

  const retainedProperties = [...currentProperties].filter((id) => previousProperties.has(id));
  const retentionRate =
    previousProperties.size > 0 ? (retainedProperties.length / previousProperties.size) * 100 : null;

  const byEventType = new Map<string, number>();
  for (const e of currentWeekEvents) {
    byEventType.set(e.eventType, (byEventType.get(e.eventType) ?? 0) + 1);
  }

  const byFeature = new Map<string, number>();
  for (const e of currentWeekEvents) {
    const key = e.featureKey ?? '(none)';
    byFeature.set(key, (byFeature.get(key) ?? 0) + 1);
  }

  const sortedByCount = (m: Map<string, number>): [string, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]);

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:24px;">
<table width="640" style="background:#ffffff;border-radius:8px;">
<tr>
<td style="padding:20px;border-bottom:1px solid #eee;">
<h2 style="margin:0;color:#2e7d32;">Weekly Product Analytics</h2>
<p style="margin:4px 0 0;color:#777;font-size:13px;">${formatDate(currentWeekStart)} to ${formatDate(now)}</p>
</td>
</tr>
<tr>
<td style="padding:20px;font-size:14px;color:#333;line-height:1.6;">
<h3 style="margin:0 0 8px;">Activation &amp; Engagement</h3>
<p style="margin:0 0 4px;">Active properties this week: <strong>${currentProperties.size}</strong></p>
<p style="margin:0 0 4px;">Active users this week: <strong>${currentUsers.size}</strong></p>
<p style="margin:0 0 16px;">Total events this week: <strong>${currentWeekEvents.length}</strong></p>

<h3 style="margin:0 0 8px;">Week-over-Week Retention</h3>
<p style="margin:0 0 4px;">Active properties last week: <strong>${previousProperties.size}</strong></p>
<p style="margin:0 0 16px;">Retained into this week: <strong>${retainedProperties.length}</strong>${
    retentionRate !== null ? ` (${retentionRate.toFixed(0)}%)` : ' (no prior-week baseline)'
  }</p>

<h3 style="margin:0 0 8px;">Events by Type</h3>
${renderCountTable(sortedByCount(byEventType))}

<h3 style="margin:16px 0 8px;">Events by Feature</h3>
${renderCountTable(sortedByCount(byFeature))}

<p style="margin:16px 0 0;color:#999;font-size:12px;">
Server-side events only. Onboarding, session/return-visit, and outcome-win
metrics are frontend-only (Faro RUM → Grafana/Loki) and not included here.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;

  await sendEmail(to, subject, html);
  logger.info(
    { activeProperties: currentProperties.size, activeUsers: currentUsers.size, totalEvents: currentWeekEvents.length },
    '[WEEKLY-RETENTION-REPORT] Report sent'
  );
}
