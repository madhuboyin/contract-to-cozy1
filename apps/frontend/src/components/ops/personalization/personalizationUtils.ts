// apps/frontend/src/components/ops/personalization/personalizationUtils.ts
//
// Shared badge-color mapping and formatters for the Personalization Catalog
// admin console (apps/frontend/src/app/(dashboard)/dashboard/admin/personalization).

import type { RecommendationIncidentSeverity } from '@/lib/api/personalizationAdminApi';

export function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

/** ROUTINE -> neutral chip, anything safety-flavored (SAFETY_SENSITIVE, SAFETY_EMERGENCY) -> warn chip. */
export function isSafetyFlavored(safetyClass: string): boolean {
  return safetyClass.toUpperCase().includes('SAFETY');
}

export const DEFINITION_STATUS_CHIP: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PAUSED: 'bg-amber-50 text-amber-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
};

export const SEVERITY_CHIP: Record<RecommendationIncidentSeverity, string> = {
  CRITICAL: 'bg-rose-50 text-rose-700',
  HIGH: 'bg-amber-50 text-amber-700',
  MODERATE: 'bg-amber-50 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
};

export const SAMPLE_STATUS_LABEL: Record<string, string> = {
  NO_DATA: 'No data collected yet',
  INSUFFICIENT_SAMPLE: 'Below review threshold',
  REVIEWABLE: 'Reviewable sample reached',
};
