import type { PermitRecordCategory, PermitWorkType, PermitRecordStatus, PermitInspectionStatus, PermitUnpermittedFlagStatus, PermitDisclosureRisk, PermitRecordSource, InspectionReadinessVerdict, InspectionReadinessChecklistVerdict } from '@/types';

export const CATEGORY_LABELS: Record<PermitRecordCategory, string> = {
  BUILDING: 'Building',
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing',
  MECHANICAL: 'Mechanical',
  STRUCTURAL: 'Structural',
  ROOFING: 'Roofing',
  ZONING: 'Zoning',
  DEMOLITION: 'Demolition',
  GRADING: 'Grading',
  FIRE: 'Fire',
  OTHER: 'Other',
};

export const CATEGORY_EMOJI: Record<PermitRecordCategory, string> = {
  BUILDING: '🏗️',
  ELECTRICAL: '⚡',
  PLUMBING: '🔧',
  MECHANICAL: '🌡️',
  STRUCTURAL: '🏛️',
  ROOFING: '🏠',
  ZONING: '📐',
  DEMOLITION: '🏚️',
  GRADING: '🌍',
  FIRE: '🔥',
  OTHER: '📋',
};

export const WORK_TYPE_LABELS: Record<PermitWorkType, string> = {
  HVAC_NEW: 'New HVAC',
  HVAC_REPLACEMENT: 'HVAC Replacement',
  ELECTRICAL_PANEL: 'Electrical Panel',
  ELECTRICAL_WIRING: 'Electrical Wiring',
  PLUMBING_NEW: 'New Plumbing',
  PLUMBING_REPAIR: 'Plumbing Repair',
  ROOF_REPLACEMENT: 'Roof Replacement',
  ROOF_REPAIR: 'Roof Repair',
  ROOM_ADDITION: 'Room Addition',
  GARAGE_CONVERSION: 'Garage Conversion',
  ADU: 'ADU',
  BASEMENT_FINISH: 'Basement Finish',
  DECK_PATIO: 'Deck / Patio',
  FENCE: 'Fence',
  SWIMMING_POOL: 'Swimming Pool',
  SOLAR: 'Solar',
  WINDOWS_DOORS: 'Windows & Doors',
  FIREPLACE: 'Fireplace',
  SEWER_WATER_LINE: 'Sewer / Water Line',
  STRUCTURAL_REPAIR: 'Structural Repair',
  INTERIOR_REMODEL: 'Interior Remodel',
  EXTERIOR_REMODEL: 'Exterior Remodel',
  DEMOLITION: 'Demolition',
  GRADING_DRAINAGE: 'Grading & Drainage',
  OTHER: 'Other',
};

export const STATUS_LABELS: Record<PermitRecordStatus, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under Review',
  CORRECTION_REQUESTED: 'Correction Requested',
  RESUBMITTED: 'Resubmitted',
  ISSUED: 'Issued',
  INSPECTION_PENDING: 'Inspection Pending',
  INSPECTION_FAILED: 'Inspection Failed',
  FINALED: 'Finaled',
  EXPIRED: 'Expired',
  VOIDED: 'Voided',
  UNKNOWN: 'Unknown',
};

export const STATUS_COLOR: Record<PermitRecordStatus, string> = {
  APPLIED: 'bg-blue-50 text-blue-700',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700',
  CORRECTION_REQUESTED: 'bg-orange-50 text-orange-700',
  RESUBMITTED: 'bg-blue-50 text-blue-700',
  ISSUED: 'bg-emerald-50 text-emerald-700',
  INSPECTION_PENDING: 'bg-amber-50 text-amber-700',
  INSPECTION_FAILED: 'bg-red-50 text-red-700',
  FINALED: 'bg-neutral-100 text-neutral-600',
  EXPIRED: 'bg-orange-50 text-orange-700',
  VOIDED: 'bg-neutral-100 text-neutral-500',
  UNKNOWN: 'bg-neutral-100 text-neutral-500',
};

export const INSPECTION_STATUS_LABELS: Record<PermitInspectionStatus, string> = {
  NOT_SCHEDULED: 'Not Scheduled',
  SCHEDULED: 'Scheduled',
  PASSED: 'Passed',
  FAILED: 'Failed',
  PARTIAL: 'Partial',
  CANCELLED: 'Cancelled',
};

export const INSPECTION_STATUS_COLOR: Record<PermitInspectionStatus, string> = {
  NOT_SCHEDULED: 'bg-neutral-100 text-neutral-500',
  SCHEDULED: 'bg-blue-50 text-blue-700',
  PASSED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
};

export const FLAG_STATUS_LABELS: Record<PermitUnpermittedFlagStatus, string> = {
  UNKNOWN: 'Unknown — research needed',
  FLAGGED: 'Flagged',
  INVESTIGATING: 'Investigating',
  CONFIRMED_PERMITTED: 'Confirmed Permitted',
  CONFIRMED_UNPERMITTED: 'Confirmed Unpermitted',
  WILL_REMEDIATE: 'Will Remediate',
  REMEDIATED: 'Remediated',
  DISMISSED: 'Dismissed',
};

export const FLAG_STATUS_COLOR: Record<PermitUnpermittedFlagStatus, string> = {
  UNKNOWN: 'bg-slate-100 text-slate-700',
  FLAGGED: 'bg-amber-50 text-amber-700',
  INVESTIGATING: 'bg-blue-50 text-blue-700',
  CONFIRMED_PERMITTED: 'bg-emerald-50 text-emerald-700',
  CONFIRMED_UNPERMITTED: 'bg-red-50 text-red-700',
  WILL_REMEDIATE: 'bg-purple-50 text-purple-700',
  REMEDIATED: 'bg-emerald-50 text-emerald-700',
  DISMISSED: 'bg-neutral-100 text-neutral-500',
};

export const RISK_LABELS: Record<PermitDisclosureRisk, string> = {
  HIGH: 'High Risk',
  MEDIUM: 'Medium Risk',
  LOW: 'Low Risk',
};

export const RISK_COLOR: Record<PermitDisclosureRisk, string> = {
  HIGH: 'bg-red-50 text-red-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-neutral-100 text-neutral-600',
};

export const SOURCE_LABELS: Record<PermitRecordSource, string> = {
  OPEN_DATA_API: 'Open Data',
  MANUAL_ENTRY: 'Manual Entry',
  DOCUMENT_UPLOAD: 'Document Upload',
};

export const READINESS_VERDICT_LABELS: Record<InspectionReadinessVerdict, string> = {
  READY: 'Ready for Inspection',
  NOT_READY: 'Not Ready Yet',
  NEEDS_REVIEW: 'Needs Clearer Photos',
};

export const READINESS_VERDICT_COLOR: Record<InspectionReadinessVerdict, string> = {
  READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NOT_READY: 'bg-red-50 text-red-700 border-red-200',
  NEEDS_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const CHECKLIST_VERDICT_LABELS: Record<InspectionReadinessChecklistVerdict, string> = {
  MET: 'Met',
  NOT_MET: 'Not Met',
  UNABLE_TO_VERIFY: 'Unclear',
};

export const CHECKLIST_VERDICT_COLOR: Record<InspectionReadinessChecklistVerdict, string> = {
  MET: 'text-emerald-600',
  NOT_MET: 'text-red-600',
  UNABLE_TO_VERIFY: 'text-amber-600',
};

export function formatCents(cents?: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
