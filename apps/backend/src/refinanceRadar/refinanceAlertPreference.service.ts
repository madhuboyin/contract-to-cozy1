import {
  NotificationCadence,
  NotificationChannel,
  NotificationSensitivity,
  RefinanceConfidenceLevel,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { RefinanceAlertPreferenceBody } from './validators/refinanceRadar.validators';
import type { RefinanceAlertReadiness } from './refinanceFreshness';

const REFINANCE_CATEGORY = 'REFINANCE';

export interface RefinanceAlertPreferenceDTO {
  homeEnabled: true;
  emailEnabled: boolean;
  pushAvailable: false;
  cadence: NotificationCadence;
  sensitivity: NotificationSensitivity;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  explicitEmailConsent: boolean;
  externalDeliveryEnabled: false;
}

const DEFAULT_PREFERENCE: RefinanceAlertPreferenceDTO = {
  homeEnabled: true,
  emailEnabled: false,
  pushAvailable: false,
  cadence: NotificationCadence.MUTED,
  sensitivity: NotificationSensitivity.CONSERVATIVE,
  quietStart: '21:00',
  quietEnd: '07:00',
  timezone: 'UTC',
  explicitEmailConsent: false,
  externalDeliveryEnabled: false,
};

export function defaultRefinanceAlertPreference(): RefinanceAlertPreferenceDTO {
  return { ...DEFAULT_PREFERENCE };
}

export async function getRefinanceAlertPreference(
  userId: string,
  propertyId: string,
): Promise<RefinanceAlertPreferenceDTO> {
  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId_scopeKey_category_channel: {
        userId,
        scopeKey: `PROPERTY:${propertyId}`,
        category: REFINANCE_CATEGORY,
        channel: NotificationChannel.EMAIL,
      },
    },
  });
  if (!preference) return defaultRefinanceAlertPreference();
  return {
    homeEnabled: true,
    emailEnabled:
      preference.enabled && preference.cadence !== NotificationCadence.MUTED,
    pushAvailable: false,
    cadence: preference.cadence,
    sensitivity:
      preference.sensitivity ?? NotificationSensitivity.CONSERVATIVE,
    quietStart: preference.quietStart,
    quietEnd: preference.quietEnd,
    timezone: preference.timezone,
    explicitEmailConsent:
      preference.enabled && preference.cadence !== NotificationCadence.MUTED,
    externalDeliveryEnabled: false,
  };
}

export async function updateRefinanceAlertPreference(
  userId: string,
  propertyId: string,
  input: RefinanceAlertPreferenceBody,
): Promise<RefinanceAlertPreferenceDTO> {
  await prisma.notificationPreference.upsert({
    where: {
      userId_scopeKey_category_channel: {
        userId,
        scopeKey: `PROPERTY:${propertyId}`,
        category: REFINANCE_CATEGORY,
        channel: NotificationChannel.EMAIL,
      },
    },
    create: {
      userId,
      scopeKey: `PROPERTY:${propertyId}`,
      propertyId,
      category: REFINANCE_CATEGORY,
      channel: NotificationChannel.EMAIL,
      enabled: input.emailEnabled,
      cadence: input.cadence,
      sensitivity: input.sensitivity,
      quietStart: input.quietStart ?? null,
      quietEnd: input.quietEnd ?? null,
      timezone: input.timezone,
    },
    update: {
      enabled: input.emailEnabled,
      cadence: input.cadence,
      sensitivity: input.sensitivity,
      quietStart: input.quietStart ?? null,
      quietEnd: input.quietEnd ?? null,
      timezone: input.timezone,
    },
  });
  return getRefinanceAlertPreference(userId, propertyId);
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
}): {
  eligible: boolean;
  suppressionReason:
    | 'DELIVERY_DISABLED'
    | 'NO_EXPLICIT_CONSENT'
    | 'INPUTS_NOT_CURRENT'
    | 'CONFIDENCE_BELOW_PREFERENCE'
    | null;
} {
  if (!input.deliveryEnabled) {
    return { eligible: false, suppressionReason: 'DELIVERY_DISABLED' };
  }
  if (!input.preference.explicitEmailConsent || !input.preference.emailEnabled) {
    return { eligible: false, suppressionReason: 'NO_EXPLICIT_CONSENT' };
  }
  if (input.alertReadiness !== 'READY') {
    return { eligible: false, suppressionReason: 'INPUTS_NOT_CURRENT' };
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
