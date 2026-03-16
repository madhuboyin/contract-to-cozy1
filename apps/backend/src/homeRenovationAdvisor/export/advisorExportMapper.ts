// apps/backend/src/homeRenovationAdvisor/export/advisorExportMapper.ts
//
// Produces a flat, human-readable export view model for a completed advisor session.
// Suitable for PDF generation, print views, or external sharing.
// Includes disclaimer, confidence notes, and all key findings.

import type { HomeRenovationAdvisorSessionResponse } from '../types/homeRenovationAdvisor.types';
import { getRenovationLabel } from '../engine/summary/summaryBuilder.service';

export interface AdvisorExportViewModel {
  exportedAt: string;
  sessionId: string;
  propertyId: string;
  renovationLabel: string;
  jurisdiction: string;
  evaluatedAt: string | null;
  flowType: string;
  isRetroactiveCheck: boolean;

  // Overall findings
  overallRiskLevel: string;
  overallConfidence: string;
  overallSummary: string | null;

  // Module findings
  permit: {
    status: string;
    confidence: string;
    summary: string;
    costRange: string | null;
    timelineRange: string | null;
    dataAvailable: boolean;
    sourceLabel: string;
  };
  taxImpact: {
    confidence: string;
    summary: string;
    monthlyIncreaseRange: string | null;
    annualIncreaseRange: string | null;
    reassessmentType: string;
    dataAvailable: boolean;
    sourceLabel: string;
  };
  licensing: {
    status: string;
    confidence: string;
    summary: string;
    consequenceSummary: string;
    dataAvailable: boolean;
    sourceLabel: string;
  };

  // Warnings (CRITICAL and WARNING only)
  warnings: Array<{
    severity: string;
    title: string;
    description: string;
  }>;

  // Next actions
  nextActions: Array<{
    priority: number;
    label: string;
    description: string;
  }>;

  // Assumptions (user-visible only)
  assumptions: Array<{
    label: string;
    value: string | null;
    unit: string | null;
    rationale: string | null;
  }>;

  // Compliance checklist (retroactive only)
  complianceChecklist?: {
    permitObtained: string;
    licensedContractorUsed: string;
    reassessmentReceived: string;
  } | null;

  // Trust / disclaimer
  disclaimerText: string | null;
  disclaimerVersion: string | null;
  warningsSummary: string | null;
}

