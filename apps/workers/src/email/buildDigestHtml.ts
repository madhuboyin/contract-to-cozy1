// apps/workers/src/email/buildDigestHtml.ts
import { Notification } from '@prisma/client';
import { buildWeatherAlertCardHtml, isWeatherCardMetadata } from './buildWeatherAlertCardHtml';
import { renderEmailShell } from './emailShell';

type DigestPriority = 'SOON' | 'PLAN' | 'CONSIDER';

// Same validated status/sequential tokens used by weeklyRetentionReport.job.ts
// (see the dataviz palette reference) — kept local rather than shared since
// it's only 3 hex values.
const ACCENT_SOON = '#fab219'; // status: warning
const ACCENT_PLAN = '#2a78d6'; // sequential: blue
const ACCENT_CONSIDER = '#898781'; // ink: muted

const MAX_ITEMS_PER_SECTION = 6;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Self-contained card for one notification — a bordered box (or the
// hazard-specific weather card) rather than a plain bullet, so this reads
// the same across the immediate-send email, the daily digest, and the
// weekly brief instead of three different visual styles for the same content.
export function renderNotificationCard(n: Notification): string {
  const weather = (n.metadata as any)?.weather;
  if (isWeatherCardMetadata(weather)) {
    const card = buildWeatherAlertCardHtml({
      title: n.title,
      actionUrl: n.actionUrl,
      weather,
    });
    return `<div style="margin-bottom:12px;">${card}</div>`;
  }

  const safeTitle = escapeHtml(n.title);
  const safeMessage = escapeHtml(n.message);
  const safeUrl = n.actionUrl ? escapeHtml(n.actionUrl) : '';
  return `
    <div style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:6px;">
      <div style="padding:14px;">
        <h4 style="margin:0 0 6px;font-size:15px;color:#111;">${safeTitle}</h4>
        <p style="margin:0 0 10px;font-size:14px;color:#444;">${safeMessage}</p>
        ${n.actionUrl ? `<a href="${safeUrl}" style="font-size:14px;color:#2e7d32;text-decoration:none;">View details &rarr;</a>` : ''}
      </div>
    </div>
  `;
}

function digestPriority(notification: Notification): DigestPriority {
  const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
  const explicit = String(
    metadata.attentionPriority ??
    metadata.homeActionPriority ??
    metadata.priorityBand ??
    '',
  ).toUpperCase();

  if (explicit === 'NOW' || explicit === 'SOON' || explicit === 'HIGH') return 'SOON';
  if (explicit === 'PLAN' || explicit === 'MEDIUM') return 'PLAN';
  if (explicit === 'CONSIDER' || explicit === 'LOW') return 'CONSIDER';

  const daysUntilDue = Number(metadata.daysUntilDue);
  if (Number.isFinite(daysUntilDue)) {
    if (daysUntilDue <= 30) return 'SOON';
    if (daysUntilDue <= 90) return 'PLAN';
    return 'CONSIDER';
  }

  const category = String(
    (metadata.notificationPolicy as any)?.category ??
    metadata.category ??
    '',
  ).toUpperCase();
  if (category === 'GENERAL' || category === 'NEIGHBORHOOD') return 'CONSIDER';

  // Routine notifications without an explicit action band remain useful
  // planning context; they must not be promoted into the Soon section.
  return 'PLAN';
}

const SECTION_META: Array<{ priority: DigestPriority; title: string; description: string; accent: string }> = [
  { priority: 'SOON', title: 'Soon', description: 'Worth handling next to prevent avoidable urgency.', accent: ACCENT_SOON },
  { priority: 'PLAN', title: 'Plan', description: 'Put these on your upcoming home plan.', accent: ACCENT_PLAN },
  { priority: 'CONSIDER', title: 'Consider', description: 'Useful opportunities with no immediate deadline.', accent: ACCENT_CONSIDER },
];

// Shared by both the daily digest and the weekly brief — same Soon/Plan/
// Consider bands, capped per section so a user with a long backlog in one
// band doesn't push a whole screen of cards before the others are visible.
function renderGroupedSections(notifications: Notification[]): string {
  const grouped = new Map<DigestPriority, Notification[]>(SECTION_META.map(({ priority }) => [priority, []]));
  for (const n of notifications) {
    grouped.get(digestPriority(n))!.push(n);
  }

  return SECTION_META.map(({ priority, title, description, accent }) => {
    const items = grouped.get(priority) ?? [];
    if (items.length === 0) return '';
    const shown = items.slice(0, MAX_ITEMS_PER_SECTION);
    const rest = items.length - shown.length;
    return `
      <div style="border-left:3px solid ${accent};padding-left:14px;margin:20px 0;">
        <h3 style="margin:0 0 4px;font-size:15px;color:#111;">${title} <span style="color:#64748b;font-size:13px;font-weight:normal;">(${items.length})</span></h3>
        <p style="margin:0 0 10px;color:#64748b;font-size:13px;">${description}</p>
        ${shown.map(renderNotificationCard).join('')}
        ${rest > 0 ? `<p style="margin:8px 0 0;color:#999;font-size:12px;">+${rest} more in your dashboard.</p>` : ''}
      </div>
    `;
  }).join('');
}

export function buildDigestHtml(userName: string, notifications: Notification[]) {
  const body = `
    <p style="margin:0 0 4px;">Hi ${escapeHtml(userName)},</p>
    <p style="margin:0 0 4px;">You have <strong>${notifications.length}</strong> new update${notifications.length === 1 ? '' : 's'} from Contract to Cozy.</p>
    ${renderGroupedSections(notifications)}
  `;

  return renderEmailShell({
    title: 'Your daily updates',
    bodyHtml: body,
    footerHtml: 'You are receiving this email as part of your daily notification digest.',
  });
}

export function buildWeeklyHomeBriefHtml(userName: string, notifications: Notification[]) {
  const body = `
    <p style="margin:0 0 4px;">Hi ${escapeHtml(userName)},</p>
    <p style="margin:0 0 4px;">Here is your weekly Home Brief — <strong>${notifications.length}</strong> update${notifications.length === 1 ? '' : 's'} since last week.</p>
    ${renderGroupedSections(notifications)}
  `;

  return renderEmailShell({
    title: 'Your weekly Home Brief',
    bodyHtml: body,
    footerHtml: 'You are receiving this email as part of your weekly Home Brief.',
  });
}
