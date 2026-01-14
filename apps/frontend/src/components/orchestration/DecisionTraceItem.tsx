// apps/frontend/src/components/orchestration/DecisionTraceItem.tsx
'use client';

import React from 'react';
import { CheckCircle2, SkipForward, Info } from 'lucide-react';
import {
  DecisionTraceStepDTO,
  SuppressionReasonEntryDTO,
} from '@/types';

import {
  getRuleMeta,
  formatRuleDetails,
  getSuppressionReasonLabel,
} from './decisionTraceLabels';

type Props =
  | {
      type: 'RULE';
      step: DecisionTraceStepDTO;
    }
  | {
      type: 'REASON';
      reason: SuppressionReasonEntryDTO;
    };

export const DecisionTraceItem: React.FC<Props> = (props) => {
  /**
   * ------------------------------------------------------------------
   * RULE TRACE ITEM
   * ------------------------------------------------------------------
   */
  if (props.type === 'RULE') {
    const { step } = props;
    const applied = step.outcome === 'APPLIED';

    const meta = getRuleMeta(step.rule);

    return (
      <div className="flex items-start gap-2 text-sm">
        {applied ? (
          <CheckCircle2
            className="text-green-600 mt-0.5"
            size={16}
          />
        ) : (
          <SkipForward
            className="text-gray-400 mt-0.5"
            size={16}
          />
        )}

        <div className="space-y-0.5">
          <div className="font-medium text-gray-800">
            {meta.label}
          </div>

          {meta.description && (
            <div className="text-xs text-muted-foreground">
              {meta.description}
            </div>
          )}

          {step.details && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Info size={12} />
              <span>{formatRuleDetails(step.details)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /**
   * ------------------------------------------------------------------
   * SUPPRESSION / EXPLANATION ITEM
   * ------------------------------------------------------------------
   */
  const { reason } = props;

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 mt-0.5">•</span>

      <div className="space-y-0.5">
        <div className="font-medium text-gray-800">
          {getSuppressionReasonLabel(reason.reason)}
        </div>

        <div className="text-xs text-muted-foreground">
          {reason.message}
        </div>
      </div>
    </div>
  );
};
