// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
import React from 'react';
import { OrchestratedActionDTO } from '@/types';
import { DecisionTracePanel } from './DecisionTracePanel';
import { ConfidenceBar } from './ConfidenceBar';
import { ConfidencePopover } from './ConfidencePopover';
import { TaskStatusBadge } from './TaskStatusBadge';

type Props = {
  action: OrchestratedActionDTO;

  onCtaClick?: (action: OrchestratedActionDTO) => void;

  /**
   * Called when user wants to open the decision trace modal
   * Parent component handles showing the modal and action buttons
   */
  onOpenTrace?: (action: OrchestratedActionDTO) => void;

  /**
   * Optional UI-only dismiss
   */
  onDismiss?: () => void;

  ctaDisabled?: boolean;
  ctaLabel?: string;

  /**
   * Enforce CTA consistency even if action.cta.show is false
   */
  forceShowCta?: boolean;

  checklistBasePath?: string;
  bookingBasePath?: string;
};

function safeGetSuppression(action: OrchestratedActionDTO) {
  return {
    suppressed: Boolean(action.suppression?.suppressed),
    reasons: action.suppression?.reasons ?? [],
    suppressionSource: action.suppression?.suppressionSource ?? null,
  };
}

function safeUpper(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function formatMonthYear(dateLike?: string | Date | null) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatMoney(amount?: number | null) {
  if (amount == null) return null;
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

  const level = safeUpper(riskLevel);
  const base = 'text-xs font-semibold px-2 py-0.5 rounded';

  switch (level) {
    case 'CRITICAL':
    case 'HIGH':
      return <span className={`${base} bg-red-100 text-red-700`}>{level}</span>;
    case 'ELEVATED':
    case 'MODERATE':
      return <span className={`${base} bg-amber-100 text-amber-700`}>{level}</span>;
    case 'LOW':
      return <span className={`${base} bg-green-100 text-green-700`}>{level}</span>;
    default:
      return <span className={`${base} bg-gray-100 text-gray-700`}>{level}</span>;
  }
}

function resolveDescription(description?: string | null, ctaLabel?: string | null) {
  if (!description) return null;
  if (!ctaLabel) return description;
  return description.toLowerCase().includes(ctaLabel.toLowerCase())
    ? null
    : description;
}

function getSuppressionCopy(action: OrchestratedActionDTO) {
  const { reasons, suppressionSource } = safeGetSuppression(action);
  const primaryReason = reasons[0];

  if (primaryReason?.reason === 'USER_MARKED_COMPLETE') {
    return {
      title: 'You’ve already completed this',
      detail: primaryReason.message,
    };
  }

  if (suppressionSource?.type === 'CHECKLIST_ITEM') {
    const item = suppressionSource.checklistItem;
    return {
      title: 'This recommendation is already covered',
      detail: item.nextDueDate
        ? `Covered by "${item.title}", scheduled for ${formatMonthYear(item.nextDueDate)}`
        : `Covered by "${item.title}"`,
    };
  }

  const booking = reasons.find(r => r.reason === 'BOOKING_EXISTS');
  if (booking) {
    return {
      title: 'Service already booked',
      detail: booking.message,
    };
  }

  return {
    title: 'This action is currently not required',
    detail: null,
  };
}

export const OrchestrationActionCard: React.FC<Props> = ({
  action,
  onCtaClick,
  onOpenTrace,
  onDismiss,
  ctaDisabled = false,
  ctaLabel,
  forceShowCta = false,
}) => {
  const suppression = safeGetSuppression(action);
  const suppressed = suppression.suppressed;

  const exposure = formatMoney(action.exposure);
  const dueDateLabel = formatDateLabel(action.nextDueDate);
  const description = resolveDescription(action.description, action.cta?.label);
  const confidence = action.confidence;

  const resolvedLabel = ctaLabel || action.cta?.label || 'Schedule task';
  const isDisabled = suppressed || ctaDisabled;
  const shouldShowCta = forceShowCta || Boolean(action.cta?.show);

  const suppressionCopy = suppressed ? getSuppressionCopy(action) : null;

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
          </div>

          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}

          {suppressed && suppressionCopy && (
            <div className="mt-2 rounded-md border bg-white p-3">
              <div className="text-sm font-semibold">
                {suppressionCopy.title}
              </div>
              {suppressionCopy.detail && (
                <div className="text-sm text-gray-600">
                  {suppressionCopy.detail}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-right space-y-1">
          {exposure && <div className="text-sm font-semibold">{exposure}</div>}
          {dueDateLabel && (
            <div className="text-xs text-gray-600">Due {dueDateLabel}</div>
          )}
        </div>
      </div>

      {/* Confidence */}
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

      {/* CTA */}
      {shouldShowCta && (
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

      {/* 🔑 NEW: Task Status Badge - Show when task has been created */}
      {action.hasRelatedChecklistItem && action.relatedChecklistItem && (
        <TaskStatusBadge checklistItem={action.relatedChecklistItem} />
      )}

      {/* Decision Trace */}
      <DecisionTracePanel
        suppressed={suppressed}
        reasons={suppression.reasons}
        steps={action.decisionTrace?.steps ?? []}
        action={action}
        onOpenTrace={onOpenTrace}
      />
    </div>
  );
};