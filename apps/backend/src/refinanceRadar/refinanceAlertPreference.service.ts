import {
  NotificationCadence,
  NotificationChannel,
  NotificationSensitivity,
  RefinanceConfidenceLevel,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { RefinanceAlertPreferenceBody } from './validators/refinanceRadar.validators';
import type { RefinanceAlertReadiness } from './refinanceFreshness';
import { APIError } from '../middleware/error.middleware';

const REFINANCE_CATEGORY = 'REFINANCE';

export interface RefinanceAlertPreferenceDTO {
  homeEnabled: true;
  emailEnabled: boolean;
  pushEnabled: boolean;
  pushAvailable: boolean;
  hasActivePushSubscription: boolean;
  pushPublicKey: string | null;
  cadence: NotificationCadence;
  sensitivity: NotificationSensitivity;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  explicitEmailConsent: boolean;
  explicitPushConsent: boolean;
  externalDeliveryEnabled: boolean;
  pushDeliveryEnabled: boolean;
}

export function isRefinanceExternalDeliveryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.REFINANCE_EXTERNAL_ALERTS_ENABLED === 'true' &&
    env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED === 'true'
  );
}

export function isWebPushConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY);
}

export function isRefinancePushDeliveryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.REFINANCE_PUSH_ALERTS_ENABLED === 'true' &&
    env.WEB_PUSH_DELIVERY_ENABLED === 'true' &&
    env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED === 'true' &&
    isWebPushConfigured(env)
  );
}

export function defaultRefinanceAlertPreference(): RefinanceAlertPreferenceDTO {
  return {
    homeEnabled: true,
    emailEnabled: false,
    pushEnabled: false,
    pushAvailable: isWebPushConfigured(),
    hasActivePushSubscription: false,
    pushPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
    cadence: NotificationCadence.MUTED,
    sensitivity: NotificationSensitivity.CONSERVATIVE,
    quietStart: '21:00',
    quietEnd: '07:00',
    timezone: 'UTC',
    explicitEmailConsent: false,
    explicitPushConsent: false,
    externalDeliveryEnabled: isRefinanceExternalDeliveryEnabled(),
    pushDeliveryEnabled: isRefinancePushDeliveryEnabled(),
  };
}

type StoredRefinanceAlertPreference = {
  enabled: boolean;
  cadence: NotificationCadence;
  sensitivity: NotificationSensitivity | null;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
};

export function mapRefinanceAlertPreference(
  preference: StoredRefinanceAlertPreference | null,
  pushPreference: StoredRefinanceAlertPreference | null = null,
  hasActivePushSubscription = false,
): RefinanceAlertPreferenceDTO {
  const defaults = defaultRefinanceAlertPreference();
  const emailOptedIn = Boolean(
    preference?.enabled &&
    preference.cadence !== NotificationCadence.MUTED,
  );
  const pushOptedIn = Boolean(
    pushPreference?.enabled &&
    pushPreference.cadence !== NotificationCadence.MUTED &&
    hasActivePushSubscription,
  );
  const primary = preference ?? pushPreference;
  return {
    ...defaults,
    homeEnabled: true,
    emailEnabled: emailOptedIn,
    pushEnabled: pushOptedIn,
    hasActivePushSubscription,
    cadence: primary?.cadence ?? defaults.cadence,
    sensitivity:
      primary?.sensitivity ?? NotificationSensitivity.CONSERVATIVE,
    quietStart: primary?.quietStart ?? defaults.quietStart,
    quietEnd: primary?.quietEnd ?? defaults.quietEnd,
    timezone: primary?.timezone ?? defaults.timezone,
    explicitEmailConsent: emailOptedIn,
    explicitPushConsent: pushOptedIn,
  };
}

export async function getRefinanceAlertPreference(
  userId: string,
  propertyId: string,
): Promise<RefinanceAlertPreferenceDTO> {
  const [preferences, activeSubscription] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: {
        userId,
        scopeKey: `PROPERTY:${propertyId}`,
        category: REFINANCE_CATEGORY,
      },
    }),
    prisma.pushSubscription.findFirst({
      where: { userId, revokedAt: null },
      select: { id: true },
    }),
  ]);
  return mapRefinanceAlertPreference(
    preferences.find((item) => item.channel === NotificationChannel.EMAIL) ?? null,
    preferences.find((item) => item.channel === NotificationChannel.PUSH) ?? null,
    Boolean(activeSubscription),
  );
}

