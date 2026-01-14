// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import {
  SuppressionReasonEntryDTO,
  DecisionTraceStepDTO,
  OrchestratedActionDTO,
} from '@/types';

import { DecisionTraceItem } from './DecisionTraceItem';

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

  // Open modal directly for suppressed actions OR checklist items
  const shouldOpenModalDirectly = suppressed || isChecklistAction;

  const handleToggleExpanded = () => {
    if (shouldOpenModalDirectly && action && onOpenTrace) {
      onOpenTrace(action);
    } else {
      setExpanded((v) => !v);
    }
  };

  const handleOpenModal = () => {
    if (action && onOpenTrace) onOpenTrace(action);
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
                <DecisionTraceItem
                  key={`trace-step-${idx}`}
                  type="RULE"
                  step={step}
                />
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
