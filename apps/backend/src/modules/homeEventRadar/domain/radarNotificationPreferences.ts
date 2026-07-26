export const RADAR_NOTIFICATION_CATEGORIES = [
  'weather',
  'air_quality',
  'disaster',
  'utility',
  'tax',
  'insurance',
  'other',
] as const;

export const RADAR_NOTIFICATION_CHANNELS = [
  'in_app',
  'email',
  'push',
] as const;

export const RADAR_NOTIFICATION_SEVERITIES = [
  'info',
  'low',
  'moderate',
  'high',
  'severe',
  'extreme',
] as const;

export const RADAR_NOTIFICATION_IMPACTS = [
  'none',
  'low',
  'moderate',
  'high',
  'critical',
] as const;

export const RADAR_NOTIFICATION_DELIVERY_MODES = [
  'immediate',
  'digest',
] as const;

export type RadarNotificationCategory = (typeof RADAR_NOTIFICATION_CATEGORIES)[number];
export type RadarNotificationChannel = (typeof RADAR_NOTIFICATION_CHANNELS)[number];
export type RadarNotificationSeverity = (typeof RADAR_NOTIFICATION_SEVERITIES)[number];
export type RadarNotificationImpact = (typeof RADAR_NOTIFICATION_IMPACTS)[number];
export type RadarNotificationDeliveryMode =
  (typeof RADAR_NOTIFICATION_DELIVERY_MODES)[number];

export type RadarQuietHours = {
  start: string;
  end: string;
};

export type RadarNotificationPreferenceProjection = {
  propertyId: string;
  userId: string;
  isEnabled: boolean;
  enabledCategories: RadarNotificationCategory[];
  channels: RadarNotificationChannel[];
  minimumSeverity: RadarNotificationSeverity;
  minimumImpact: RadarNotificationImpact;
  deliveryMode: RadarNotificationDeliveryMode;
  quietHours: RadarQuietHours | null;
  timezone: string;
  persisted: boolean;
  updatedAt: string | null;
};

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function clockTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function minutesToClockTime(value: number): string {
  const normalized = Math.max(0, Math.min(1_439, Math.trunc(value)));
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function orderedRadarPreferenceValues<T extends string>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const selected = new Set(values);
  return order.filter((value) => selected.has(value));
}
