/**
 * FR-WORK-003: Completed retention follows the owning domain's policy. Work only decides how long a finished row stays in the Completed
 * and Archived lists; it never deletes or changes the canonical record, and opening the work by its key still resolves after it leaves
 * the list. `null` means the owning record is permanent and is listed for as long as it exists.
 */
export const ASK_WORK_LISTING_RETENTION_DAYS = Object.freeze({
  /** A closed claim stays in the list for two years: long enough to cover a typical appeal and re-open window. */
  claimsCompleted: 730,
  /** A finished score export is a convenience copy; it is listed for 30 days. */
  scoreExportsCompleted: 30,
  /** A report export is listed while downloadable (its own `expiresAt`), then for a short expired-history period. */
  reportExportsExpiredHistory: 30,
  /** A finished repair visit stays listed for a year; a cancelled request for 90 days. The booking record itself is never touched. */
  bookingsCompleted: 365,
  bookingsCancelled: 90,
  /** Permanent domain records: projects, DIY guides, guided plans, renovation cases, decisions, incidents, home work items, bookings. */
  permanentRecords: null,
} as const);

export function listingCutoff(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
