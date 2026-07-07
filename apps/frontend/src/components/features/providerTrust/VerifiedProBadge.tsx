'use client';

import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VerifiedProBadgeProps {
  isVerified: boolean;
  className?: string;
  /** Set false to render nothing when not verified (e.g. dense list rows). Default true. */
  showWhenUnverified?: boolean;
}

/**
 * "Verified Pro" badge — reflects ProviderCategoryEligibility.isEligible for
 * the category in question (or "at least one category" when checked at the
 * provider level). See docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md,
 * Section 10.
 *
 * Verified means documentation was reviewed and approved, not a guarantee of
 * quality or trustworthiness (Section 14.4) — keep copy honest.
 */
export function VerifiedProBadge({ isVerified, className, showWhenUnverified = true }: VerifiedProBadgeProps) {
  if (!isVerified && !showWhenUnverified) return null;

  if (!isVerified) {
    return (
      <span
        title="This provider's credentials for this service haven't been verified yet"
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500',
          className
        )}
      >
        Unverified
      </span>
    );
  }

  return (
    <span
      title="Credential documentation for this service was reviewed and approved"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700',
        className
      )}
    >
      <ShieldCheck className="h-3 w-3" />
      Verified Pro
    </span>
  );
}
