import {
  NotificationCadence,
  NotificationChannel,
  NotificationSensitivity,
  RefinanceConfidenceLevel,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { areWorkerOutboundNotificationsEnabled } from '@worker-shared/config/workerExecutionPolicy';
import {
  decideRefinanceExternalAlert,
  mapRefinanceAlertPreference,
  type RefinanceAlertPreferenceDTO,
} from '@worker-shared/refinanceRadar/refinanceAlertPreference.service';
import { buildRefinanceFreshness } from '@worker-shared/refinanceRadar/refinanceFreshness';

export const REFINANCE_EXTERNAL_ALERT_COOLDOWN_DAYS = 30;
export const REFINANCE_EXTERNAL_ALERT_FLAG =
  'REFINANCE_EXTERNAL_ALERTS_ENABLED';
export const REFINANCE_ALERT_PREFERENCE_ANCHOR =
  'refinance-alert-preferences';

export type RefinanceAlertTransition = 'OPEN' | 'UPDATE';

type RefinanceAlertContext = {
  propertyId: string;
  ownerUserId: string;
  address: string;
  confidenceLevel: RefinanceConfidenceLevel | null;
  mortgageDataAsOf: string | null;
  marketDataAsOf: string | null;
  marketDataSource: string | null;
  preference: RefinanceAlertPreferenceDTO;
};

type CreateAlertInput = {
  userId: string;
  type: 'REFINANCE_OPPORTUNITY_OPENED' | 'REFINANCE_OPPORTUNITY_UPDATED';
  title: string;
  message: string;
  actionUrl: string;
  entityType: 'PROPERTY';
  entityId: string;
  category: 'REFINANCE';
  urgency: 'MATERIAL';
  transportEnabled: true;
  metadata: Record<string, unknown>;
};

export interface RefinanceTransitionAlertDeps {
  loadContext(propertyId: string): Promise<RefinanceAlertContext | null>;
  hasRecentAlert(
    userId: string,
    propertyId: string,
    since: Date,
  ): Promise<boolean>;
  createNotification(input: CreateAlertInput): Promise<unknown>;
  deliveryEnabled(): boolean;
  now(): Date;
}

export function areRefinanceExternalAlertsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env[REFINANCE_EXTERNAL_ALERT_FLAG] === 'true' &&
    areWorkerOutboundNotificationsEnabled(env)
  );
}

async function loadContext(
  propertyId: string,
): Promise<RefinanceAlertContext | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      address: true,
      homeownerProfile: { select: { userId: true } },
      financingProfile: {
        select: { mortgageBalanceAsOfDate: true },
      },
      refinanceRadarState: {
        select: {
          currentOpportunity: {
            select: { confidenceLevel: true },
          },
          lastRateSnapshot: {
            select: { date: true, source: true },
          },
        },
      },
    },
  });
  if (!property) return null;

  const ownerUserId = property.homeownerProfile.userId;
  const storedPreference = await prisma.notificationPreference.findUnique({
    where: {
      userId_scopeKey_category_channel: {
        userId: ownerUserId,
        scopeKey: `PROPERTY:${propertyId}`,
        category: 'REFINANCE',
        channel: NotificationChannel.EMAIL,
      },
    },
    select: {
      enabled: true,
      cadence: true,
      sensitivity: true,
      quietStart: true,
      quietEnd: true,
      timezone: true,
    },
  });

  return {
    propertyId,
    ownerUserId,
    address: property.address,
    confidenceLevel:
      property.refinanceRadarState?.currentOpportunity?.confidenceLevel ?? null,
    mortgageDataAsOf:
      property.financingProfile?.mortgageBalanceAsOfDate?.toISOString() ?? null,
    marketDataAsOf:
      property.refinanceRadarState?.lastRateSnapshot?.date.toISOString() ?? null,
    marketDataSource:
      property.refinanceRadarState?.lastRateSnapshot?.source ?? null,
    preference: mapRefinanceAlertPreference(
      storedPreference
        ? {
            ...storedPreference,
            cadence: storedPreference.cadence as NotificationCadence,
            sensitivity:
              storedPreference.sensitivity as NotificationSensitivity | null,
          }
        : null,
    ),
  };
}

const defaultDeps: RefinanceTransitionAlertDeps = {
  loadContext,
  hasRecentAlert: async (userId, propertyId, since) =>
    Boolean(
      await prisma.notification.findFirst({
        where: {
          userId,
          type: {
            in: [
              'REFINANCE_OPPORTUNITY_OPENED',
              'REFINANCE_OPPORTUNITY_UPDATED',
            ],
          },
          entityType: 'PROPERTY',
          entityId: propertyId,
          createdAt: { gte: since },
          deliveries: {
            some: { channel: NotificationChannel.EMAIL },
          },
        },
        select: { id: true },
      }),
    ),
  createNotification: (input) => NotificationService.create(input),
  deliveryEnabled: areRefinanceExternalAlertsEnabled,
  now: () => new Date(),
};

