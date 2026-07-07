'use client';

import type { ProviderCategoryEligibility } from '@/types';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { VerifiedProBadge } from './VerifiedProBadge';

interface CategoryEligibilityListProps {
  eligibility: ProviderCategoryEligibility[];
}

/**
 * Provider-facing per-category status list — what's verified, what's
 * blocking. Section 4.2's ProviderCategoryEligibility.missingCredentialTypes
 * is exactly what powers the "what's missing" copy here.
 */
export function CategoryEligibilityList({ eligibility }: CategoryEligibilityListProps) {
  if (eligibility.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 py-10 text-center">
        <p className="text-sm text-neutral-500">
          No service categories on file yet. Add categories to your profile to see verification status here.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
      {eligibility.map((row) => (
        <div key={row.serviceCategory} className="flex items-center justify-between gap-3 bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="mb-0 text-sm font-medium text-neutral-900">{formatEnumLabel(row.serviceCategory)}</p>
            {!row.isEligible && row.missingCredentialTypes.length > 0 ? (
              <p className="mb-0 mt-0.5 text-xs text-amber-700">
                Missing: {row.missingCredentialTypes.map(formatEnumLabel).join(', ')}
              </p>
            ) : null}
          </div>
          <VerifiedProBadge isVerified={row.isEligible} />
        </div>
      ))}
    </div>
  );
}
