// apps/backend/scripts/weekly-retention-report.ts
//
// Weekly activation/retention/engagement report against ProductAnalyticsEvent.
// Run manually (or on a cron) ahead of investor updates so numbers come from
// real usage data rather than a description of the analytics infrastructure.
//
// Usage: npx ts-node scripts/weekly-retention-report.ts
//
// Coverage note: this reports on events already persisted server-side
// (ProductAnalyticsEvent — currently emitted by 14 of 238 backend services,
// prioritized by pilot "wedge" tools). Frontend-only lifecycle events
// (property_onboarded, first_wow_moment, session_started, return_visit,
// outcome_win_generated, savings_verified) flow through Faro RUM into
// Grafana/Loki instead, and are NOT included in these numbers — query
// Grafana separately for those until/unless they're also emitted server-side.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - days * DAY_MS);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const now = new Date();
  const currentWeekStart = startOfDaysAgo(7);
  const previousWeekStart = startOfDaysAgo(14);

  console.log('='.repeat(72));
  console.log(`Weekly Product Analytics Report — ${formatDate(currentWeekStart)} to ${formatDate(now)}`);
  console.log('='.repeat(72));

  // ── Engagement: events this week by feature ─────────────────────────────
  const currentWeekEvents = await prisma.productAnalyticsEvent.findMany({
    where: { occurredAt: { gte: currentWeekStart, lte: now } },
    select: { eventType: true, featureKey: true, propertyId: true, userId: true },
  });

  const previousWeekEvents = await prisma.productAnalyticsEvent.findMany({
    where: { occurredAt: { gte: previousWeekStart, lt: currentWeekStart } },
    select: { propertyId: true, userId: true },
  });

  if (currentWeekEvents.length === 0) {
    console.log('\nNo product analytics events recorded in the last 7 days.');
    console.log('(Expected until the pilot is live and the instrumented tools are actually used.)');
    await prisma.$disconnect();
    return;
  }

  // ── Breadth: distinct properties/users active this week vs last ─────────
  const currentProperties = new Set(currentWeekEvents.map((e) => e.propertyId).filter(Boolean));
  const currentUsers = new Set(currentWeekEvents.map((e) => e.userId).filter(Boolean));
  const previousProperties = new Set(previousWeekEvents.map((e) => e.propertyId).filter(Boolean));

  const retainedProperties = [...currentProperties].filter((id) => previousProperties.has(id));
  const retentionRate =
    previousProperties.size > 0 ? (retainedProperties.length / previousProperties.size) * 100 : null;

  console.log('\n--- Activation & Engagement ---');
  console.log(`Active properties this week:     ${currentProperties.size}`);
  console.log(`Active users this week:          ${currentUsers.size}`);
  console.log(`Total events this week:          ${currentWeekEvents.length}`);

  console.log('\n--- Week-over-Week Retention ---');
  console.log(`Active properties last week:      ${previousProperties.size}`);
  console.log(
    `Retained into this week:          ${retainedProperties.length}` +
      (retentionRate !== null ? ` (${retentionRate.toFixed(0)}%)` : ' (no prior-week baseline)')
  );

  // ── Engagement depth: event counts by event type ─────────────────────────
  const byEventType = new Map<string, number>();
  for (const e of currentWeekEvents) {
    byEventType.set(e.eventType, (byEventType.get(e.eventType) ?? 0) + 1);
  }
  console.log('\n--- Events by Type ---');
  for (const [type, count] of [...byEventType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(28)} ${count}`);
  }

  // ── Feature/tool breadth: which tools are actually driving usage ─────────
  const byFeature = new Map<string, number>();
  for (const e of currentWeekEvents) {
    const key = e.featureKey ?? '(none)';
    byFeature.set(key, (byFeature.get(key) ?? 0) + 1);
  }
  console.log('\n--- Events by Feature ---');
  for (const [feature, count] of [...byFeature.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${feature.padEnd(28)} ${count}`);
  }

  console.log('\n' + '='.repeat(72));
  console.log(
    'Reminder: this covers server-side events only. Check Grafana/Faro for\n' +
      'onboarding, session/return-visit, and outcome-win metrics until those\n' +
      'are also emitted server-side.'
  );
  console.log('='.repeat(72));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Report failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
