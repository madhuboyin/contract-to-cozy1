// apps/frontend/src/components/orchestration/DecisionTracePanel.tsx

import React, { useState } from 'react';
import { SuppressionReasonEntryDTO } from '@/types';
import { DecisionTraceItem } from './DecisionTraceItem';

export const DecisionTracePanel: React.FC<{
  suppressed: boolean;
  reasons: SuppressionReasonEntryDTO[];
}> = ({ suppressed, reasons }) => {
  const [expanded, setExpanded] = useState(false);

  if (!reasons || reasons.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <span>
          {suppressed ? 'Why this action was suppressed' : 'Why this action is shown'}
        </span>
        <span className="text-xs">{expanded ? 'Hide details' : 'View decision trace'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {reasons.map((r, idx) => (
            <DecisionTraceItem key={idx} entry={r} />
          ))}
        </div>
      )}
    </div>
  );
};
