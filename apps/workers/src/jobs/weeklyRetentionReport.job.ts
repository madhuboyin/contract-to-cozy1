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
import { logger, AppLogger } from '../lib/logger';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface WeeklyRetentionReportDeps {
  prisma: Pick<typeof prisma, 'productAnalyticsEvent'>;
  sendEmail: typeof sendEmail;
  logger: AppLogger;
}

const defaultDeps: WeeklyRetentionReportDeps = { prisma, sendEmail, logger };

const DAY_MS = 24 * 60 * 60 * 1000;

// Chart chrome/status tokens, per the dataviz palette reference — kept as
// plain hex (no CSS custom properties/dark-mode media queries) because
// email clients don't reliably support either.
const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const GRIDLINE = '#e1e0d9';
const BAR_FILL = '#2a78d6'; // sequential hue, single series (magnitude only)
const DELTA_GOOD = '#006300';
const DELTA_BAD = '#d03b3b';
const STATUS_GOOD = '#0ca30c';
const STATUS_WARNING = '#fab219';
const STATUS_CRITICAL = '#d03b3b';

function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - days * DAY_MS);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Event-type enum values and featureKey slugs come from two different
// naming conventions (SCREAMING_SNAKE_CASE for event types; a mix of
// snake_case and kebab-case for feature keys, since those are populated by
// two separate taxonomies — see analytics/taxonomy.ts and
// toolLifecycle.contract.ts). Group on a case/separator-insensitive key so
// e.g. "status_board" and "status-board" land in one row instead of two,
// and display a human-friendly label either way.
function groupKeyFor(raw: string): string {
  return raw.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function humanizeKey(raw: string): string {
  if (raw === '(none)') return 'Untagged';
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function groupedSortedRows(counts: Map<string, number>): [string, number][] {
  const grouped = new Map<string, { label: string; count: number }>();
  for (const [raw, count] of counts) {
    const key = groupKeyFor(raw);
    const existing = grouped.get(key);
    if (existing) {
      existing.count += count;
    } else {
      grouped.set(key, { label: humanizeKey(raw), count });
    }
  }
  return [...grouped.values()]
    .map((v): [string, number] => [v.label, v.count])
    .sort((a, b) => b[1] - a[1]);
}

interface Delta {
  arrow: string;
  text: string;
  color: string;
}

function weekOverWeekDelta(current: number, previous: number): Delta | null {
  if (previous === 0) return null;
  const changePct = ((current - previous) / previous) * 100;
  if (changePct === 0) return { arrow: '⬜', text: 'flat vs last week', color: INK_MUTED };
  const arrow = changePct > 0 ? '▲' : '▼';
  const color = changePct > 0 ? DELTA_GOOD : DELTA_BAD;
  return { arrow, text: `${Math.abs(changePct).toFixed(0)}% vs last week`, color };
}

function renderStatTile(label: string, value: number, delta: Delta | null, isLast: boolean): string {
  const border = isLast ? '' : `border-right:1px solid ${GRIDLINE};`;
  const deltaHtml = delta
    ? `<div style="font-size:12px;color:${delta.color};margin-top:4px;">${delta.arrow} ${delta.text}</div>`
    : `<div style="font-size:12px;color:${INK_MUTED};margin-top:4px;">no baseline</div>`;
  return (
    `<td width="33%" style="padding:14px 8px;text-align:center;${border}">` +
    `<div style="font-size:26px;font-weight:bold;color:${INK_PRIMARY};">${value}</div>` +
    `<div style="font-size:12px;color:${INK_SECONDARY};margin-top:2px;">${label}</div>` +
    deltaHtml +
    `</td>`
  );
}

function renderRetentionCallout(retainedCount: number, previousTotal: number, rate: number | null): string {
  let statusColor = INK_MUTED;
  let bg = '#f5f5f4';
  let statusLabel = 'No baseline';
  if (rate !== null) {
    if (rate < 25) {
      statusColor = STATUS_CRITICAL;
      bg = '#fdecea';
      statusLabel = 'Critical';
    } else if (rate < 50) {
      statusColor = STATUS_WARNING;
      bg = '#fff8e6';
      statusLabel = 'Needs attention';
    } else {
      statusColor = STATUS_GOOD;
      bg = '#eaf7ea';
      statusLabel = 'Healthy';
    }
  }
  const rateText = rate === null ? '—' : `${rate.toFixed(0)}%`;
  const sub =
    previousTotal === 0
      ? 'No properties were active last week — nothing to compare against yet.'
      : `${retainedCount} of ${previousTotal} properties active last week came back this week.`;

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:6px;">
<tr><td style="padding:16px 20px;">
<div style="font-size:11px;color:${INK_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Week-over-Week Retention</div>
<table cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>
<td style="font-size:32px;font-weight:bold;color:${INK_PRIMARY};padding-right:10px;">${rateText}</td>
<td style="font-size:13px;color:${statusColor};">&#9679; <strong>${statusLabel}</strong></td>
</tr></table>
<div style="font-size:13px;color:${INK_SECONDARY};margin-top:6px;">${sub}</div>
</td></tr>
</table>`;
}

function renderBarChart(rows: [string, number][], topN: number): string {
  const top = rows.slice(0, topN);
  const rest = rows.slice(topN);
  const maxCount = top.length > 0 ? top[0][1] : 0;

  const barRows = top
    .map(([label, count]) => {
      const pct = maxCount > 0 ? Math.max(4, Math.round((count / maxCount) * 100)) : 0;
      return (
        `<tr>` +
        `<td style="padding:5px 10px 5px 0;font-size:13px;color:${INK_PRIMARY};white-space:nowrap;">${label}</td>` +
        `<td style="padding:5px 0;width:100%;">` +
        `<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>` +
        `<td style="width:${pct}%;background:${BAR_FILL};height:8px;font-size:1px;line-height:8px;">&nbsp;</td>` +
        `<td style="width:${100 - pct}%;background:${GRIDLINE};height:8px;font-size:1px;line-height:8px;">&nbsp;</td>` +
        `</tr></table>` +
        `</td>` +
        `<td style="padding:5px 0 5px 10px;font-size:13px;color:${INK_PRIMARY};text-align:right;white-space:nowrap;">${count}</td>` +
        `</tr>`
      );
    })
    .join('');

  const restLine =
    rest.length > 0
      ? `<p style="margin:8px 0 0;font-size:12px;color:${INK_MUTED};">+${rest.length} more (${rest.reduce((s, [, c]) => s + c, 0)} events)</p>`
      : '';

  return `<table width="100%" cellpadding="0" cellspacing="0">${barRows}</table>${restLine}`;
}

export async function runWeeklyRetentionReportJob(deps: WeeklyRetentionReportDeps = defaultDeps): Promise<void> {
  const { prisma, sendEmail, logger } = deps;
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
  const previousUsers = new Set(previousWeekEvents.map((e) => e.userId).filter(Boolean));

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

  const eventTypeRows = groupedSortedRows(byEventType);
  const featureRows = groupedSortedRows(byFeature);

  const propertiesDelta = weekOverWeekDelta(currentProperties.size, previousProperties.size);
  const usersDelta = weekOverWeekDelta(currentUsers.size, previousUsers.size);
  const eventsDelta = weekOverWeekDelta(currentWeekEvents.length, previousWeekEvents.length);

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
<td style="padding:20px 12px;border-bottom:1px solid #eee;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
${renderStatTile('Active Properties', currentProperties.size, propertiesDelta, false)}
${renderStatTile('Active Users', currentUsers.size, usersDelta, false)}
${renderStatTile('Total Events', currentWeekEvents.length, eventsDelta, true)}
</tr></table>
</td>
</tr>
<tr>
<td style="padding:20px;">
${renderRetentionCallout(retainedProperties.length, previousProperties.size, retentionRate)}

<h3 style="margin:20px 0 8px;font-size:14px;color:${INK_PRIMARY};">Top Event Types</h3>
${renderBarChart(eventTypeRows, 6)}

<h3 style="margin:20px 0 8px;font-size:14px;color:${INK_PRIMARY};">Top Features</h3>
${renderBarChart(featureRows, 8)}

<p style="margin:20px 0 0;color:#999;font-size:12px;">
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