export type RefinanceTransitionAlertResult =
  | { status: 'CREATED'; reason: null }
  | {
      status: 'SUPPRESSED';
      reason:
        | 'DELIVERY_DISABLED'
        | 'NO_EXPLICIT_CONSENT'
        | 'INPUTS_NOT_CURRENT'
        | 'CONFIDENCE_BELOW_PREFERENCE'
        | 'COOLDOWN_ACTIVE'
        | 'PROPERTY_NOT_FOUND'
        | 'NOTIFICATION_POLICY';
    };

export function hasMaterialRefinanceImprovement(
  reasons: string[] = [],
): boolean {
  return reasons.some((reason) =>
    [
      'MONTHLY_SAVINGS_IMPROVED',
      'BREAK_EVEN_IMPROVED',
      'MARKET_RATE_IMPROVED',
    ].includes(reason),
  );
}

export async function processRefinanceTransitionAlert(
  input: {
    domainEventId: string;
    propertyId: string;
    snapshotId: string;
    transitionType: RefinanceAlertTransition;
    materialChangeReasons?: string[];
  },
  deps: RefinanceTransitionAlertDeps = defaultDeps,
): Promise<RefinanceTransitionAlertResult> {
  const deliveryEnabled = deps.deliveryEnabled();
  if (!deliveryEnabled) {
    return { status: 'SUPPRESSED', reason: 'DELIVERY_DISABLED' };
  }

  const context = await deps.loadContext(input.propertyId);
  if (!context) {
    return { status: 'SUPPRESSED', reason: 'PROPERTY_NOT_FOUND' };
  }

  const now = deps.now();
  const cooldownSince = new Date(
    now.getTime() -
      REFINANCE_EXTERNAL_ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );
  const recentAlertExists = await deps.hasRecentAlert(
    context.ownerUserId,
    input.propertyId,
    cooldownSince,
  );
  const cooldownActive =
    recentAlertExists &&
    !(
      input.transitionType === 'UPDATE' &&
      hasMaterialRefinanceImprovement(input.materialChangeReasons)
    );
  const freshness = buildRefinanceFreshness(
    {
      mortgageDataAsOf: context.mortgageDataAsOf,
      marketDataAsOf: context.marketDataAsOf,
      marketDataSource: context.marketDataSource,
    },
    now,
  );
  const decision = decideRefinanceExternalAlert({
    preference: context.preference,
    alertReadiness: freshness.alertReadiness,
    confidenceLevel: context.confidenceLevel,
    deliveryEnabled,
    cooldownActive,
  });
  if (!decision.eligible) {
    return {
      status: 'SUPPRESSED',
      reason: decision.suppressionReason!,
    };
  }

  const opened = input.transitionType === 'OPEN';
  const notification = await deps.createNotification({
    userId: context.ownerUserId,
    type: opened
      ? 'REFINANCE_OPPORTUNITY_OPENED'
      : 'REFINANCE_OPPORTUNITY_UPDATED',
    title: opened
      ? 'A refinance window may be worth reviewing'
      : 'Your refinance opportunity changed',
    message: opened
      ? `Current market conditions may be worth comparing with the saved mortgage for ${context.address}. Review the assumptions before contacting a lender.`
      : `The refinance estimate for ${context.address} changed materially. Review the updated assumptions before taking action.`,
    actionUrl:
      `/dashboard/properties/${input.propertyId}/tools/mortgage-refinance-radar`,
    entityType: 'PROPERTY',
    entityId: input.propertyId,
    category: 'REFINANCE',
    urgency: 'MATERIAL',
    transportEnabled: true,
    metadata: {
      domainEventId: input.domainEventId,
      propertyId: input.propertyId,
      snapshotId: input.snapshotId,
      transitionType: input.transitionType,
      materialChangeReasons: input.materialChangeReasons ?? [],
      preferenceUrl:
        `/dashboard/properties/${input.propertyId}/tools/mortgage-refinance-radar#${REFINANCE_ALERT_PREFERENCE_ANCHOR}`,
      confidenceLevel: context.confidenceLevel,
      alertReadiness: freshness.alertReadiness,
      // Exact balance, rate, and savings values intentionally stay out of
      // notification metadata and analytics payloads.
    },
  });
  if (!notification) {
    return { status: 'SUPPRESSED', reason: 'NOTIFICATION_POLICY' };
  }
  return { status: 'CREATED', reason: null };
}
