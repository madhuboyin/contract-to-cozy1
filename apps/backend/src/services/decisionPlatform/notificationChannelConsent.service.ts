// Ask Intelligence FRD §18.3/§22.2, Phase 9C "per-category/channel consent"
// deliverable. Distinct from NotificationPreference.enabled/cadence
// (notificationPreference.service.ts): consent is the affirmative,
// versioned, revocable grant that must exist before any external channel
// send is attempted; preference only tunes delivery for a user who already
// holds consent. FRD §22.2 treats "external notification without applicable
// consent" as a zero-tolerance metric, so this is checked as its own gate,
// never inferred from a preference row defaulting to enabled=true.

import { prisma } from '../../lib/prisma';
import { NotificationChannel } from '@prisma/client';
import { PILOT_CONFIGURABLE_NOTIFICATION_CHANNELS, type NotificationCategory } from '../../productFramework/notificationPolicy.contract';

// Bump when the consent copy/scope materially changes; a prior grant under
// an old version does not carry forward automatically (mirrors
// outcomeMeasurementConsent's versioned-consent precedent).
export const NOTIFICATION_CHANNEL_CONSENT_VERSION = 'notification-channel-consent-v1' as const;

type PilotChannel = typeof PILOT_CONFIGURABLE_NOTIFICATION_CHANNELS[number];

export async function grantNotificationChannelConsent(params: {
  userId: string;
  category: NotificationCategory;
  channel: PilotChannel;
  consentedByUserId?: string;
}) {
  const channel = params.channel as NotificationChannel;
  return prisma.notificationChannelConsent.upsert({
    where: { userId_category_channel: { userId: params.userId, category: params.category, channel } },
    update: {
      consentVersion: NOTIFICATION_CHANNEL_CONSENT_VERSION,
      consentedAt: new Date(),
      consentedByUserId: params.consentedByUserId ?? params.userId,
      revokedAt: null,
    },
    create: {
      userId: params.userId,
      category: params.category,
      channel,
      consentVersion: NOTIFICATION_CHANNEL_CONSENT_VERSION,
      consentedAt: new Date(),
      consentedByUserId: params.consentedByUserId ?? params.userId,
    },
  });
}

export async function revokeNotificationChannelConsent(params: {
  userId: string;
  category: NotificationCategory;
  channel: PilotChannel;
}) {
  const channel = params.channel as NotificationChannel;
  const existing = await prisma.notificationChannelConsent.findUnique({
    where: { userId_category_channel: { userId: params.userId, category: params.category, channel } },
  });
  if (!existing) return null;
  return prisma.notificationChannelConsent.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
}

export async function listNotificationChannelConsents(userId: string) {
  return prisma.notificationChannelConsent.findMany({ where: { userId }, orderBy: { category: 'asc' } });
}

/**
 * The single boolean gate proactive-delivery eligibility checks. A category
 * of `ALL` never satisfies a specific category's requirement -- FRD §11.2
 * -style "financial opportunities require independent consent" reasoning
 * (mirrors notificationPreferenceCategories' REFINANCE/SAVINGS_BENEFITS
 * carve-out) generalized: consent is granted per exact category, not
 * inherited from a broader one, since silently upgrading scope on a user's
 * behalf is exactly what an affirmative-consent gate exists to prevent.
 */
export async function hasActiveNotificationChannelConsent(params: {
  userId: string;
  category: NotificationCategory;
  channel: PilotChannel;
}): Promise<boolean> {
  const channel = params.channel as NotificationChannel;
  const consent = await prisma.notificationChannelConsent.findUnique({
    where: { userId_category_channel: { userId: params.userId, category: params.category, channel } },
  });
  return Boolean(consent?.consentedAt && !consent.revokedAt);
}
