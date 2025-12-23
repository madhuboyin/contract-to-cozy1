// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useState } from 'react';
import {
  Info,
  CheckCircle,
  SkipForward,
} from 'lucide-react';

import {
  SuppressionReasonEntryDTO,
  DecisionTraceStepDTO,
} from '@/types';

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

  // 🔑 Critical: render if *either* trace or reasons exist
  if (reasons.length === 0 && steps.length === 0) return null;

  const title = suppressed
    ? 'Why this action was suppressed'
    : 'Why this action is shown';

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      {/* Header / Toggle */}
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
            <div>
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
                  <div
                    key={`step-${idx}`}
                    className="flex items-center gap-2"
                  >
                    {step.outcome === 'APPLIED' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <SkipForward className="h-4 w-4 text-gray-400" />
                    )}

                    <span className="font-mono text-xs text-gray-800">
                      {step.rule}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================
              Suppression / Explanation
             ============================ */}
          {reasons.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Explanation
              </div>

              <div className="space-y-2">
                {reasons.map((r, idx) => (
                  <div
                    key={`reason-${idx}`}
                    className="flex items-start gap-2"
                  >
                    <Info className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {r.reason}
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
