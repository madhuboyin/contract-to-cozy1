import Link from 'next/link';
import { ChevronRight, ShieldCheck, AlertCircle } from 'lucide-react';
import type { PermitSummary } from '@/types';
import PermitStatusBadge from './PermitStatusBadge';
import { CATEGORY_EMOJI, CATEGORY_LABELS, WORK_TYPE_LABELS, formatDate, SOURCE_LABELS } from './PermitUtils';

interface Props {
  permit: PermitSummary;
  propertyId: string;
}

export default function PermitCard({ permit, propertyId }: Props) {
  const href = `/dashboard/permits/${permit.id}?propertyId=${propertyId}`;

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4 transition-colors hover:bg-[hsl(var(--mobile-card-bg))]/80"
    >
      <span className="text-2xl pt-0.5">{CATEGORY_EMOJI[permit.category]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{CATEGORY_LABELS[permit.category]}</span>
          {permit.permitNumber && (
            <span className="text-xs text-[hsl(var(--mobile-text-muted))]">#{permit.permitNumber}</span>
          )}
        </div>

        {permit.description && (
          <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))] line-clamp-2">{permit.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <PermitStatusBadge status={permit.status} size="sm" />
          {permit.workTypes.slice(0, 2).map((wt) => (
            <span key={wt} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {WORK_TYPE_LABELS[wt]}
            </span>
          ))}
          {permit.workTypes.length > 2 && (
            <span className="text-xs text-[hsl(var(--mobile-text-muted))]">+{permit.workTypes.length - 2}</span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-3 text-xs text-[hsl(var(--mobile-text-muted))]">
          {permit.issueDate && <span>Issued {formatDate(permit.issueDate)}</span>}
          <span>{SOURCE_LABELS[permit.source]}</span>
          {permit.isVerified && (
            <span className="flex items-center gap-0.5 text-emerald-600">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          )}
          {permit.hasOpenInspections && (
            <span className="flex items-center gap-0.5 text-amber-600">
              <AlertCircle className="h-3 w-3" />
              Inspections
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 mt-1" />
    </Link>
  );
}
