// components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import {
  SuppressionReasonEntryDTO,
  DecisionTraceStepDTO,
} from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TRACE_COPY } from './decisionTraceLabels';

type Props = {
  suppressed: boolean;
  reasons?: SuppressionReasonEntryDTO[];
  steps?: DecisionTraceStepDTO[];
};

function suppressionSummary(reason?: SuppressionReasonEntryDTO) {
  if (!reason) {
    return 'This action is hidden because it is no longer relevant right now.';
  }

  switch (reason.reason) {
    case 'BOOKING_EXISTS':
      return 'This action is hidden because related work is already scheduled.';
    case 'COVERED':
      return 'This action is hidden because it is already covered by a warranty or insurance.';
    default:
      return 'This action is hidden because it does not currently require attention.';
  }
}

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons = [],
  steps = [],
}) => {
  const [expanded, setExpanded] = useState(false);

  // Nothing to show
  if (reasons.length === 0 && steps.length === 0) return null;

  const primaryReason = reasons[0];

  const headerTitle = suppressed
    ? 'Why this action is hidden'
    : 'Why you’re seeing this';

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <span>{headerTitle}</span>
        <span className="text-xs text-blue-600">
          {expanded ? 'Hide explanation' : 'See how this was decided'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pt-3 pb-4 space-y-4 text-sm">

          {/* 🔴 SUPPRESSION SUMMARY (TOP PRIORITY) */}
          {suppressed && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Hidden:</strong> {suppressionSummary(primaryReason)}
            </div>
          )}

          {/* ============================
              DECISION ENGINE TRACE
             ============================ */}
          {steps.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase">
                  How we decided this
                </div>

                {/* ✅ FIXED: Internal evaluation with working tooltip */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-gray-900 flex items-center gap-1 cursor-help"
                      >
                        <Info size={12} />
                        Internal evaluation
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">
                          {TRACE_COPY.tooltip.title}
                        </div>
                        <div className="text-xs text-gray-700">
                          {TRACE_COPY.tooltip.body}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div
                    key={`step-${idx}`}
                    className="flex items-start gap-2"
                  >
                    <span className="mt-0.5">
                      {step.outcome === 'APPLIED' ? '✅' : '⭕'}
                    </span>

                    <div>
                      <div className="font-medium text-gray-800">
                        {humanizeRule(step.rule)}
                      </div>

                      {step.details && (
                        <div className="text-xs text-muted-foreground">
                          {humanizeDetails(step)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================
              SUPPRESSION EXPLANATION
             ============================ */}
          {suppressed && reasons.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Why it's hidden
              </div>

              <div className="space-y-2">
                {reasons.map((r, idx) => (
                  <div
                    key={`reason-${idx}`}
                    className="flex items-start gap-2"
                  >
                    <span className="mt-0.5">🛑</span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {r.reason.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

/* -------------------------------
   Helpers (Plain English)
-------------------------------- */

function humanizeRule(rule: string) {
  switch (rule) {
    case 'RISK_ACTIONABLE':
      return 'This issue needs attention';
    case 'RISK_INFER_ASSET_KEY':
      return 'We identified the part of your home involved';
    case 'COVERAGE_MATCHING':
      return 'We checked your warranties and insurance';
    case 'COVERAGE_AWARE_CTA':
      return 'Your coverage was considered';
    case 'BOOKING_SUPPRESSION':
      return 'We checked for existing scheduled work';
    case 'SUPPRESSION_FINAL':
      return 'Final decision made';
    default:
      return rule.replace(/_/g, ' ');
  }
}

function humanizeDetails(step: DecisionTraceStepDTO) {
  if (!step.details) return null;

  if (step.rule === 'BOOKING_SUPPRESSION') {
    return step.outcome === 'APPLIED'
      ? 'Related work is already scheduled.'
      : 'No related work is currently scheduled.';
  }

  if (step.rule === 'COVERAGE_MATCHING') {
    return step.details?.type === 'NONE'
      ? 'No active coverage was found for this issue.'
      : 'Active coverage was found.';
  }

  return 'Additional context evaluated.';
}