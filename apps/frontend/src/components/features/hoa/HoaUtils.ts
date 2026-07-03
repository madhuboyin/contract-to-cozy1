import type { HoaWorkType, HoaApprovalStatus, HoaDuesFrequency } from '@/types';

export { formatCents, formatDate, relativeTime } from '../permits/PermitUtils';

export const WORK_TYPE_LABELS: Record<HoaWorkType, string> = {
  EXTERIOR_PAINT: 'Exterior Paint',
  FENCE: 'Fence',
  ROOFING: 'Roofing',
  ROOM_ADDITION: 'Room Addition',
  DECK_PATIO: 'Deck / Patio',
  LANDSCAPING: 'Landscaping',
  SOLAR: 'Solar',
  WINDOWS_DOORS: 'Windows & Doors',
  DRIVEWAY: 'Driveway',
  SHED_OUTBUILDING: 'Shed / Outbuilding',
  POOL: 'Pool',
  SATELLITE_ANTENNA: 'Satellite / Antenna',
  OTHER: 'Other',
};

export const APPROVAL_STATUS_LABELS: Record<HoaApprovalStatus, string> = {
  NOT_SUBMITTED: 'Not Submitted',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  APPROVED_WITH_CONDITIONS: 'Approved (Conditions)',
  DENIED: 'Denied',
  EXPIRED: 'Expired',
};

export const APPROVAL_STATUS_COLOR: Record<HoaApprovalStatus, string> = {
  NOT_SUBMITTED: 'bg-neutral-100 text-neutral-500',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  APPROVED_WITH_CONDITIONS: 'bg-emerald-50 text-emerald-700',
  DENIED: 'bg-red-50 text-red-700',
  EXPIRED: 'bg-neutral-100 text-neutral-500',
};

export const DUES_FREQUENCY_LABELS: Record<HoaDuesFrequency, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
};
