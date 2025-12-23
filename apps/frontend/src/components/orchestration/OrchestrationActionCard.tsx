// components/orchestration/OrchestrationActionCard.tsx
import React from 'react';
import { OrchestratedActionDTO } from '@/types';
import { DecisionTracePanel } from './DecisionTracePanel';

type Props = {
  action: OrchestratedActionDTO;
  onCtaClick?: (action: OrchestratedActionDTO) => void;
};

function formatMoney(amount?: number | null) {
  if (amount === null || amount === undefined) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDateLabel(date?: string | Date | null) {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

function riskBadge(riskLevel?: string | null) {
  if (!riskLevel) return null;

  const base = 'text-xs font-semibold px-2 py-0.5 rounded';

  switch (riskLevel) {
    case 'CRITICAL':
    case 'HIGH':
      return <span className={`${base} bg-red-100 text-red-700`}>{riskLevel}</span>;
    case 'ELEVATED':
    case 'MODERATE':
      return <span className={`${base} bg-amber-100 text-amber-700`}>{riskLevel}</span>;
    case 'LOW':
      return <span className={`${base} bg-green-100 text-green-700`}>{riskLevel}</span>;
    default:
      return <span className={`${base} bg-gray-100 text-gray-700`}>{riskLevel}</span>;
  }
}

export const OrchestrationActionCard: React.FC<Props> = ({
  action,
  onCtaClick,
}) => {
  const suppressed = Boolean(action.suppression?.suppressed);

  const exposure = formatMoney(action.exposure ?? null);
  const dueDateLabel = formatDateLabel(action.nextDueDate ?? null);

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        suppressed ? 'bg-gray-50 opacity-70' : 'bg-white'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-900">
              {action.title}
            </h3>
            {riskBadge(action.riskLevel)}
            {action.category && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                {action.category}
              </span>
            )}
          </div>

          {action.description && (
            <p className="text-sm text-gray-600">{action.description}</p>
          )}
        </div>

        {/* Meta */}
        <div className="text-right space-y-1">
          {exposure && (
            <div className="text-sm font-semibold text-gray-900">
              {exposure}
            </div>
          )}
          {dueDateLabel && (
            <div className="text-xs text-gray-600">
              Due {dueDateLabel}
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      {action.cta?.show && action.cta.label && (
        <div className="mt-4">
          <button
            type="button"
            disabled={suppressed}
            onClick={() => onCtaClick?.(action)}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              suppressed
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={
              suppressed
                ? 'This action is currently suppressed'
                : undefined
            }
          >
            {action.cta.label}
          </button>
        </div>
      )}

      {/* Decision Trace */}
      {action.suppression?.reasons && action.suppression.reasons.length > 0 && (
        <DecisionTracePanel
          suppressed={action.suppression.suppressed}
          reasons={action.suppression.reasons}
        />
      )}
    </div>
  );
};
