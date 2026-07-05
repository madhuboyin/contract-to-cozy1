'use client';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { HoaViolationSummary } from '@/types';
import { VIOLATION_STATUS_LABELS, VIOLATION_STATUS_COLOR, formatCents, formatDate } from './HoaUtils';

interface Props {
  violations: HoaViolationSummary[];
  propertyId: string;
}

export default function ViolationHistoryList({ violations, propertyId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (violations.length === 0) {
    return (
      <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
        No violations reported yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {violations.map((v) => (
        <div
          key={v.id}
          className="cursor-pointer rounded-xl border bg-[hsl(var(--mobile-card-bg))] p-3"
          onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{v.summary || v.title}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-muted))]">
                  {formatDate(v.openedAt)}
                </p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${VIOLATION_STATUS_COLOR[v.status]}`}>
              {VIOLATION_STATUS_LABELS[v.status]}
            </span>
          </div>

          {expandedId === v.id && (
            <div className="mt-3 space-y-1.5 border-t pt-3 text-xs text-[hsl(var(--mobile-text-secondary))]">
              {v.description && <p>{v.description}</p>}
              {v.cureDeadline && <p>Cure by: {formatDate(v.cureDeadline)}</p>}
              {v.fineAmountCents != null && <p>Fine: {formatCents(v.fineAmountCents)}</p>}
              {v.resolvedAt && <p>Resolved: {formatDate(v.resolvedAt)}</p>}
              <a
                href={
                  v.journeyId
                    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${v.journeyId}`
                    : `/dashboard/properties/${propertyId}/tools/guidance-overview`
                }
                onClick={(e) => e.stopPropagation()}
                className="inline-block text-[hsl(var(--mobile-brand-strong))] hover:underline"
              >
                View guidance and next steps →
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
