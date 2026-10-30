// The Permit Tracker read inside Ask (register P0 "Permits", slice PM-A; FRD v1.313). Pure: the labels and the typed-request pattern, shared by the
// handler and the routing registry.
//
// Official versus reported is the tool's own distinction and Ask keeps it: `status` is the authority's record and can never be changed by the household,
// `reportedStatus` is what the homeowner or contractor says. A reported "issued" is never presented as an issued permit.

export const PERMIT_CATEGORY_LABELS: Record<string, string> = {
  BUILDING: 'Building', ELECTRICAL: 'Electrical', PLUMBING: 'Plumbing', MECHANICAL: 'Mechanical', STRUCTURAL: 'Structural', ROOFING: 'Roofing',
  ZONING: 'Zoning', DEMOLITION: 'Demolition', GRADING: 'Grading', FIRE: 'Fire', OTHER: 'Other',
};
export const PERMIT_OFFICIAL_STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied', UNDER_REVIEW: 'Under review', CORRECTION_REQUESTED: 'Corrections requested', RESUBMITTED: 'Resubmitted', ISSUED: 'Issued',
  INSPECTION_PENDING: 'Inspection pending', INSPECTION_FAILED: 'Inspection failed', FINALED: 'Finaled (closed out)', EXPIRED: 'Expired', VOIDED: 'Voided',
  UNKNOWN: 'Official status not confirmed',
};
export const PERMIT_REPORTED_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', PREPARING_APPLICATION: 'Preparing the application', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', CORRECTION_REQUESTED: 'Corrections requested',
  RESUBMITTED: 'Resubmitted', ISSUED_REPORTED: 'Issued', INSPECTIONS_IN_PROGRESS: 'Inspections in progress', CLOSEOUT_REQUESTED: 'Closeout requested',
  COMPLETED_REPORTED: 'Completed', EXPIRED_REPORTED: 'Expired', WITHDRAWN: 'Withdrawn',
};
export const PERMIT_WORK_TYPE_LABELS = (value: string) => value.toLowerCase().replace(/_/g, ' ');
export const PERMIT_FLAG_STATUS_LABELS: Record<string, string> = {
  UNKNOWN: 'Not yet looked into', FLAGGED: 'Flagged', INVESTIGATING: 'Being researched', CONFIRMED_PERMITTED: 'Confirmed permitted',
  CONFIRMED_UNPERMITTED: 'Confirmed unpermitted', WILL_REMEDIATE: 'Planned to fix', REMEDIATED: 'Fixed', DISMISSED: 'Dismissed',
};
export const PERMIT_RISK_LABELS: Record<string, string> = { LOW: 'Low disclosure risk', MEDIUM: 'Medium disclosure risk', HIGH: 'High disclosure risk' };
/** Statuses where the permit still needs something from the household or the authority. */
export const PERMIT_OPEN_FLAG_STATUSES = ['UNKNOWN', 'FLAGGED', 'INVESTIGATING'] as const;

// "show my permits", "what permits do I have", "list permit records", "open permit inspections", "unpermitted work", "do I have a permit for the roof".
// Narrow on purpose: "do I need a permit for this?" and "is my renovation ready" are the readiness question, which keeps its route.
const readPattern = /\b(?:show|list|see|view|review|what|which)\b.{0,25}\bpermits?\b(?!.{0,30}\b(?:need|require|required|ready|readiness|renovation|remodel|project|start|apply|file)\b)|\bmy permits\b|\bpermit (?:records?|history|list|inspections?)\b|\bunpermitted (?:work|flags?|items?)\b|\bdo i have (?:a |any )?(?:open )?permits?\b|\bopen permits?\b|\bpermit-record search\b|\bcheck on my permit disclosure report\b/i;
export const isPermitTrackerReadRequest = (message: string): boolean => readPattern.test(message);
