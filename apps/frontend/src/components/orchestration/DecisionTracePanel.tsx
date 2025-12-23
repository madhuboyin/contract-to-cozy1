import React, { useState } from 'react';
import { SuppressionReasonEntryDTO } from '@/types';
import { DecisionTraceItem } from './DecisionTraceItem';

type Props = {
  suppressed: boolean;
  reasons: SuppressionReasonEntryDTO[];
};

export const DecisionTracePanel: React.FC<Props> = ({
  suppressed,
  reasons,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!reasons || reasons.length === 0) return null;

  /**
   * High-level summary shown before expand
   * (prevents “everything looks the same” problem)
   */
  const primaryReason = reasons[0];

  const summaryLabel = suppressed
    ? 'Why this action was suppressed'
    : 'Why this action is shown';

  const summaryHint = (() => {
    if (primaryReason.reason === 'COVERED') {
      return 'Coverage detected';
    }
    if (primaryReason.reason === 'BOOKING_EXISTS') {
      return 'Already in progress';
    }
    return 'Decision logic applied';
  })();

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <div className="flex flex-col text-left">
          <span>{summaryLabel}</span>
          {!expanded && (
            <span className="text-xs text-muted-foreground">
              {summaryHint}
            </span>
          )}
        </div>

        <span className="text-xs text-blue-600">
          {expanded ? 'Hide details' : 'View decision trace'}
        </span>
      </button>

      {/* Expanded Trace */}
      {expanded && (
        <div className="px-4 pb-3 pt-2 space-y-2">
          {reasons.map((r, idx) => (
            <DecisionTraceItem key={idx} entry={r} />
          ))}

          {/* Educational footer (non-intrusive) */}
          <div className="pt-2 text-xs text-muted-foreground border-t">
            Decisions are evaluated using your property data, bookings,
            coverage, and risk signals. This logic improves over time.
          </div>
        </div>
      )}
    </div>
  );
};
