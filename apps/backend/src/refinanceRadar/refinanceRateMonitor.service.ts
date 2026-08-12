import {
  NotificationCadence,
  NotificationChannel,
  NotificationSensitivity,
  RefinanceRateMonitorProduct,
  RefinanceRateMonitorStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { NotificationService } from '../services/notification.service';
import { getRefinanceAlertPreference, updateRefinanceAlertPreference } from './refinanceAlertPreference.service';
import { resolvePropertyAccess } from '../services/propertyAccess.service';
import { createAskNotificationContinuation } from '../services/ask/askNotificationContinuation.service';
import { logger } from '../lib/logger';

export interface RefinanceRateMonitorDTO {
  id: string;
  propertyId: string;
  product: RefinanceRateMonitorProduct;
  thresholdPct: number;
  channel: NotificationChannel;
  cadence: NotificationCadence;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  status: RefinanceRateMonitorStatus;
  consentedAt: string;
  lastTriggeredAt: string | null;
  updatedAt: string;
}

function toDTO(monitor: {
  id: string; propertyId: string; product: RefinanceRateMonitorProduct; thresholdBps: number;
  channel: NotificationChannel; cadence: NotificationCadence; quietStart: string | null;
  quietEnd: string | null; timezone: string; status: RefinanceRateMonitorStatus;
  consentedAt: Date; lastTriggeredAt: Date | null; updatedAt: Date;
}): RefinanceRateMonitorDTO {
  return {
    id: monitor.id, propertyId: monitor.propertyId, product: monitor.product,
    thresholdPct: monitor.thresholdBps / 100, channel: monitor.channel, cadence: monitor.cadence,
    quietStart: monitor.quietStart, quietEnd: monitor.quietEnd, timezone: monitor.timezone,
    status: monitor.status, consentedAt: monitor.consentedAt.toISOString(),
    lastTriggeredAt: monitor.lastTriggeredAt?.toISOString() ?? null, updatedAt: monitor.updatedAt.toISOString(),
  };
}

export async function assertRefinanceRateMonitorEligibility(userId: string, propertyId: string) {
  const preference = await getRefinanceAlertPreference(userId, propertyId);
  if (!preference.recipientInRolloutCohort) {
    throw new APIError('Refinance email alerts are not available for this account yet.', 409, 'REFINANCE_ALERT_ROLLOUT_UNAVAILABLE');
  }
  if (!preference.externalDeliveryEnabled) {
    throw new APIError('Refinance email delivery is currently unavailable.', 409, 'REFINANCE_ALERT_DELIVERY_UNAVAILABLE');
  }
  return preference;
}

export async function createOrUpdateRefinanceRateMonitor(input: {
  userId: string;
  propertyId: string;
  thresholdPct: number;
  product: RefinanceRateMonitorProduct;
  cadence: NotificationCadence;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
}) {
  await assertRefinanceRateMonitorEligibility(input.userId, input.propertyId);
  await updateRefinanceAlertPreference(input.userId, input.propertyId, {
    emailEnabled: true,
    pushEnabled: false,
    cadence: input.cadence,
    sensitivity: NotificationSensitivity.EARLY,
    quietStart: input.quietStart,
    quietEnd: input.quietEnd,
    timezone: input.timezone,
  });
  const monitor = await prisma.refinanceRateMonitor.upsert({
    where: { userId_propertyId_product: { userId: input.userId, propertyId: input.propertyId, product: input.product } },
    create: {
      userId: input.userId, propertyId: input.propertyId, product: input.product,
      thresholdBps: Math.round(input.thresholdPct * 100), channel: NotificationChannel.EMAIL,
      cadence: input.cadence, quietStart: input.quietStart, quietEnd: input.quietEnd,
      timezone: input.timezone, status: RefinanceRateMonitorStatus.ACTIVE, consentedAt: new Date(),
    },
    update: {
      thresholdBps: Math.round(input.thresholdPct * 100), channel: NotificationChannel.EMAIL,
      cadence: input.cadence, quietStart: input.quietStart, quietEnd: input.quietEnd,
      timezone: input.timezone, status: RefinanceRateMonitorStatus.ACTIVE, consentedAt: new Date(),
      confirmationVersion: { increment: 1 },
    },
  });
  return toDTO(monitor);
}

export async function updateRefinanceRateMonitorStatus(userId: string, monitorId: string, status: RefinanceRateMonitorStatus) {
  const existing = await prisma.refinanceRateMonitor.findFirst({ where: { id: monitorId, userId } });
  if (!existing) throw new APIError('Rate monitor not found.', 404, 'REFINANCE_RATE_MONITOR_NOT_FOUND');
  if (!await resolvePropertyAccess(userId, existing.propertyId)) throw new APIError('Property access denied.', 403, 'PROPERTY_ACCESS_DENIED');
  const monitor = await prisma.refinanceRateMonitor.update({ where: { id: monitorId }, data: { status } });
  return toDTO(monitor);
}

export async function getRefinanceRateMonitor(userId: string, monitorId: string) {
  const monitor = await prisma.refinanceRateMonitor.findFirst({ where: { id: monitorId, userId } });
  if (!monitor) throw new APIError('Rate monitor not found.', 404, 'REFINANCE_RATE_MONITOR_NOT_FOUND');
  if (!await resolvePropertyAccess(userId, monitor.propertyId)) throw new APIError('Property access denied.', 403, 'PROPERTY_ACCESS_DENIED');
  return toDTO(monitor);
}

// §17.2 requires monitors to "respect ... cooldown, deduplication, and
// materiality rules." Snapshots arrive weekly (see workerJobRegistry.ts);
// deduplicating only against the exact previous snapshot id meant a
// monitor re-fired every single week indefinitely as long as the rate
// stayed under threshold, with no floor on notification frequency and no
// requirement that the rate actually moved. A cooldown puts a minimum
// spacing between notifications regardless of how often snapshots land;
// materiality additionally requires the rate to have dropped meaningfully
// further since the last notification, not merely stayed under threshold.
const REFINANCE_MONITOR_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const REFINANCE_MONITOR_MATERIALITY_BPS = 10;

export async function evaluateRefinanceRateMonitors(snapshot: {
  id: string; date: string; rate30yr: number; rate15yr: number; source: string; sourceRef: string | null;
}) {
  const active = await prisma.refinanceRateMonitor.findMany({ where: { status: RefinanceRateMonitorStatus.ACTIVE } });
  let triggered = 0;
  for (const monitor of active) {
    const observedRate = monitor.product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? snapshot.rate15yr : snapshot.rate30yr;
    const thresholdPct = monitor.thresholdBps / 100;
    const observedRateBps = Math.round(observedRate * 100);
    const underThreshold = observedRate <= thresholdPct && monitor.lastTriggeredSnapshotId !== snapshot.id;
    const neverTriggered = !monitor.lastTriggeredAt;
    const cooldownElapsed = neverTriggered || (Date.now() - monitor.lastTriggeredAt!.getTime()) >= REFINANCE_MONITOR_COOLDOWN_MS;
    const materiallyLower = neverTriggered || monitor.lastTriggeredRateBps == null
      || (monitor.lastTriggeredRateBps - observedRateBps) >= REFINANCE_MONITOR_MATERIALITY_BPS;
    const shouldTrigger = underThreshold && (neverTriggered || (cooldownElapsed && materiallyLower));
    if (shouldTrigger) {
      const domainActionUrl = `/dashboard/properties/${monitor.propertyId}/tools/mortgage-refinance-radar?from=notification&monitorId=${encodeURIComponent(monitor.id)}&snapshotId=${encodeURIComponent(snapshot.id)}`;
      const productLabel = monitor.product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? '15-year' : '30-year';
      const difference = thresholdPct - observedRate;
      let continuation: Awaited<ReturnType<typeof createAskNotificationContinuation>> | null = null;
      try {
        continuation = await createAskNotificationContinuation({
          userId: monitor.userId,
          propertyId: monitor.propertyId,
          triggerKey: `refinance-rate-monitor:${monitor.id}:${snapshot.id}`,
          operationId: 'REFINANCE_ANALYSIS',
          question: `My ${productLabel} mortgage benchmark reached ${observedRate.toFixed(3)}%. What changed, why does it matter, and what should I do next?`,
          reasonCode: 'REFINANCE_RATE_MONITOR_TRIGGERED',
          title: 'Your mortgage-rate threshold was reached',
          body: `The governed ${productLabel} benchmark is ${observedRate.toFixed(3)}%, ${difference.toFixed(3)} percentage points below your ${thresholdPct.toFixed(3)}% threshold. This is a benchmark signal, not a lender offer. Rerun the personalized break-even review using your current mortgage before contacting lenders.`,
          tone: 'POSITIVE',
          details: [
            { label: 'What changed', value: `${productLabel} benchmark reached ${observedRate.toFixed(3)}%` },
            { label: 'Why it matters', value: `It crossed your ${thresholdPct.toFixed(3)}% review threshold by ${difference.toFixed(3)} percentage points` },
            { label: 'Recommended next action', value: 'Rerun the personalized refinance and break-even review with current mortgage facts' },
            { label: 'Source', value: `${snapshot.source}${snapshot.date ? ` · ${snapshot.date}` : ''}` },
          ],
          domainAction: { id: 'open-refinance-radar', label: 'Open Mortgage Refinance Radar', href: domainActionUrl },
          parameters: { monitorId: monitor.id, snapshotId: snapshot.id, benchmarkRatePct: observedRate, thresholdPct, source: snapshot.source, sourceRef: snapshot.sourceRef, observedAt: snapshot.date },
          suggestions: ['Is refinancing worth reviewing now?', 'What mortgage details affect my break-even point?'],
        });
      } catch (error) {
        logger.error({ err: error, monitorId: monitor.id, snapshotId: snapshot.id }, '[refinance-rate-monitor] Failed to create Ask continuation');
      }
      await NotificationService.create({
        userId: monitor.userId,
        deduplicationKey: `refinance-rate-monitor:${monitor.id}:${snapshot.id}`,
        type: 'REFINANCE_RATE_THRESHOLD_REACHED',
        title: 'Your mortgage-rate threshold was reached',
        message: `The governed ${productLabel} benchmark is ${observedRate.toFixed(3)}%, ${difference.toFixed(3)} percentage points below your ${thresholdPct.toFixed(3)}% threshold. Open Ask to see what changed, why it matters, and the recommended review step.`,
        actionUrl: continuation?.actionUrl ?? domainActionUrl,
        entityType: 'REFINANCE_RATE_MONITOR', entityId: monitor.id,
        category: 'REFINANCE', urgency: 'MATERIAL',
        metadata: { propertyId: monitor.propertyId, monitorId: monitor.id, snapshotId: snapshot.id, benchmarkRatePct: observedRate, thresholdPct, source: snapshot.source, sourceRef: snapshot.sourceRef, observedAt: snapshot.date, why: 'GOVERNED_BENCHMARK_AT_OR_BELOW_USER_THRESHOLD', nextAction: 'RERUN_PERSONALIZED_REFINANCE_REVIEW', askExecutionId: continuation?.executionId, askSessionId: continuation?.sessionId, domainActionUrl },
      });
      triggered += 1;
    }
    await prisma.refinanceRateMonitor.update({
      where: { id: monitor.id },
      data: {
        lastEvaluatedSnapshotId: snapshot.id,
        ...(shouldTrigger ? { lastTriggeredSnapshotId: snapshot.id, lastTriggeredAt: new Date(), lastTriggeredRateBps: observedRateBps } : {}),
      },
    });
  }
  return { evaluated: active.length, triggered };
}