export function buildExportViewModel(
  session: HomeRenovationAdvisorSessionResponse,
): AdvisorExportViewModel {
  const jurisdictionParts = [
    session.jurisdiction.city,
    session.jurisdiction.state,
    session.jurisdiction.postalCode,
  ].filter(Boolean);
  const jurisdiction = jurisdictionParts.length > 0 ? jurisdictionParts.join(', ') : 'Unknown';

  function formatRange(min: number | null, max: number | null, prefix = '$'): string | null {
    if (min == null && max == null) return null;
    const minStr = min != null ? `${prefix}${Math.round(min).toLocaleString()}` : null;
    const maxStr = max != null ? `${prefix}${Math.round(max).toLocaleString()}` : null;
    if (minStr && maxStr && minStr !== maxStr) return `${minStr}–${maxStr}`;
    return maxStr ?? minStr;
  }

  function formatDayRange(min: number | null, max: number | null): string | null {
    if (min == null && max == null) return null;
    if (min != null && max != null && min !== max) return `${min}–${max} days`;
    return `${max ?? min} days`;
  }

  const permitExport = session.permit
    ? {
        status: session.permit.requirementStatus,
        confidence: session.permit.confidenceLevel,
        summary: session.permit.summary,
        costRange: formatRange(session.permit.costRange.min, session.permit.costRange.max),
        timelineRange: formatDayRange(session.permit.timelineRangeDays.min, session.permit.timelineRangeDays.max),
        dataAvailable: session.permit.dataAvailable,
        sourceLabel: session.permit.sourceMeta.sourceLabel,
      }
    : {
        status: 'UNKNOWN',
        confidence: 'UNAVAILABLE',
        summary: 'Permit data not available.',
        costRange: null,
        timelineRange: null,
        dataAvailable: false,
        sourceLabel: 'Not evaluated',
      };

  const taxExport = session.taxImpact
    ? {
        confidence: session.taxImpact.confidenceLevel,
        summary: session.taxImpact.plainLanguageSummary,
        monthlyIncreaseRange: formatRange(
          session.taxImpact.monthlyTaxIncreaseRange.min,
          session.taxImpact.monthlyTaxIncreaseRange.max,
        ),
        annualIncreaseRange: formatRange(
          session.taxImpact.annualTaxIncreaseRange.min,
          session.taxImpact.annualTaxIncreaseRange.max,
        ),
        reassessmentType: session.taxImpact.reassessmentTriggerType,
        dataAvailable: session.taxImpact.dataAvailable,
        sourceLabel: session.taxImpact.sourceMeta.sourceLabel,
      }
    : {
        confidence: 'UNAVAILABLE',
        summary: 'Tax data not available.',
        monthlyIncreaseRange: null,
        annualIncreaseRange: null,
        reassessmentType: 'UNKNOWN',
        dataAvailable: false,
        sourceLabel: 'Not evaluated',
      };

  const licensingExport = session.licensing
    ? {
        status: session.licensing.requirementStatus,
        confidence: session.licensing.confidenceLevel,
        summary: session.licensing.plainLanguageSummary,
        consequenceSummary: session.licensing.consequenceSummary,
        dataAvailable: session.licensing.dataAvailable,
        sourceLabel: session.licensing.sourceMeta.sourceLabel,
      }
    : {
        status: 'UNKNOWN',
        confidence: 'UNAVAILABLE',
        summary: 'Licensing data not available.',
        consequenceSummary: '',
        dataAvailable: false,
        sourceLabel: 'Not evaluated',
      };

  const exportableWarnings = (session.warnings ?? [])
    .filter((w) => w.severity === 'CRITICAL' || w.severity === 'WARNING')
    .map((w) => ({
      severity: w.severity,
      title: w.title,
      description: w.description,
    }));

  const exportableActions = (session.nextActions ?? []).map((a) => ({
    priority: a.priority,
    label: a.label,
    description: a.description,
  }));

  const exportableAssumptions = (session.assumptions ?? [])
    .filter((a) => a.isUserVisible)
    .map((a) => ({
      label: a.assumptionLabel,
      value: a.assumptionValueText,
      unit: a.assumptionUnit,
      rationale: a.rationale,
    }));

  const complianceChecklistExport = session.complianceChecklist
    ? {
        permitObtained: session.complianceChecklist.permitObtainedStatus,
        licensedContractorUsed: session.complianceChecklist.licensedContractorUsedStatus,
        reassessmentReceived: session.complianceChecklist.reassessmentReceivedStatus,
      }
    : null;

  return {
    exportedAt: new Date().toISOString(),
    sessionId: session.id,
    propertyId: session.propertyId,
    renovationLabel: session.renovationLabel,
    jurisdiction,
    evaluatedAt: session.lastEvaluatedAt,
    flowType: session.flowType,
    isRetroactiveCheck: session.isRetroactiveCheck,
    overallRiskLevel: session.overallRiskLevel ?? 'UNKNOWN',
    overallConfidence: session.overallConfidence ?? 'UNAVAILABLE',
    overallSummary: session.overallSummary,
    permit: permitExport,
    taxImpact: taxExport,
    licensing: licensingExport,
    warnings: exportableWarnings,
    nextActions: exportableActions,
    assumptions: exportableAssumptions,
    complianceChecklist: complianceChecklistExport,
    disclaimerText: session.disclaimerText ?? null,
    disclaimerVersion: session.disclaimerVersion ?? null,
    warningsSummary: session.warningsSummary ?? null,
  };
}
