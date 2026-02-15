// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
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

function isChecklistExplainOnly(params: {
  suppressed: boolean;
  reasons: SuppressionReasonEntryDTO[];
  action?: OrchestratedActionDTO;
  steps: DecisionTraceStepDTO[];
}) {
  const { suppressed, reasons, action, steps } = params;

  // Suppressed always goes to modal
  if (suppressed || reasons.length > 0) return false;

  const isChecklistAction = action?.source === 'CHECKLIST';
  if (isChecklistAction) return true;

  // Some checklist items might come through with a single step
  if (steps.length === 1 && steps[0]?.rule === 'CHECKLIST_ACTIONABLE') return true;

  return false;
}
function formatShortDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function humanizeStatus(s: string) {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons = [],
  steps = [],
  action,
  onOpenTrace,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Nothing to show at all
  if (!suppressed && reasons.length === 0 && steps.length === 0) return null;

  const checklistExplainOnly = useMemo(
    () => isChecklistExplainOnly({ suppressed, reasons, action, steps }),
    [suppressed, reasons, action, steps]
  );

  // Only suppressed actions should open the modal directly from the link
  const shouldOpenModalDirectly = suppressed;

  const linkText = suppressed
    ? 'See why this is hidden'
    : checklistExplainOnly
      ? 'Why am I seeing this?'
      : 'See how this was decided';

  const handleToggleExpanded = () => {
    if (shouldOpenModalDirectly && action && onOpenTrace) {
      // Suppressed → modal directly
      onOpenTrace(action);
      return;
    }

    // Checklist + normal actions → inline expand/collapse
    setExpanded((v) => !v);
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
        className="text-xs text-blue-600 hover:underline flex items-center gap-1.5 min-h-[44px] sm:min-h-0 touch-manipulation"
      >
        <Info className="h-4 w-4" />
        {linkText}
      </button>

      {/* Inline Content:
          - checklistExplainOnly → explanation snippet (no modal CTA)
          - normal → steps preview + modal CTA
      */}
      {!shouldOpenModalDirectly && expanded && (
        <div className="rounded-md border p-3 bg-gray-50 space-y-2">
          {checklistExplainOnly ? (
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-gray-800">
                From your maintenance schedule
              </div>

              {/* Optional: service category */}
              {action?.serviceCategory && (
                <div>
                  Service: <span className="text-gray-800">{String(action.serviceCategory)}</span>
                </div>
              )}

              {/* Due date + status */}
              {(() => {
                const due =
                  formatShortDate(action?.nextDueDate) ||
                  formatShortDate(action?.relatedChecklistItem?.nextDueDate);

                const overdue = !!action?.overdue;
                const status = action?.status || action?.relatedChecklistItem?.status;

                if (!due && !status && !overdue) return null;

                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {due && (
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-800'}>
                        {overdue ? `Overdue (due ${due})` : `Due ${due}`}
                      </span>
                    )}

                    {status && (
                      <span className="px-2 py-0.5 rounded bg-white border text-xs text-gray-700">
                        {humanizeStatus(String(status))}
                      </span>
                    )}

                    {action?.isRecurring && (
                      <span className="px-2 py-0.5 rounded bg-white border text-xs text-gray-700">
                        Recurring
                      </span>
                    )}
                  </div>
                );
              })()}

              <div>
                This task is showing because it’s part of your maintenance plan and requires attention.
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
