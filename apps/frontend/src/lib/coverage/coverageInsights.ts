import type { CoverageAnalysisDTO } from '@/lib/api/coverageAnalysisApi';
import type { TrustMetadata, ConfidenceLevel } from '@/lib/types/trust';

type CoverageAnalysisLike = Pick<CoverageAnalysisDTO, 'overallVerdict' | 'confidence' | 'computedAt'> | null | undefined;

export function coverageVerdictMeta(verdict?: string) {
  if (verdict === 'WORTH_IT') {
    return { label: 'Coverage is in good shape', cls: 'bg-emerald-100 text-emerald-700' };
  }
  if (verdict === 'SITUATIONAL') {
    return { label: 'Review coverage soon', cls: 'bg-amber-100 text-amber-700' };
  }
  if (verdict === 'NOT_WORTH_IT') {
    return { label: 'Coverage may be overpriced', cls: 'bg-red-100 text-red-700' };
  }
  return { label: 'Coverage check not run', cls: 'bg-slate-100 text-slate-500' };
}

export function toConfidenceLevel(confidence?: string): ConfidenceLevel {
  if (confidence === 'HIGH') return 'high';
  if (confidence === 'MEDIUM') return 'medium';
  return 'low';
}

export function buildCoverageTrustMetadata(
  analysis: CoverageAnalysisLike,
  source = 'Coverage Analysis AI'
): TrustMetadata {
  return {
    confidence: toConfidenceLevel(analysis?.confidence),
    source,
    lastUpdated: analysis?.computedAt || new Date().toISOString(),
  };
}

export function coverageGapSummaryText(gapCount: number): string {
  if (gapCount <= 0) return 'No major coverage gaps found.';
  if (gapCount === 1) return '1 coverage gap needs attention.';
  return `${gapCount} coverage gaps need attention.`;
}

