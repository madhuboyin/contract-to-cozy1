// apps/frontend/src/components/orchestration/DecisionTraceItem.tsx

import React from 'react';
import { SuppressionReasonEntryDTO } from '@/types';

export const DecisionTraceItem: React.FC<{ entry: SuppressionReasonEntryDTO }> = ({ entry }) => {
  const reason = entry.reason;

  const pillClass =
    reason === 'COVERED'
      ? 'bg-green-100 text-green-700'
      : reason === 'BOOKING_EXISTS'
      ? 'bg-blue-100 text-blue-700'
      : reason === 'NOT_ACTIONABLE'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-700';

  return (
    <div className="border-l-2 border-gray-300 pl-4 py-2 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${pillClass}`}>
          {reason.replaceAll('_', ' ')}
        </span>

        {entry.relatedType && (
          <span className="text-xs text-gray-500">
            via {entry.relatedType.toLowerCase()}
          </span>
        )}
      </div>

      {entry.message && <p className="text-sm text-gray-700">{entry.message}</p>}
    </div>
  );
};
