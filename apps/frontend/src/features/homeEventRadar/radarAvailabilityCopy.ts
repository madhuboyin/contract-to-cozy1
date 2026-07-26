export const RADAR_INTERIM_MONITORING_COPY =
  'This feed shows verified matches from configured Radar sources. Live NWS and freeze alerts currently appear in Incidents while weather monitoring is being unified.';

export const RADAR_INTERIM_COVERAGE = [
  {
    key: 'weather',
    label: 'Live weather',
    status: 'In Incidents',
    detail: 'NWS and freeze alerts currently appear in the property Incident feed.',
  },
  {
    key: 'tax',
    label: 'Tax',
    status: 'Limited',
    detail: 'Available only where a verified assessor source is configured.',
  },
  {
    key: 'utility',
    label: 'Utility',
    status: 'Not connected',
    detail: 'No verified utility connector is active in this Radar feed.',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    status: 'Not connected',
    detail: 'No verified insurance connector is active in this Radar feed.',
  },
] as const;

export function getRadarEmptyStateCopy(filtered: boolean): {
  title: string;
  description: string;
} {
  if (filtered) {
    return {
      title: 'No events in this category',
      description: 'Try switching to “All” to see every verified Radar match for this property.',
    };
  }

  return {
    title: 'No Radar events available',
    description:
      'No verified Radar matches are available for this property. This does not confirm that no local hazards exist. Live NWS and freeze alerts currently appear in Incidents.',
  };
}
