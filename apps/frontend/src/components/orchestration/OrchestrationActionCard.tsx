// apps/frontend/src/components/orchestration/OrchestrationActionCard.tsx
import React from 'react';
import { OrchestratedActionDTO } from '@/types';
import { DecisionTracePanel } from './DecisionTracePanel';
import { ConfidenceBar } from './ConfidenceBar';
import { ConfidencePopover } from './ConfidencePopover';

type Props = {
  action: OrchestratedActionDTO;
  onCtaClick?: (action: OrchestratedActionDTO) => void;

  /**
   * Optional: called when user dismisses the card (UI-only).
   * If you want "user-marked-complete suppression", wire this to a backend call
   * and then refresh orchestration summary.
   */
  onDismiss?: () => void;

  ctaDisabled?: boolean;
  ctaLabel?: string;

  /**
   * Enforce CTA consistency across cards (even if action.cta.show is false/missing).
   * ActionCenter uses this to keep the layout predictable.
   */
  forceShowCta?: boolean;

  /**
   * When you want to show deep links.
   * - checklistBasePath example: `/homeowner/properties/${propertyId}/maintenance`
   * - bookingBasePath example: `/homeowner/properties/${propertyId}/bookings`
   *
   * If not provided, links will not be rendered (safe default).
   */
  checklistBasePath?: string;
  bookingBasePath?: string;
};

function safeGetSuppression(action: OrchestratedActionDTO) {
  return (
    action.suppression ?? {
      suppressed: false,
      reasons: [],
      suppressionSource: null,
    }
  );
}

function safeUpper(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function formatMonthYear(dateLike?: string | Date | null) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

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

/**
 * Suppress description if it duplicates CTA intent
 */
function resolveDescription(description?: string | null, ctaLabel?: string | null) {
  if (!description) return null;
  if (!ctaLabel) return description;

  const d = description.toLowerCase();
  const c = ctaLabel.toLowerCase();
  if (d.includes(c)) return null;

  return description;
}

function buildChecklistDeepLink(params: {
  checklistBasePath?: string;
  checklistItemId?: string | null;
  propertyId: string;
}) {
  const { checklistBasePath, checklistItemId } = params;
  if (!checklistBasePath || !checklistItemId) return null;

  // You can switch this to your actual route scheme.
  // Example: /homeowner/properties/:propertyId/maintenance?focus=:id
  return `${checklistBasePath}?focus=${encodeURIComponent(checklistItemId)}`;
}

function buildBookingDeepLink(params: {
  bookingBasePath?: string;
  bookingId?: string | null;
}) {
  const { bookingBasePath, bookingId } = params;
  if (!bookingBasePath || !bookingId) return null;

  // Example: /.../bookings/:id
  return `${bookingBasePath}/${encodeURIComponent(bookingId)}`;
}

function getSuppressionCopy(action: OrchestratedActionDTO) {
  const suppression = safeGetSuppression(action);
  const source = suppression.suppressionSource ?? null;

  // ✅ Always derive primary reason explicitly
  const primaryReason = suppression.reasons?.[0];

  // 1️⃣ User explicitly completed the checklist item (highest priority)
  if (primaryReason?.reason === 'USER_MARKED_COMPLETE') {
    return {
      title: 'You’ve already completed this',
      detail: primaryReason.message,
      kind: 'NONE' as const,
      checklistItemId: primaryReason.relatedId ?? null,
      bookingId: null as string | null,
    };
  }

  // 2️⃣ Authoritative checklist coverage (scheduled / tracked)
  if (source?.type === 'CHECKLIST_ITEM') {
    const item = source.checklistItem;

    return {
      title: 'This recommendation is already covered',
      detail: item.nextDueDate
        ? `Covered by "${item.title}", scheduled for ${formatMonthYear(item.nextDueDate)}`
        : `Covered by "${item.title}"`,
      kind: 'CHECKLIST' as const,
      checklistItemId: item.id,
      bookingId: null as string | null,
    };
  }

  // 3️⃣ Booking-based suppression
  const booking = suppression.reasons.find(
    (r) => r.reason === 'BOOKING_EXISTS'
  );

  if (booking) {
    return {
      title: 'Service already booked',
      detail: booking.message,
      kind: 'BOOKING' as const,
      checklistItemId: null as string | null,
      bookingId: booking.relatedId ?? null,
    };
  }

  // 4️⃣ Fallback
  return {
    title: 'This action is currently not required',
    detail: null,
    kind: 'NONE' as const,
    checklistItemId: null as string | null,
    bookingId: null as string | null,
  };
}


export const OrchestrationActionCard: React.FC<Props> = ({
  action,
  onCtaClick,
  onDismiss,
  ctaDisabled = false,
  ctaLabel,
  forceShowCta = false,
  checklistBasePath,
  bookingBasePath,
}) => {
  // ✅ Fix TS error: suppression is possibly undefined
  const suppression = safeGetSuppression(action);
  const suppressed = Boolean(suppression.suppressed);

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

  // Suppression deep link copy (checklist / booking)
  const suppressionCopy = suppressed ? getSuppressionCopy(action) : null;

  const checklistLink =
    suppressed && suppressionCopy?.kind === 'CHECKLIST'
      ? buildChecklistDeepLink({
          checklistBasePath,
          checklistItemId: suppressionCopy.checklistItemId,
          propertyId: action.propertyId,
        })
      : null;

  const bookingLink =
    suppressed && suppressionCopy?.kind === 'BOOKING'
      ? buildBookingDeepLink({
          bookingBasePath,
          bookingId: suppressionCopy.bookingId,
        })
      : null;

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
            <h3 className="text-base font-semibold text-gray-900">{action.title}</h3>

            {riskBadge(action.riskLevel)}

            {action.category && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                {action.category}
              </span>
            )}
          </div>

          {description && <p className="text-sm text-gray-600">{description}</p>}

          {/* ================= Suppression Copy + Deep Link ================= */}
          {suppressed && suppressionCopy && (
            <div className="mt-2 rounded-md border bg-white p-3">
              <div className="text-sm font-semibold text-gray-900">{suppressionCopy.title}</div>

              {suppressionCopy.detail && (
                <div className="mt-0.5 text-sm text-gray-600">{suppressionCopy.detail}</div>
              )}

              {(checklistLink || bookingLink) && (
                <div className="mt-2 flex items-center gap-3">
                  {checklistLink && (
                    <a
                      href={checklistLink}
                      className="text-sm font-semibold text-blue-700 hover:underline"
                    >
                      View checklist item
                    </a>
                  )}

                  {bookingLink && (
                    <a
                      href={bookingLink}
                      className="text-sm font-semibold text-blue-700 hover:underline"
                    >
                      View booking
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= Meta ================= */}
        <div className="text-right space-y-1">
          {exposure && <div className="text-sm font-semibold text-gray-900">{exposure}</div>}
          {dueDateLabel && <div className="text-xs text-gray-600">Due {dueDateLabel}</div>}
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

      {/* ================= Decision Trace (expand “why”) ================= */}
      <DecisionTracePanel
        suppressed={suppressed}
        reasons={suppression.reasons ?? []}
        steps={action.decisionTrace?.steps ?? []}
      />
    </div>
  );
};
