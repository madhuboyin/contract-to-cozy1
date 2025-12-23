// components/orchestration/DecisionTracePanel.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { DecisionTraceStepDTO, SuppressionReasonEntryDTO } from '@/types';
import { TRACE_COPY } from './decisionTraceLabels';

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
  const [mode, setMode] = useState<'plain' | 'technical'>('plain');

  // Persist user preference
  useEffect(() => {
    const saved = localStorage.getItem('decisionTraceMode');
    if (saved === 'technical') setMode('technical');
  }, []);

  useEffect(() => {
    localStorage.setItem('decisionTraceMode', mode);
  }, [mode]);

  if (steps.length === 0 && reasons.length === 0) return null;

  const title = suppressed
    ? TRACE_COPY.header.suppressed
    : TRACE_COPY.header.shown;

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <span>{title}</span>
        <span className="text-xs text-blue-600">
          {expanded ? 'Hide explanation' : 'View explanation'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4 text-sm">
          {/* Mode Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>Explanation mode:</span>
              <button
                onClick={() => setMode('plain')}
                className={`px-2 py-0.5 rounded ${
                  mode === 'plain'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100'
                }`}
              >
                Plain English
              </button>
              <button
                onClick={() => setMode('technical')}
                className={`px-2 py-0.5 rounded ${
                  mode === 'technical'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100'
                }`}
              >
                Technical
              </button>
            </div>

            <div
              className="flex items-center gap-1 text-xs text-gray-500"
              title={TRACE_COPY.tooltip.body}
            >
              <Info size={14} />
              {TRACE_COPY.learnWhy}
            </div>
          </div>

          {/* Section Header */}
          <div className="text-xs font-semibold uppercase text-gray-500">
            {TRACE_COPY.sectionTitle}
          </div>

          {/* Decision Steps */}
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const plain = TRACE_COPY.plainRules[
                step.rule as keyof typeof TRACE_COPY.plainRules
              ];

              if (mode === 'plain' && plain) {
                return (
                  <div
                    key={idx}
                    className="flex gap-2 items-start"
                  >
                    <span className="text-lg">{plain.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {plain.title}
                      </div>
                      <div className="text-xs text-gray-600">
                        {plain.description}
                      </div>
                    </div>
                  </div>
                );
              }

              // Technical mode
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 font-mono text-xs text-gray-700"
                >
                  <span>
                    {step.outcome === 'APPLIED' ? '✅' : '⏭'}
                  </span>
                  <span>{step.rule}</span>
                  <span className="text-gray-400">
                    → {step.outcome}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
