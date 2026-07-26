import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../../config/database';
import type { UpdateRadarNotificationPreferencesBody } from '../../../validators/homeEventRadar.validators';
import { radarNotificationPreferenceResponseSchema } from '../contracts/radar.contracts';
import {
  clockTimeToMinutes,
  isIanaTimezone,
  minutesToClockTime,
  RADAR_NOTIFICATION_CATEGORIES,
  type RadarNotificationPreferenceProjection,
} from '../domain/radarNotificationPreferences';

type RadarPreferenceDatabase = Pick<
  PrismaClient,
  'property' | 'propertyRadarNotificationPreference'
>;

type PersistedRadarPreference = {
  propertyId: string;
  userId: string;
  isEnabled: boolean;
  enabledCategories: string[];
  channels: string[];
  minimumSeverity: string;
  minimumImpact: string;
  deliveryMode: string;
  quietHoursStartMinutes: number | null;
  quietHoursEndMinutes: number | null;
  timezone: string;
  updatedAt: Date;
};

function projectPreference(
  row: PersistedRadarPreference,
  persisted: boolean,
): RadarNotificationPreferenceProjection {
  const hasQuietHours = (
    row.quietHoursStartMinutes !== null
    && row.quietHoursEndMinutes !== null
  );
  return radarNotificationPreferenceResponseSchema.parse({
    propertyId: row.propertyId,
    userId: row.userId,
    isEnabled: row.isEnabled,
    enabledCategories: row.enabledCategories as RadarNotificationPreferenceProjection['enabledCategories'],
    channels: row.channels as RadarNotificationPreferenceProjection['channels'],
    minimumSeverity: row.minimumSeverity as RadarNotificationPreferenceProjection['minimumSeverity'],
    minimumImpact: row.minimumImpact as RadarNotificationPreferenceProjection['minimumImpact'],
    deliveryMode: row.deliveryMode as RadarNotificationPreferenceProjection['deliveryMode'],
    quietHours: hasQuietHours
      ? {
          start: minutesToClockTime(row.quietHoursStartMinutes!),
          end: minutesToClockTime(row.quietHoursEndMinutes!),
        }
      : null,
    timezone: row.timezone,
    persisted,
    updatedAt: persisted ? row.updatedAt.toISOString() : null,
  });
}

export class RadarNotificationPreferenceService {
  constructor(private readonly db: RadarPreferenceDatabase = prisma) {}

  async get(
    propertyId: string,
    userId: string,
  ): Promise<RadarNotificationPreferenceProjection> {
    const existing = await this.db.propertyRadarNotificationPreference.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
    });
    if (existing) return projectPreference(existing, true);

    const property = await this.db.property.findUnique({
      where: { id: propertyId },
      select: { timezone: true },
    });
    const timezone = property?.timezone && isIanaTimezone(property.timezone)
      ? property.timezone
      : 'UTC';

    return projectPreference({
      propertyId,
      userId,
      isEnabled: true,
      enabledCategories: [...RADAR_NOTIFICATION_CATEGORIES],
      channels: ['in_app'],
      minimumSeverity: 'moderate',
      minimumImpact: 'moderate',
      deliveryMode: 'immediate',
      quietHoursStartMinutes: null,
      quietHoursEndMinutes: null,
      timezone,
      updatedAt: new Date(0),
    }, false);
  }

  async update(
    propertyId: string,
    userId: string,
    input: UpdateRadarNotificationPreferencesBody,
  ): Promise<RadarNotificationPreferenceProjection> {
    const data = {
      isEnabled: input.isEnabled,
      enabledCategories: input.enabledCategories,
      channels: input.channels,
      minimumSeverity: input.minimumSeverity,
      minimumImpact: input.minimumImpact,
      deliveryMode: input.deliveryMode,
      quietHoursStartMinutes: input.quietHours
        ? clockTimeToMinutes(input.quietHours.start)
        : null,
      quietHoursEndMinutes: input.quietHours
        ? clockTimeToMinutes(input.quietHours.end)
        : null,
      timezone: input.timezone,
    };
    const saved = await this.db.propertyRadarNotificationPreference.upsert({
      where: { propertyId_userId: { propertyId, userId } },
      create: { propertyId, userId, ...data },
      update: data,
    });
    return projectPreference(saved, true);
  }
}

export const radarNotificationPreferenceService =
  new RadarNotificationPreferenceService();
