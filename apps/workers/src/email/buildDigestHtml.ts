// apps/workers/src/email/buildDigestHtml.ts
import { Notification } from '@prisma/client';
import { buildWeatherAlertCardHtml, isWeatherCardMetadata } from './buildWeatherAlertCardHtml';

type DigestPriority = 'SOON' | 'PLAN' | 'CONSIDER';

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNotification(n: Notification): string {
  const weather = (n.metadata as any)?.weather;
  if (isWeatherCardMetadata(weather)) {
    const card = buildWeatherAlertCardHtml({
      title: n.title,
      actionUrl: n.actionUrl,
      weather,
    });
    return `<li style="margin-bottom: 12px; list-style: none;">${card}</li>`;
  }

  const safeTitle = escapeHtml(n.title);
  const safeMessage = escapeHtml(n.message);
  const safeUrl = n.actionUrl ? escapeHtml(n.actionUrl) : '';
  return `
    <li style="margin-bottom: 12px;">
      <strong>${safeTitle}</strong><br />
      <span>${safeMessage}</span>
      ${n.actionUrl ? `<br /><a href="${safeUrl}">View details</a>` : ''}
    </li>
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

export function buildDigestHtml(userName: string, notifications: Notification[]) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Hi ${escapeHtml(userName)},</h2>
      <p>You have ${notifications.length} new updates from <b>Contract to Cozy</b>:</p>
      <ul style="padding-left: 16px;">${notifications.map(renderNotification).join('')}</ul>
      <hr />
      <p style="font-size: 12px; color: #666;">
        You are receiving this email as part of your daily notification digest.
      </p>
    </div>
  `;
}

export function buildWeeklyHomeBriefHtml(userName: string, notifications: Notification[]) {
  const sections: Array<{
    priority: DigestPriority;
    title: string;
    description: string;
  }> = [
    { priority: 'SOON', title: 'Soon', description: 'Worth handling next to prevent avoidable urgency.' },
    { priority: 'PLAN', title: 'Plan', description: 'Put these on your upcoming home plan.' },
    { priority: 'CONSIDER', title: 'Consider', description: 'Useful opportunities with no immediate deadline.' },
  ];

  const grouped = new Map<DigestPriority, Notification[]>(
    sections.map(({ priority }) => [priority, []]),
  );
  for (const notification of notifications) {
    grouped.get(digestPriority(notification))!.push(notification);
  }

  const sectionHtml = sections
    .map(({ priority, title, description }) => {
      const items = grouped.get(priority) ?? [];
      if (items.length === 0) return '';
      return `
        <section style="margin: 24px 0;">
          <h3 style="margin-bottom: 4px;">${title} <span style="color: #64748b; font-size: 14px;">(${items.length})</span></h3>
          <p style="margin-top: 0; color: #64748b; font-size: 14px;">${description}</p>
          <ul style="padding-left: 16px;">${items.map(renderNotification).join('')}</ul>
        </section>
      `;
    })
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Hi ${escapeHtml(userName)},</h2>
      <p>Here is your weekly Home Brief from <b>Contract to Cozy</b>.</p>
      ${sectionHtml}
      <hr />
      <p style="font-size: 12px; color: #666;">
        You are receiving this email as part of your weekly Home Brief.
      </p>
    </div>
  `;
}
