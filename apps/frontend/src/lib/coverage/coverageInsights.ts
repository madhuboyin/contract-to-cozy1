import type { CoverageAnalysisDTO } from '@/lib/api/coverageAnalysisApi';
import type { TrustMetadata, ConfidenceLevel } from '@/lib/types/trust';

type CoverageAnalysisLike = Pick<CoverageAnalysisDTO, 'insuranceReviewState' | 'confidence' | 'computedAt'> | null | undefined;

export function coverageReviewMeta(state?: CoverageAnalysisDTO['insuranceReviewState']) {
  if (state === 'QUESTIONS_PRESENT') {
    return { label: 'Questions to review', cls: 'bg-amber-100 text-amber-800' };
  }
  if (state === 'NO_QUESTIONS_FROM_REVIEWED_FIELDS') {
    return { label: 'Reviewed fields checked', cls: 'bg-slate-100 text-slate-700' };
  }
  if (state === 'POLICY_RECORD_INCOMPLETE') {
    return { label: 'Policy record incomplete', cls: 'bg-slate-100 text-slate-700' };
  }
  return { label: 'Record review not run', cls: 'bg-slate-100 text-slate-600' };
}

export function toConfidenceLevel(confidence?: string): ConfidenceLevel {
  if (confidence === 'HIGH') return 'high';
  if (confidence === 'MEDIUM') return 'medium';
  return 'low';
}

export function buildCoverageTrustMetadata(
  analysis: CoverageAnalysisLike,
  source = 'Coverage & Premium Review'
): TrustMetadata {
  return {
    confidence: toConfidenceLevel(analysis?.confidence),
    source,
    lastUpdated: analysis?.computedAt || new Date().toISOString(),
  };
}

export function coverageGapSummaryText(gapCount: number): string {
  if (gapCount <= 0) return 'No questions were generated from the available reviewed fields.';
  if (gapCount === 1) return '1 record question needs review.';
  return `${gapCount} record questions need review.`;
}