export async function updateRefinanceAlertPreference(
  userId: string,
  propertyId: string,
  input: RefinanceAlertPreferenceBody,
): Promise<RefinanceAlertPreferenceDTO> {
  if (input.pushEnabled) {
    if (!isWebPushConfigured()) {
      throw new APIError(
        'Push alerts are not configured.',
        409,
        'WEB_PUSH_NOT_CONFIGURED',
      );
    }
    const activeSubscription = await prisma.pushSubscription.findFirst({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    if (!activeSubscription) {
      throw new APIError(
        'Allow browser notifications on this device before enabling push alerts.',
        409,
        'WEB_PUSH_SUBSCRIPTION_REQUIRED',
      );
    }
  }

  const scopeKey = `PROPERTY:${propertyId}`;
  const preferenceData = {
    userId,
    scopeKey,
    propertyId,
    category: REFINANCE_CATEGORY,
    cadence: input.cadence,
    sensitivity: input.sensitivity,
    quietStart: input.quietStart ?? null,
    quietEnd: input.quietEnd ?? null,
    timezone: input.timezone,
  };
  await prisma.$transaction(
    [
      {
        channel: NotificationChannel.EMAIL,
        enabled: input.emailEnabled,
      },
      {
        channel: NotificationChannel.PUSH,
        enabled: input.pushEnabled,
      },
    ].map(({ channel, enabled }) =>
      prisma.notificationPreference.upsert({
        where: {
          userId_scopeKey_category_channel: {
            userId,
            scopeKey,
            category: REFINANCE_CATEGORY,
            channel,
          },
        },
        create: {
          ...preferenceData,
          channel,
          enabled,
        },
        update: {
          enabled,
          cadence: input.cadence,
          sensitivity: input.sensitivity,
          quietStart: input.quietStart ?? null,
          quietEnd: input.quietEnd ?? null,
          timezone: input.timezone,
        },
      }),
    ),
  );
  return getRefinanceAlertPreference(userId, propertyId);
}

export async function registerRefinancePushSubscription(
  userId: string,
  input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  userAgent?: string,
): Promise<void> {
  if (!isWebPushConfigured()) {
    throw new APIError(
      'Push alerts are not configured.',
      409,
      'WEB_PUSH_NOT_CONFIGURED',
    );
  }
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw new APIError(
      'This browser subscription is already registered to another account.',
      409,
      'WEB_PUSH_SUBSCRIPTION_CONFLICT',
    );
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 500),
    },
    update: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 500),
      revokedAt: null,
    },
  });
}

export async function revokeRefinancePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await prisma.pushSubscription.updateMany({
    where: { userId, endpoint, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const CONFIDENCE_RANK: Record<RefinanceConfidenceLevel, number> = {
  WEAK: 1,
  GOOD: 2,
  STRONG: 3,
};

const MINIMUM_CONFIDENCE: Record<
  NotificationSensitivity,
  RefinanceConfidenceLevel
> = {
  CONSERVATIVE: RefinanceConfidenceLevel.STRONG,
  BALANCED: RefinanceConfidenceLevel.GOOD,
  EARLY: RefinanceConfidenceLevel.WEAK,
};

export function decideRefinanceExternalAlert(input: {
  preference: RefinanceAlertPreferenceDTO;
  alertReadiness: RefinanceAlertReadiness;
  confidenceLevel: RefinanceConfidenceLevel | null;
  deliveryEnabled: boolean;
  cooldownActive?: boolean;
}): {
  eligible: boolean;
  suppressionReason:
    | 'DELIVERY_DISABLED'
    | 'NO_EXPLICIT_CONSENT'
    | 'INPUTS_NOT_CURRENT'
    | 'CONFIDENCE_BELOW_PREFERENCE'
    | 'COOLDOWN_ACTIVE'
    | null;
} {
  if (!input.deliveryEnabled) {
    return { eligible: false, suppressionReason: 'DELIVERY_DISABLED' };
  }
  if (
    !(
      (input.preference.explicitEmailConsent &&
        input.preference.emailEnabled) ||
      (input.preference.explicitPushConsent &&
        input.preference.pushEnabled)
    )
  ) {
    return { eligible: false, suppressionReason: 'NO_EXPLICIT_CONSENT' };
  }
  if (input.alertReadiness !== 'READY') {
    return { eligible: false, suppressionReason: 'INPUTS_NOT_CURRENT' };
  }
  if (input.cooldownActive) {
    return { eligible: false, suppressionReason: 'COOLDOWN_ACTIVE' };
  }
  const minimum = MINIMUM_CONFIDENCE[input.preference.sensitivity];
  if (
    !input.confidenceLevel ||
    CONFIDENCE_RANK[input.confidenceLevel] < CONFIDENCE_RANK[minimum]
  ) {
    return {
      eligible: false,
      suppressionReason: 'CONFIDENCE_BELOW_PREFERENCE',
    };
  }
  return { eligible: true, suppressionReason: null };
}
