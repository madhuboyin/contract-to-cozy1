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

export async function evaluateRefinanceRateMonitors(snapshot: {
  id: string; date: string; rate30yr: number; rate15yr: number; source: string; sourceRef: string | null;
}) {
  const active = await prisma.refinanceRateMonitor.findMany({ where: { status: RefinanceRateMonitorStatus.ACTIVE } });
  let triggered = 0;
  for (const monitor of active) {
    const observedRate = monitor.product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? snapshot.rate15yr : snapshot.rate30yr;
    const thresholdPct = monitor.thresholdBps / 100;
    const shouldTrigger = observedRate <= thresholdPct && monitor.lastTriggeredSnapshotId !== snapshot.id;
    if (shouldTrigger) {
      await NotificationService.create({
        userId: monitor.userId,
        deduplicationKey: `refinance-rate-monitor:${monitor.id}:${snapshot.id}`,
        type: 'REFINANCE_RATE_THRESHOLD_REACHED',
        title: 'Your mortgage-rate threshold was reached',
        message: `The governed ${monitor.product === RefinanceRateMonitorProduct.FIXED_15_YEAR ? '15-year' : '30-year'} benchmark is ${observedRate.toFixed(3)}%, ${(thresholdPct - observedRate).toFixed(3)} percentage points below your ${thresholdPct.toFixed(3)}% threshold. This threshold crossing is why you were notified; open Mortgage Refinance Radar to rerun the personalized break-even review before contacting lenders.`,
        actionUrl: `/dashboard/properties/${monitor.propertyId}/tools/mortgage-refinance-radar?from=notification&monitorId=${encodeURIComponent(monitor.id)}&snapshotId=${encodeURIComponent(snapshot.id)}`,
        entityType: 'REFINANCE_RATE_MONITOR', entityId: monitor.id,
        category: 'REFINANCE', urgency: 'MATERIAL',
        metadata: { propertyId: monitor.propertyId, monitorId: monitor.id, snapshotId: snapshot.id, benchmarkRatePct: observedRate, thresholdPct, source: snapshot.source, sourceRef: snapshot.sourceRef, observedAt: snapshot.date, why: 'GOVERNED_BENCHMARK_AT_OR_BELOW_USER_THRESHOLD', nextAction: 'RERUN_PERSONALIZED_REFINANCE_REVIEW', askQuestion: 'Is refinancing worth reviewing now based on my current mortgage and this rate snapshot?' },
      });
      triggered += 1;
    }
    await prisma.refinanceRateMonitor.update({
      where: { id: monitor.id },
      data: {
        lastEvaluatedSnapshotId: snapshot.id,
        ...(shouldTrigger ? { lastTriggeredSnapshotId: snapshot.id, lastTriggeredAt: new Date() } : {}),
      },
    });
  }
  return { evaluated: active.length, triggered };
}
