import type {
  RadarCategoryCoverage,
  RadarFeedState,
  RadarMonitoringState,
  RadarSourceFamily,
  RadarOverview,
} from '@/types';

export type RadarReadinessPresentation = {
  label: string;
  title: string;
  description: string;
  action: 'edit_property' | 'retry' | null;
  actionLabel: string | null;
};

const LOCATION_FIELD_LABELS: Record<
  NonNullable<RadarOverview['readiness']>['missingLocationFields'][number],
  string
> = {
  state: 'state',
  postal_or_locality: 'ZIP code or city/county',
  verified_location: 'a verified property location',
};

export function getRadarReadinessPresentation(
  overview: Pick<RadarOverview, 'monitoringState' | 'readiness'>,
): RadarReadinessPresentation | null {
  if (overview.readiness?.state === 'PROPERTY_SETUP_REQUIRED') {
    const fields = overview.readiness.missingLocationFields
      .map((field) => LOCATION_FIELD_LABELS[field]);
    return {
      label: 'Setup needed',
      title: 'Complete this property’s location',
      description: fields.length > 0
        ? `Add ${fields.join(' and ')} so Radar can match this home to available sources.`
        : 'Add or verify this property’s location so Radar can match it to available sources.',
      action: 'edit_property',
      actionLabel: 'Update property location',
    };
  }
  if (overview.readiness?.state === 'MONITORING_NOT_INITIALIZED') {
    return {
      label: 'Check pending',
      title: 'First monitoring check is pending',
      description:
        'This property already has a usable location. Radar has not recorded its first source-coverage evaluation yet.',
      action: 'retry',
      actionLabel: 'Check again',
    };
  }
  // Backward-compatible fallback for an older API response.
  if (!overview.readiness && overview.monitoringState === 'SETUP_NEEDED') {
    return {
      label: 'Setup needed',
      title: 'Complete this property’s location',
      description: 'Add or verify this property’s location so Radar can evaluate source coverage.',
      action: 'edit_property',
      actionLabel: 'Update property location',
    };
  }
  return null;
}

export const RADAR_MONITORING_PRESENTATION: Record<
  RadarMonitoringState,
  { label: string; title: string; description: string; tone: 'positive' | 'warning' | 'danger' | 'neutral' }
> = {
  ACTIVE: {
    label: 'Active',
    title: 'Monitoring is active',
    description: 'Configured sources currently cover this home and are reporting normally.',
    tone: 'positive',
  },
  PARTIAL: {
    label: 'Partial coverage',
    title: 'Some monitoring is active',
    description: 'Active sources are monitoring this home, but one or more categories are unavailable.',
    tone: 'warning',
  },
  DEGRADED: {
    label: 'Degraded',
    title: 'Monitoring is delayed',
    description: 'One or more configured sources are stale or failing. Recent events may be delayed.',
    tone: 'danger',
  },
  UNCOVERED: {
    label: 'Unavailable',
    title: 'Live monitoring is unavailable',
    description: 'No configured Radar source currently covers this home.',
    tone: 'neutral',
  },
  SETUP_NEEDED: {
    label: 'Setup needed',
    title: 'Property setup is needed',
    description: 'Radar needs a usable property location and completed coverage evaluation.',
    tone: 'warning',
  },
};

export const RADAR_FAMILY_LABELS: Record<RadarSourceFamily, string> = {
  weather: 'Weather',
  air_quality: 'Air quality',
  disaster: 'Disaster',
  utility: 'Utility',
  tax: 'Tax',
  insurance: 'Insurance',
  other: 'Other',
};

export const RADAR_COVERAGE_LABELS: Record<RadarCategoryCoverage['status'], string> = {
  covered: 'Active',
  not_covered: 'Not available here',
  disabled: 'Coming later',
  failed: 'Degraded',
  stale: 'Delayed',
  unknown: 'Setup needed',
};

export function isRadarFamilyFilterAvailable(status: RadarCategoryCoverage['status']): boolean {
  return status === 'covered' || status === 'failed' || status === 'stale';
}

export function formatRadarLastCheck(
  value: string | null,
  now: Date = new Date(),
): string {
  if (!value) return 'No successful check recorded';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Last successful check unavailable';
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  if (minutes < 1) return 'Last successful check just now';
  if (minutes < 60) return `Last successful check ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last successful check ${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Last successful check ${days} day${days === 1 ? '' : 's'} ago`;
}

export function getRadarEmptyStateCopy(input: {
  filtered: boolean;
  monitoringState?: RadarMonitoringState;
  feedState?: RadarFeedState;
}): { title: string; description: string } {
  if (input.filtered) {
    return {
      title: 'No events match this filter',
      description: 'Try another available category or switch to All.',
    };
  }

  if (input.monitoringState === 'SETUP_NEEDED') {
    return {
      title: 'Complete property setup',
      description: 'Add or correct this property’s location so Radar can evaluate source coverage.',
    };
  }
  if (input.feedState === 'CONFIRMED_CLEAR' && input.monitoringState === 'ACTIVE') {
    return {
      title: 'No active events detected',
      description: 'No active events were reported by the sources currently covering this home.',
    };
  }
  if (input.feedState === 'HAS_EVENTS' && input.monitoringState === 'ACTIVE') {
    return {
      title: 'No current events to review',
      description: 'Monitoring remains active. Events outside this view may be dismissed or filtered.',
    };
  }
  if (input.feedState === 'DEGRADED' || input.monitoringState === 'DEGRADED') {
    return {
      title: 'No events available while monitoring is delayed',
      description: 'Some sources are stale or failing. This is not confirmation that no local event exists.',
    };
  }
  if (input.feedState === 'PARTIAL_COVERAGE' || input.monitoringState === 'PARTIAL') {
    return {
      title: 'No events detected by active sources',
      description: 'Some categories are not covered, so this is not a complete all-clear.',
    };
  }
  return {
    title: 'Live monitoring is not available',
    description: 'No configured Radar source currently covers this property. This is not evidence that no local event exists.',
  };
}
