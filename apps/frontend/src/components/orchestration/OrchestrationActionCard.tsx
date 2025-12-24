// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
import React from 'react';
import { OrchestratedActionDTO } from '@/types';
import { DecisionTracePanel } from './DecisionTracePanel';
import { ConfidenceBar } from './ConfidenceBar';
import { ConfidencePopover } from './ConfidencePopover';

type Props = {
  action: OrchestratedActionDTO;
  onCtaClick?: (action: OrchestratedActionDTO) => void;
  onDismiss?: () => void;
  ctaDisabled?: boolean;
  ctaLabel?: string;

  /**
   * Enforce CTA consistency across cards (even if action.cta.show is false/missing).
   * ActionCenter uses this to keep the layout predictable.
   */
  forceShowCta?: boolean;
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
function resolveDescription(description?: string | null, ctaLabel?: string | null) {
  if (!description) return null;
  if (!ctaLabel) return description;

  if (description.toLowerCase().includes(ctaLabel.toLowerCase())) {
    return null;
  }

  return description;
}

export const OrchestrationActionCard: React.FC<Props> = ({
  action,
  onCtaClick,
  onDismiss,
  ctaDisabled = false,
  ctaLabel,
  forceShowCta = false,
}) => {
  const suppressed = Boolean(action.suppression?.suppressed);

  const exposure = formatMoney(action.exposure ?? null);
  const dueDateLabel = formatDateLabel(action.nextDueDate ?? null);
  const description = resolveDescription(action.description, action.cta?.label);

  const confidence = action.confidence;

  // If parent provides ctaLabel, it wins.
  // Otherwise fallback to action.cta.label or a safe default.
  const resolvedLabel = ctaLabel || action.cta?.label || 'Schedule task';

  // Disable if suppressed OR explicitly disabled via prop
  const isDisabled = suppressed || ctaDisabled;

  // When forcing CTA, show it even if action.cta is missing.
  const shouldShowCta = forceShowCta ? true : Boolean(action.cta?.show);

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        suppressed ? 'bg-gray-50 opacity-70' : 'bg-white'
      }`}
    >
      {/* ================= Header ================= */}
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

          {description && <p className="text-sm text-gray-600">{description}</p>}
        </div>

        {/* ================= Meta ================= */}
        <div className="text-right space-y-1">
          {exposure && (
            <div className="text-sm font-semibold text-gray-900">{exposure}</div>
          )}
          {dueDateLabel && (
            <div className="text-xs text-gray-600">Due {dueDateLabel}</div>
          )}
        </div>
      </div>

      {/* ================= Confidence ================= */}
      {confidence && (
        <div className="mt-4 space-y-2">
          <ConfidenceBar score={confidence.score} level={confidence.level} />
          <ConfidencePopover
            score={confidence.score}
            level={confidence.level}
            explanation={confidence.explanation}
          />
        </div>
      )}

      {/* ================= CTA ================= */}
      {shouldShowCta && resolvedLabel && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onCtaClick?.(action)}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              isDisabled
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {resolvedLabel}
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-sm text-muted-foreground hover:underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ================= Decision Trace (ALWAYS) ================= */}
      <DecisionTracePanel
        suppressed={suppressed}
        reasons={action.suppression?.reasons ?? []}
        steps={action.decisionTrace?.steps ?? []}
      />
    </div>
  );
};
