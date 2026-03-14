// apps/frontend/src/components/features/homeEventRadar/RadarUtils.ts
// Shared pure helpers for Home Event Radar UI.

import type { RadarSeverity, RadarImpactLevel, RadarUserState } from '@/types';

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const SEVERITY_LABELS: Record<RadarSeverity, string> = {
  info: 'Info',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const SEVERITY_COLOR: Record<RadarSeverity, string> = {
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  low: 'bg-blue-50 text-blue-700 border-blue-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-800 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

export const SEVERITY_DOT: Record<RadarSeverity, string> = {
  info: 'bg-sky-400',
  low: 'bg-blue-400',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

// ---------------------------------------------------------------------------
// Impact level
// ---------------------------------------------------------------------------

export const IMPACT_LABELS: Record<RadarImpactLevel, string> = {
  none: 'No Impact',
  watch: 'Watch',
  moderate: 'Moderate',
  high: 'High Impact',
};

export const IMPACT_COLOR: Record<RadarImpactLevel, string> = {
  none: 'bg-gray-50 text-gray-500 border-gray-200',
  watch: 'bg-sky-50 text-sky-700 border-sky-200',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
};

// ---------------------------------------------------------------------------
// Event type display
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<string, string> = {
  weather: 'Weather',
  insurance_market: 'Insurance Market',
  utility_outage: 'Utility Outage',
  utility_rate_change: 'Utility Rate',
  tax_reassessment: 'Tax Reassessment',
  tax_rate_change: 'Tax Rate',
  air_quality: 'Air Quality',
  wildfire_smoke: 'Wildfire Smoke',
  flood_risk: 'Flood Risk',
  heat_wave: 'Heat Wave',
  freeze: 'Freeze',
  hail: 'Hail',
  heavy_rain: 'Heavy Rain',
  wind: 'Wind',
  power_surge_risk: 'Power Surge',
  nearby_construction: 'Construction',
  other: 'Event',
};

export function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replace(/_/g, ' ');
}

const EVENT_TYPE_ICON: Record<string, string> = {
  weather: '🌤',
  insurance_market: '🛡',
  utility_outage: '⚡',
  utility_rate_change: '📊',
  tax_reassessment: '🏛',
  tax_rate_change: '📋',
  air_quality: '💨',
  wildfire_smoke: '🔥',
  flood_risk: '🌊',
  heat_wave: '☀',
  freeze: '❄',
  hail: '🌨',
  heavy_rain: '🌧',
  wind: '💨',
  power_surge_risk: '⚡',
  nearby_construction: '🏗',
  other: '📡',
};

export function eventTypeIcon(eventType: string): string {
  return EVENT_TYPE_ICON[eventType] ?? '📡';
}

// ---------------------------------------------------------------------------
// System type display
// ---------------------------------------------------------------------------

const SYSTEM_LABELS: Record<string, string> = {
  roof: 'Roof',
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  water_heater: 'Water Heater',
  drainage: 'Drainage',
  foundation: 'Foundation',
  sump_pump: 'Sump Pump',
  irrigation: 'Irrigation',
  insurance: 'Insurance',
};

export function formatSystemType(type: string): string {
  return SYSTEM_LABELS[type] ?? type.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Action priority display
// ---------------------------------------------------------------------------

export const ACTION_PRIORITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-50 text-gray-500 border-gray-200',
};

export const ACTION_PRIORITY_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'Priority',
  medium: 'Recommended',
  low: 'Optional',
};

// ---------------------------------------------------------------------------
// User state
// ---------------------------------------------------------------------------

export const USER_STATE_LABELS: Record<RadarUserState, string> = {
  new: 'New',
  seen: 'Seen',
  saved: 'Saved',
  dismissed: 'Dismissed',
  acted_on: 'Acted On',
};

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

export function formatRadarDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
