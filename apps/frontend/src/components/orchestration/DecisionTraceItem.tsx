// apps/frontend/src/components/orchestration/DecisionTraceItem.tsx
'use client';

import React from 'react';
import {
  CheckCircle2,
  SkipForward,
  Info,
} from 'lucide-react';
import {
  DecisionTraceStepDTO,
  SuppressionReasonEntryDTO,
} from '@/types';

/**
 * Human-readable labels for orchestration rules.
 * Keep this as the single source of truth.
 */
const RULE_LABELS: Record<
  string,
  {
    label: string;
    description?: string;
  }
> = {
  RISK_ACTIONABLE: {
    label: 'Risk severity requires attention',
  },
  CHECKLIST_ACTIONABLE: {
    label: 'Maintenance task requires action',
  },
  RISK_INFER_SERVICE_CATEGORY: {
    label: 'Service category inferred from asset',
  },
  COVERAGE_AWARE_CTA: {
    label: 'Coverage evaluated and CTA adjusted',
  },
  BOOKING_SUPPRESSION: {
    label: 'Existing booking checked',
  },
  SUPPRESSION_FINAL: {
    label: 'Final suppression decision',
  },
};

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

    const meta = RULE_LABELS[step.rule];

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
            {meta?.label ?? step.rule}
          </div>

          {/* Optional short explanation */}
          {meta?.description && (
            <div className="text-xs text-muted-foreground">
              {meta.description}
            </div>
          )}

          {/* Optional structured details */}
          {step.details && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Info size={12} />
              <span>
                {formatRuleDetails(step.details)}
              </span>
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
          {humanizeEnum(reason.reason)}
        </div>

        <div className="text-xs text-muted-foreground">
          {reason.message}
        </div>
      </div>
    </div>
  );
};

/**
 * ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------
 */

function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

/**
 * Converts rule details into a readable inline explanation.
 * Avoids raw JSON output.
 */
function formatRuleDetails(details: Record<string, any>) {
  if (details.serviceCategory) {
    return `Service: ${details.serviceCategory}`;
  }

  if (details.coverageType) {
    return `Coverage: ${details.coverageType}`;
  }

  if (details.bookingStatus) {
    return `Booking status: ${details.bookingStatus}`;
  }

  if (details.reason) {
    return humanizeEnum(details.reason);
  }

  return 'Additional context evaluated';
}
