// A homeowner's review of an inspection report, and what it proves to a guided journey (continuation FRD section 35).
//
// Reading or displaying a report proves nothing. A review is an append-only record that a person reviewed THIS version of the report: the stable content fingerprint covers the report's own fields and every
// finding's status, so a report that changes needs a new review. `status` and `confirmedAt` on the report mean processing and write-back confirmation and are never reused for this. The Desktop route and
// Ask both call `reviewInspectionReportWithEffects`, so neither can report a review step with weaker proof.

import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBinding, type GuidanceStepBindingResult } from './guidanceEngine/guidanceStepBinding';

export const INSPECTION_REVIEW_TOOL_KEY = 'inspection-report';
export const INSPECTION_REVIEW_STEP_KEYS = ['review_inspection_report', 'review_maintenance_report', 'review_post_repair_report', 'review_pre_purchase_report'] as const;
export const INSPECTION_REVIEW_OUTCOMES = ['REVIEWED', 'ACCEPTED'] as const;
export type InspectionReviewOutcome = (typeof INSPECTION_REVIEW_OUTCOMES)[number];
/** A report can be reviewed once it has been processed; one still being extracted, or archived, cannot. */
export const REVIEWABLE_REPORT_STATUSES = ['REVIEW_PENDING', 'CONFIRMED'] as const;

/** A stable fingerprint of the report as a person would see it now: its own fields and each finding (id, status), so any change to the report or its findings is a different version. */
export async function inspectionReportFingerprint(propertyId: string, reportId: string): Promise<{ report: any; fingerprint: string } | null> {
  const report = await prisma.inspectionReport.findFirst({
    where: { id: reportId, propertyId },
    include: { findings: { select: { id: true, status: true, severity: true, updatedAt: true }, orderBy: { id: 'asc' } } },
  });
  if (!report) return null;
  const parts = [report.id, report.reportType, report.status, report.totalFindings, report.openFindings, report.safetyFindings, report.majorFindings, report.confirmedAt?.toISOString() ?? '', report.processedAt?.toISOString() ?? '',
    ...report.findings.map((finding: any) => `${finding.id}:${finding.status}:${finding.severity}`)];
  return { report, fingerprint: createHash('sha256').update(parts.join('|')).digest('hex') };
}

/**
 * Whether a journey step may be completed by reviewing THIS report: the inspection-report tool's open review step, on an open journey, and the journey is about this report. A journey is about a report when the
 * report was made for it (`sourceJourneyId`) or its signal is a finding of this report. The pre-purchase review step needs a pre-purchase report. Re-read every time.
 */
export async function resolveInspectionReviewBinding(propertyId: string, stepId: string, report: { id: string; sourceJourneyId: string | null; reportType: string }): Promise<GuidanceStepBindingResult> {
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: INSPECTION_REVIEW_TOOL_KEY, stepKeys: INSPECTION_REVIEW_STEP_KEYS });
  if (!bound.ok) return bound;
  if (bound.binding.stepKey === 'review_pre_purchase_report' && report.reportType !== 'PRE_PURCHASE') return { ok: false, reason: 'WRONG_SUBJECT' };
  return (await journeyIsAboutReport(propertyId, bound.binding, report)) ? bound : { ok: false, reason: 'WRONG_SUBJECT' };
}

async function journeyIsAboutReport(propertyId: string, binding: GuidanceStepBinding, report: { id: string; sourceJourneyId: string | null }): Promise<boolean> {
  if (report.sourceJourneyId && report.sourceJourneyId === binding.journeyId) return true;
  const source = binding.signalSource;
  if (source.entityType === 'INSPECTION_FINDING' && source.entityId) {
    return Boolean(await prisma.inspectionFinding.findFirst({ where: { id: source.entityId, reportId: report.id, propertyId }, select: { id: true } }));
  }
  return false;
}

/** The report a journey is about, for a command launched from the journey step (the caller never names the report). */
export async function inspectionReportForJourney(propertyId: string, binding: GuidanceStepBinding): Promise<any | null> {
  const source = binding.signalSource;
  if (source.entityType === 'INSPECTION_FINDING' && source.entityId) {
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: source.entityId, propertyId }, select: { reportId: true } });
    if (finding) return prisma.inspectionReport.findFirst({ where: { id: finding.reportId, propertyId } });
  }
  return prisma.inspectionReport.findFirst({ where: { propertyId, sourceJourneyId: binding.journeyId }, orderBy: { createdAt: 'desc' } });
}

