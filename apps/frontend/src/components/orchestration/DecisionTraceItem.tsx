// apps/frontend/src/components/orchestration/DecisionTraceItem.tsx
'use client';

import React from 'react';
import { CheckCircle2, SkipForward } from 'lucide-react';
import {
  DecisionTraceStepDTO,
  SuppressionReasonEntryDTO,
} from '@/types';

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
  if (props.type === 'RULE') {
    const { step } = props;
    const applied = step.outcome === 'APPLIED';

    return (
      <div className="flex items-start gap-2 text-sm">
        {applied ? (
          <CheckCircle2 className="text-green-600 mt-0.5" size={16} />
        ) : (
          <SkipForward className="text-gray-400 mt-0.5" size={16} />
        )}

        <div>
          <div className="font-medium text-gray-800">
            {step.rule}
          </div>

          {step.details && (
            <div className="text-xs text-muted-foreground">
              {JSON.stringify(step.details)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // SUPPRESSION / REASON
  const { reason } = props;

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 mt-0.5">•</span>
      <div>
        <div className="font-medium text-gray-800">
          {reason.reason.replace(/_/g, ' ')}
        </div>
        <div className="text-xs text-muted-foreground">
          {reason.message}
        </div>
      </div>
    </div>
  );
};
