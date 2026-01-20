// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
import React from 'react';
import { OrchestratedActionDTO, SignalSourceBadgeDTO } from '@/types';
import { DecisionTracePanel } from './DecisionTracePanel';
import { ConfidenceBar } from './ConfidenceBar';
import { ConfidencePopover } from './ConfidencePopover';
import { TaskStatusBadge } from './TaskStatusBadge';
import Link from 'next/link';
import { Package } from 'lucide-react';


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

  // 1) USER_EVENT suppression source (most explicit)
  if (suppressionSource?.type === 'USER_EVENT') {
    return {
      title:
        suppressionSource.eventType === 'USER_MARKED_COMPLETE'
          ? 'You’ve already completed this'
          : 'You brought this back',
      detail: primaryReason?.message ?? null,
    };
  }

  // 2) Covered by a maintenance task
  if (suppressionSource?.type === 'PROPERTY_MAINTENANCE_TASK') {
    const t = suppressionSource.task;
    const due = t.nextDueDate ? formatMonthYear(t.nextDueDate) : null;

    return {
      title: 'Already tracked as a maintenance task',
      detail: due ? `"${t.title}" due ${due}` : `"${t.title}"`,
    };
  }

  // 3) Covered by a checklist item
  if (suppressionSource?.type === 'CHECKLIST_ITEM') {
    const item = suppressionSource.checklistItem;
    const due = item.nextDueDate ? formatMonthYear(item.nextDueDate) : null;

    return {
      title: 'This recommendation is already covered',
      detail: due ? `Covered by "${item.title}", due ${due}` : `Covered by "${item.title}"`,
    };
  }

  // 4) Booking-based suppression (reason-driven)
  const booking = reasons.find((r) => r.reason === 'BOOKING_EXISTS');
  if (booking) {
    return { title: 'Service already booked', detail: booking.message };
  }

  // 5) Generic fallback
  if (primaryReason?.reason === 'USER_MARKED_COMPLETE') {
    return { title: 'You’ve already completed this', detail: primaryReason.message };
  }

  return { title: 'This action is currently not required', detail: null };
}
function sourceMeta(sourceType?: string | null) {
  const t = safeUpper(sourceType);
  switch (t) {
    case 'SCHEDULED':
      return { icon: '⏱', label: 'Scheduled', cls: 'bg-gray-100 text-gray-700' };
    case 'INTELLIGENCE':
      return { icon: '📊', label: 'Intelligence', cls: 'bg-indigo-50 text-indigo-700' };
    case 'COVERAGE':
      return { icon: '📄', label: 'Coverage', cls: 'bg-sky-50 text-sky-700' };
    case 'MANUAL':
      return { icon: '👤', label: 'Manual', cls: 'bg-amber-50 text-amber-800' };
    case 'SENSOR':
      return { icon: '🔔', label: 'Sensor', cls: 'bg-emerald-50 text-emerald-700' };
    case 'DOCUMENT':
      return { icon: '🧾', label: 'Document', cls: 'bg-zinc-50 text-zinc-700' };
    case 'EXTERNAL':
      return { icon: '🌎', label: 'External', cls: 'bg-teal-50 text-teal-700' };
    default:
      return { icon: '•', label: 'Signal', cls: 'bg-gray-100 text-gray-700' };
  }
}

function resolvePrimarySource(action: OrchestratedActionDTO): SignalSourceBadgeDTO | null {
  return (
    action.primarySignalSource ??
    (action.signalSources && action.signalSources.length > 0 ? action.signalSources[0] : null) ??
    null
  );
}

function signalBadge(action: OrchestratedActionDTO) {
  const s = resolvePrimarySource(action);
  if (!s) return null;

  const meta = sourceMeta(s.sourceType);
  const base = 'text-[11px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1';
  const title = s.summary || undefined;

  return (
    <span className={`${base} ${meta.cls}`} title={title}>
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}
function isCoverageGapAction(action: OrchestratedActionDTO) {
  return typeof action.actionKey === 'string' &&
    action.actionKey.startsWith('COVERAGE_GAP::');
}

function extractInventoryItemId(action: OrchestratedActionDTO): string | null {
  if (!isCoverageGapAction(action)) return null;
  const id = action.actionKey.split('COVERAGE_GAP::')[1];
  const trimmed = String(id ?? '').trim();
  return trimmed ? trimmed : null;
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

  const resolvedLabel = ctaLabel || action.cta?.label || 'Schedule task';
  const isDisabled = suppressed || ctaDisabled;
  const shouldShowCta = forceShowCta || Boolean(action.cta?.show);

  const suppressionCopy = suppressed ? getSuppressionCopy(action) : null;

  const confidence = action.confidence;
  const confidenceScore =
    confidence && Number.isFinite(confidence.score)
      ? Math.round(confidence.score)
      : null;
  
  const inventoryItemId = extractInventoryItemId(action);

  const inventoryLink =
  inventoryItemId && action.propertyId && isCoverageGapAction(action)
    ? `/dashboard/properties/${action.propertyId}/inventory?openItemId=${encodeURIComponent(
        inventoryItemId
      )}&scrollToItemId=${encodeURIComponent(
        inventoryItemId
      )}#item-${encodeURIComponent(inventoryItemId)}`
    : null;

        
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
          {signalBadge(action)}
        </div>

          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}
          
          {inventoryLink && (
            <div className="mt-2">
              <Link
                href={inventoryLink}
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
              >
                <Package className="h-4 w-4" />
                View item
              </Link>
            </div>
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
      {confidence && confidenceScore != null && (
        <div className="mt-4 space-y-2">
          <ConfidenceBar score={confidenceScore} level={confidence.level} />
          <ConfidencePopover
            score={confidenceScore}
            level={confidence.level}
            explanation={confidence.explanation}
            steps={action.decisionTrace?.steps ?? []}
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