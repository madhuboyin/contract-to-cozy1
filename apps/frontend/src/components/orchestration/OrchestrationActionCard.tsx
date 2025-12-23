// components/orchestration/OrchestrationActionCard.tsx
import React from 'react';
import { OrchestratedActionDTO } from '@/types';
import { DecisionTracePanel } from './DecisionTracePanel';

type Props = {
  action: OrchestratedActionDTO;
  onCtaClick?: (action: OrchestratedActionDTO) => void;
  onDismiss?: () => void;
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


/**
 * Suppress description if it duplicates CTA intent
 */
function resolveDescription(
  description?: string | null,
  ctaLabel?: string | null
) {
  if (!description) return null;
  if (!ctaLabel) return description;

  const d = description.toLowerCase();
  const c = ctaLabel.toLowerCase();

  if (d.includes(c)) return null;

  return description;
}

function confidenceLabel(score?: number) {
  if (score === undefined || score === null) return null;
  if (score >= 0.75) return { label: 'High', color: 'bg-green-100 text-green-700' };
  if (score >= 0.5) return { label: 'Medium', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Low', color: 'bg-red-100 text-red-700' };
}

export const OrchestrationActionCard: React.FC<Props> = ({
  action,
  onCtaClick,
  onDismiss,
}) => {
  const suppressed = Boolean(action.suppression?.suppressed);

  const exposure = formatMoney(action.exposure ?? null);
  const dueDateLabel = formatDateLabel(action.nextDueDate ?? null);
  const description = resolveDescription(
    action.description,
    action.cta?.label
  );
  const confidence = confidenceLabel(action.confidence?.score ?? undefined);

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
            {confidence && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${confidence.color}`}
                title="How confident the system is that this action is relevant"
              >
                Confidence: {confidence.label}
              </span>
            )}
            {action.category && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                {action.category}
              </span>
            )}
          </div>

          {description && (
            <p className="text-sm text-gray-600">{description}</p>
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

      {/* Primary CTA */}
      {action.cta?.show && action.cta.label && (
        <div className="mt-4 flex items-center gap-3">
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

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-sm text-muted-foreground hover:underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

    </div>
  );
};
