// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';

import {
  SuppressionReasonEntryDTO,
  DecisionTraceStepDTO,
} from '@/types';

import { DecisionTraceItem } from './DecisionTraceItem';

type Props = {
  suppressed: boolean;
  reasons?: SuppressionReasonEntryDTO[];
  steps?: DecisionTraceStepDTO[];
};

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons = [],
  steps = [],
}) => {
  const [expanded, setExpanded] = useState(false);

  /**
   * 🔑 Critical:
   * Render if EITHER rules OR reasons exist
   * (this fixes missing "View decision trace" for active actions)
   */
  if (reasons.length === 0 && steps.length === 0) return null;

  const title = suppressed
    ? 'Why this action was suppressed'
    : 'Why this action is shown';

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      {/* Toggle Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <span>{title}</span>
        <span className="text-xs text-blue-600">
          {expanded ? 'Hide details' : 'View decision trace'}
        </span>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4 text-sm">
          {/* ============================
              Decision Engine Trace
             ============================ */}
          {steps.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500 uppercase">
                  Decision Engine Trace
                </div>

                <a
                  href="/docs/orchestration/decision-engine"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Info size={12} />
                  Learn why
                </a>
              </div>

              <div className="space-y-1">
                {steps.map((step, idx) => (
                  <DecisionTraceItem
                    key={`step-${idx}`}
                    type="RULE"
                    step={step}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ============================
              Suppression / Explanation
             ============================ */}
          {reasons.length > 0 && (
            <section>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Explanation
              </div>

              <div className="space-y-1">
                {reasons.map((reason, idx) => (
                  <DecisionTraceItem
                    key={`reason-${idx}`}
                    type="REASON"
                    reason={reason}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
