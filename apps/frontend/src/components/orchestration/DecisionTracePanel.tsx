// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx
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
   * Required for modal + resolution actions
   */
  action?: OrchestratedActionDTO;

  /**
   * Called when user marks action completed from modal
   */
  onMarkCompleted?: (action: OrchestratedActionDTO) => void;

  /**
   * Called when user undoes completion
   */
  onUndo?: (action: OrchestratedActionDTO) => void;
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
      return (
        reason.message ||
        'This action is hidden because it does not currently require attention.'
      );
  }
}

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons = [],
  steps = [],
  action,
  onMarkCompleted,
  onUndo,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Nothing to show at all
  if (reasons.length === 0 && steps.length === 0) return null;

  const primaryReason = reasons[0];

  // 🔑 Check if this is a user-marked-complete RISK action
  const isUserMarkedComplete = 
    action?.source === 'RISK' &&  // 🔑 Only for RISK actions, not CHECKLIST
    action?.suppression?.suppressionSource?.type === 'USER_EVENT' &&
    action?.suppression?.suppressionSource?.eventType === 'USER_MARKED_COMPLETE';

  const headerTitle = suppressed
    ? 'Why this action is hidden'
    : 'How we decided this';

  // 🔑 UX IMPROVEMENT: For suppressed actions, open modal directly instead of inline expansion
  const handleOpenModal = () => {
    setModalOpen(true);
  };

  const handleToggleExpanded = () => {
    if (suppressed) {
      // For suppressed actions, open modal directly
      handleOpenModal();
    } else {
      // For active actions, toggle inline expansion
      setExpanded(v => !v);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      {/* Header */}
      <button
        type="button"
        onClick={handleToggleExpanded}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        <Info className="h-3 w-3" />
        {suppressed ? 'See why this is hidden' : 'See how this was decided'}
      </button>

      {/* Inline Content - Only for non-suppressed actions */}
      {!suppressed && expanded && (
        <div className="rounded-md border p-3 bg-gray-50 space-y-2">
          {steps.length > 0 && (
            <div className="space-y-2">
              {steps.slice(0, 3).map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <span className="text-green-700 font-semibold">
                    {step.outcome === 'APPLIED' ? '✅' : '⭕'}
                  </span>

                  <div>
                    <div className="font-medium text-gray-800">
                      {humanizeRule(step.rule)}
                    </div>

                    {humanizeDetails(step) && (
                      <div className="text-xs text-muted-foreground">
                        {humanizeDetails(step)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenModal}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            {steps.length > 3 ? 'View full decision trace' : 'View details'}
          </button>
        </div>
      )}

      {/* Modal */}
      <DecisionTraceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        steps={steps}
        onMarkCompleted={
          action && onMarkCompleted && !suppressed
            ? () => onMarkCompleted(action)
            : undefined
        }
        onUndo={
          // 🔑 Only show Undo for RISK actions that were user-marked-complete
          action && onUndo && isUserMarkedComplete
            ? () => onUndo(action)
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
    case 'USER_MARKED_COMPLETE':
      return 'You marked this recommendation as completed';
    case 'CHECKLIST_SUPPRESSION':
    case 'CHECKLIST_SUPPRESSION_AUTHORITATIVE':
      return 'This is already tracked in your maintenance checklist';
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

  return 'Additional context was evaluated.';
}