export function buildInspectionReviewCompletion(propertyId: string, actorUserId: string, review: { id: string; reportId: string; contentFingerprint: string; outcome: string; reviewedAt: Date }, target: { journeyId: string; stepKey: string; signalIntentFamily: string | null; inventoryItemId: string | null }) {
  return {
    propertyId, actorUserId, journeyId: target.journeyId, inventoryItemId: target.inventoryItemId, signalIntentFamily: target.signalIntentFamily ?? 'inspection_followup_needed', issueDomain: 'MAINTENANCE' as const,
    sourceToolKey: INSPECTION_REVIEW_TOOL_KEY, sourceEntityType: 'INSPECTION_REPORT', sourceEntityId: review.reportId, stepKey: target.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `inspection-review:${propertyId}:${review.id}:${target.stepKey}`,
    producedData: { proofType: 'inspection_report_review', proofId: review.id, reviewId: review.id, reportId: review.reportId, contentFingerprint: review.contentFingerprint, outcome: review.outcome, reviewedAt: review.reviewedAt.toISOString(), reviewedByUserId: actorUserId },
  };
}

export type ReviewReportResult = { review: any; reused: boolean; guidanceReported: boolean | null; guidanceRefusal: string | null };

/**
 * Records the review (append-only; a repeat of the same review of the same version by the same person returns the earlier row), then reports it to the journey step it was started for, if one was named. The review
 * is saved even when the step does not fit or the report fails; a refused step reports nothing and no other step is used.
 */
export async function reviewInspectionReportWithEffects(
  propertyId: string, userId: string, reportId: string, options: { outcome?: InspectionReviewOutcome; guidanceStepId?: string | null; expectedFingerprint?: string | null } = {},
): Promise<ReviewReportResult> {
  const outcome = options.outcome ?? 'REVIEWED';
  if (!INSPECTION_REVIEW_OUTCOMES.includes(outcome)) throw new APIError('Unknown review outcome.', 400, 'INSPECTION_REVIEW_OUTCOME_INVALID');
  const current = await inspectionReportFingerprint(propertyId, reportId);
  if (!current) throw new APIError('Inspection report not found.', 404, 'INSPECTION_REPORT_NOT_FOUND');
  if (!(REVIEWABLE_REPORT_STATUSES as readonly string[]).includes(current.report.status)) throw new APIError('This report is not ready to review yet.', 409, 'INSPECTION_REPORT_NOT_REVIEWABLE');
  // A caller that showed a person a version (Ask's confirmation) records the review of THAT version, never a newer one the person did not see.
  if (options.expectedFingerprint && options.expectedFingerprint !== current.fingerprint) throw new APIError('This report changed after it was shown. Review it again.', 409, 'INSPECTION_REPORT_CHANGED');
  // The step is re-read first: a review launched from a journey step records that journey and step on the row (exact lineage), and only when they fit. A repeat of the same review of the same version by
  // the same person for the same step returns the earlier row; the same review from a different step is its own row.
  const bound = options.guidanceStepId ? await resolveInspectionReviewBinding(propertyId, options.guidanceStepId, current.report) : null;
  const lineage = bound?.ok ? { journeyId: bound.binding.journeyId, stepId: options.guidanceStepId! } : { journeyId: null, stepId: null };
  const earlier = await prisma.inspectionReportReview.findFirst({ where: { propertyId, reportId, contentFingerprint: current.fingerprint, outcome, reviewedByUserId: userId, ...lineage }, orderBy: { reviewedAt: 'desc' } });
  const review = earlier ?? await prisma.inspectionReportReview.create({
    data: { propertyId, reportId, contentFingerprint: current.fingerprint, outcome, reviewedByUserId: userId, ...lineage },
  });
  if (!bound) return { review, reused: Boolean(earlier), guidanceReported: null, guidanceRefusal: null };
  if (!bound.ok) return { review, reused: Boolean(earlier), guidanceReported: false, guidanceRefusal: bound.reason };
  try {
    await guidanceJourneyService.recordToolCompletion(buildInspectionReviewCompletion(propertyId, userId, review, bound.binding));
    return { review, reused: Boolean(earlier), guidanceReported: true, guidanceRefusal: null };
  } catch (guidanceError) {
    logger.warn({ guidanceError, reviewId: review.id }, '[GUIDANCE] inspection review completion report failed');
    return { review, reused: Boolean(earlier), guidanceReported: false, guidanceRefusal: null };
  }
}
