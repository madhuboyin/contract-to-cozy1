import * as React from 'react';
import {
  AlertTriangle,
  Cloud,
  CloudRain,
  Droplets,
  Flame,
  History,
  Snowflake,
  Sun,
  Wind,
  Zap,
} from 'lucide-react';
import type {
  HomeRiskReplaySeverity,
  HomeRiskReplaySystem,
  HomeRiskReplayTimelineEvent,
  HomeRiskReplayWindowType,
} from './types';

export function formatWindowType(windowType: HomeRiskReplayWindowType): string {
  if (windowType === 'since_built') return 'Since built';
  if (windowType === 'last_5_years') return 'Last 5 years';
  return 'Custom range';
}

export function formatReplayDate(value: string | null | undefined): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatReplayDateRange(startAt: string | null | undefined, endAt: string | null | undefined): string {
  const startLabel = formatReplayDate(startAt);
  const endLabel = formatReplayDate(endAt);

  if (startLabel === 'Unknown date' && endLabel === 'Unknown date') return 'Date unavailable';
  if (startLabel === 'Unknown date') return `Ended ${endLabel}`;
  if (!endAt || startAt === endAt || endLabel === 'Unknown date') return startLabel;
  return `${startLabel} - ${endLabel}`;
}

export function formatEventType(eventType: string): string {
  return eventType
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatDriverCode(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatSystemType(system: HomeRiskReplaySystem): string {
  return system.label || formatEventType(system.type);
}

export function formatMatchBasis(value: string | undefined): string {
  if (!value) return 'Location match';
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function severityLabel(value: HomeRiskReplaySeverity): string {
  if (value === 'moderate') return 'Moderate';
  if (value === 'severe') return 'Severe';
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  return 'Info';
}

export const SEVERITY_TONE: Record<HomeRiskReplaySeverity, string> = {
  info: 'border-slate-200 bg-slate-50 text-slate-700',
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  moderate: 'border-amber-200 bg-amber-50 text-amber-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800',
  severe: 'border-rose-200 bg-rose-50 text-rose-700',
};

export const IMPACT_TONE: Record<HomeRiskReplaySeverity, string> = {
  info: 'border-slate-200 bg-slate-50 text-slate-700',
  low: 'border-sky-200 bg-sky-50 text-sky-700',
  moderate: 'border-amber-200 bg-amber-50 text-amber-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800',
  severe: 'border-rose-200 bg-rose-50 text-rose-700',
};

export const PRIORITY_TONE: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-slate-200 bg-slate-50 text-slate-700',
};

export const RELEVANCE_TONE: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-sky-200 bg-sky-50 text-sky-700',
  medium: 'border-slate-200 bg-slate-50 text-slate-700',
  low: 'border-slate-200 bg-white text-slate-600',
};

export function eventTypeIcon(eventType: string): React.ReactNode {
  const className = 'h-4 w-4';

  switch (eventType) {
    case 'hail':
      return <CloudRain className={className} />;
    case 'freeze':
      return <Snowflake className={className} />;
    case 'heavy_rain':
      return <CloudRain className={className} />;
    case 'flood_risk':
      return <Droplets className={className} />;
    case 'wind':
      return <Wind className={className} />;
    case 'heat_wave':
      return <Sun className={className} />;
    case 'wildfire_smoke':
      return <Flame className={className} />;
    case 'air_quality':
      return <Cloud className={className} />;
    case 'power_outage':
    case 'power_surge_risk':
      return <Zap className={className} />;
    case 'drought':
      return <Sun className={className} />;
    case 'extreme_weather':
      return <AlertTriangle className={className} />;
    default:
      return <History className={className} />;
  }
}

export function timelineAccent(event: HomeRiskReplayTimelineEvent): string {
  if (event.impactLevel === 'severe') return 'bg-rose-500';
  if (event.impactLevel === 'high') return 'bg-orange-500';
  if (event.impactLevel === 'moderate') return 'bg-amber-500';
  if (event.severity === 'low') return 'bg-emerald-500';
  return 'bg-slate-400';
}
