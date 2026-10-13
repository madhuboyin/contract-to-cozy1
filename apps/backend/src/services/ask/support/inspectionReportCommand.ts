// Inspection reports inside Ask (register P2 "Inspection Hub"; FRD v1.339). Pure: declared messages, action ids and the state rules.
//
import { z } from 'zod';

// Uploading and reading a report stay with the analyzer. What a household does once a report has been read is review it and confirm it (which is what
// makes its findings trusted and what writes back to the home), and compare it with the report before it. Both are here.
export const INSPECTION_REPORT_ENTITY_TYPE = 'INSPECTION_REPORT';
export const INSPECTION_REPORT_MESSAGES = {
  CONFIRM: 'Review this inspection report before it is trusted.',
  COMPARE: 'Compare this inspection report with the one before it.',
  ARCHIVE: 'Archive this inspection report.',
} as const;
export type InspectionReportKind = keyof typeof INSPECTION_REPORT_MESSAGES;
export const INSPECTION_REPORT_ACTION_IDS = { CONFIRM: 'inspection-report-confirm', COMPARE: 'inspection-report-compare', ARCHIVE: 'inspection-report-archive' } as const;
export const inspectionReportKindFromMessage = (message: string): InspectionReportKind | null =>
  ((Object.entries(INSPECTION_REPORT_MESSAGES) as Array<[InspectionReportKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;

export const INSPECTION_REPORT_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General inspection', ROOF: 'Roof inspection', HVAC: 'HVAC inspection', SEWER: 'Sewer inspection', ELECTRICAL: 'Electrical inspection',
  FOUNDATION: 'Foundation inspection', PRE_PURCHASE: 'Pre-purchase inspection', PRE_LISTING: 'Pre-listing inspection', ANNUAL: 'Annual inspection', OTHER: 'Inspection',
};
export const INSPECTION_REPORT_STATUS_LABELS: Record<string, string> = { PROCESSING: 'Being read', REVIEW_PENDING: 'Waiting for your review', CONFIRMED: 'Confirmed', ARCHIVED: 'Archived' };

/** Confirmation is only offered once the analyzer has finished and nobody has confirmed or archived the report. */
export const inspectionReportCanConfirm = (status: string) => status === 'REVIEW_PENDING';
/** A report that has been read (waiting for review, or confirmed) can be archived; one still being read, or already archived, cannot (FRD v1.354). */
export const inspectionReportCanArchive = (status: string) => status === 'REVIEW_PENDING' || status === 'CONFIRMED';
/** Only confirmed reports are compared, and a report needs an earlier confirmed one to be compared with. */
export function previousConfirmedReportId(
  reports: ReadonlyArray<{ id: string; status: string; inspectionDate: Date }>, reportId: string,
): string | null {
  const current = reports.find((report) => report.id === reportId);
  if (!current || current.status !== 'CONFIRMED') return null;
  const earlier = reports
    .filter((report) => report.id !== reportId && report.status === 'CONFIRMED' && report.inspectionDate.getTime() < current.inspectionDate.getTime())
    .sort((a, b) => b.inspectionDate.getTime() - a.inspectionDate.getTime());
  return earlier[0]?.id ?? null;
}

// ── negotiation package (FRD v1.341) ───────────────────────────────────────────────────────────────────────────
export const NEGOTIATION_PACKAGE_MESSAGE = 'Build a negotiation package from this inspection report.';
export const NEGOTIATION_PACKAGE_ACTION_ID = 'inspection-report-negotiation';
export const NEGOTIATION_PACKAGE_CAPTURE_KEY = 'INSPECTION_NEGOTIATION_DECISIONS';
export const NEGOTIATION_DECISIONS = ['negotiate_credit', 'request_repair', 'accept_as_is'] as const;
export const NEGOTIATION_DECISION_LABELS: Record<string, string> = { negotiate_credit: 'Ask for a credit', request_repair: 'Request a repair', accept_as_is: 'Accept as is' };
export const NEGOTIATION_MAX_FINDINGS = 25;
/** The form's keys are positional (f0, f1, ...); the finding ids they stand for are held by the launch, not typed by anyone. */
export const negotiationFieldKey = (index: number) => `f${index}`;
export function parseNegotiationAnswer(answer: unknown, count: number): { success: true; decisions: Array<(typeof NEGOTIATION_DECISIONS)[number]> } | { success: false } {
  const shape = Object.fromEntries(Array.from({ length: count }, (_, i) => [negotiationFieldKey(i), z.enum(NEGOTIATION_DECISIONS)]));
  const parsed = z.object(shape).strict().safeParse(answer);
  if (!parsed.success) return { success: false };
  return { success: true, decisions: Array.from({ length: count }, (_, i) => (parsed.data as Record<string, (typeof NEGOTIATION_DECISIONS)[number]>)[negotiationFieldKey(i)]) };
}
export const inspectionReportNegotiationEligible = (report: { status: string; reportType: string }) => report.status === 'CONFIRMED' && report.reportType === 'PRE_PURCHASE';
