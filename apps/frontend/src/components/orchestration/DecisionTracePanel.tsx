// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import {
  SuppressionReasonEntryDTO,
  DecisionTraceStepDTO,
  OrchestratedActionDTO,
} from '@/types';

type Props = {
  suppressed: boolean;
  reasons?: SuppressionReasonEntryDTO[];
  steps?: DecisionTraceStepDTO[];
  action?: OrchestratedActionDTO;

  /**
   * Called when user wants to open the decision trace modal
   * Parent component handles the modal
   */
  onOpenTrace?: (action: OrchestratedActionDTO) => void;
};

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons = [],
  steps = [],
  action,
  onOpenTrace,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Nothing to show at all
  if (reasons.length === 0 && steps.length === 0) return null;

  const isChecklistAction = action?.source === 'CHECKLIST';

  // 🔑 UX IMPROVEMENT: Open modal directly for suppressed actions OR checklist items
  const shouldOpenModalDirectly = suppressed || isChecklistAction;

  const handleToggleExpanded = () => {
    if (shouldOpenModalDirectly && action && onOpenTrace) {
      // For suppressed actions or checklist items, open modal directly
      onOpenTrace(action);
    } else {
      // For active RISK actions, toggle inline expansion
      setExpanded(v => !v);
    }
  };

  const handleOpenModal = () => {
    if (action && onOpenTrace) {
      onOpenTrace(action);
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

      {/* Inline Content - Only for active RISK actions (not suppressed, not checklist) */}
      {!shouldOpenModalDirectly && expanded && (
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
    case 'CHECKLIST_ACTIONABLE':
      return 'This maintenance task needs attention';
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