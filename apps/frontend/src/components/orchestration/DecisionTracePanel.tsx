'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import {
  SuppressionReasonEntryDTO,
  DecisionTraceStepDTO,
  OrchestratedActionDTO,
} from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TRACE_COPY } from './decisionTraceLabels';
import { DecisionTraceModal } from './DecisionTraceModal';

type Props = {
  suppressed: boolean;
  reasons?: SuppressionReasonEntryDTO[];
  steps?: DecisionTraceStepDTO[];

  /**
   * NEW — required to allow resolution from modal
   */
  action?: OrchestratedActionDTO;

  /**
   * NEW — called when user marks action completed from modal
   */
  onMarkCompleted?: (action: OrchestratedActionDTO) => void;
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
    case 'CHECKLIST_TRACKED':
      return 'This action is hidden because it is already tracked in your maintenance checklist.';
    default:
      return reason.message || 'This action is hidden because it does not currently require attention.';
  }
}

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons = [],
  steps = [],
  action,
  onMarkCompleted,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Nothing to show
  if (reasons.length === 0 && steps.length === 0) return null;

  const primaryReason = reasons[0];

  const headerTitle = suppressed
    ? 'Why this action is hidden'
    : 'Why you’re seeing this';

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      {/* ================= Header ================= */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium text-gray-700">
          {headerTitle}
        </span>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-xs text-blue-600 hover:underline"
        >
          See how this was decided
        </button>
      </div>

      {/* ================= Inline Summary ================= */}
      {expanded && (
        <div className="px-4 pt-3 pb-4 space-y-4 text-sm">
          {/* 🔴 SUPPRESSION SUMMARY */}
          {suppressed && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Hidden:</strong> {suppressionSummary(primaryReason)}
            </div>
          )}

          {/* ============================
              DECISION ENGINE TRACE (INLINE)
             ============================ */}
          {steps.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase">
                  How we decided this
                </div>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-900"
                      >
                        <Info className="h-3.5 w-3.5" />
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
                {steps.slice(0, 3).map((step, idx) => (
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

              {steps.length > 3 && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  View full decision trace
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= Modal ================= */}
      <DecisionTraceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        steps={steps}
        onMarkCompleted={
          action && onMarkCompleted
            ? () => onMarkCompleted(action)
            : undefined
        }
      />
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
