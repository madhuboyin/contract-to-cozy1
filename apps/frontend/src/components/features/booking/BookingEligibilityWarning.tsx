'use client';

import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ProviderCredentialType, ServiceCategory } from '@/types';
import { formatEnumLabel } from '@/lib/utils/formatters';

interface BookingEligibilityWarningProps {
  serviceCategory: ServiceCategory;
  missingCredentialTypes: ProviderCredentialType[];
  className?: string;
}

/**
 * Non-blocking warning shown at booking creation when the provider isn't
 * currently verified for the requested category (Section 7.1) — booking is
 * still allowed, but the homeowner shouldn't proceed unaware.
 */
export function BookingEligibilityWarning({
  serviceCategory,
  missingCredentialTypes,
  className,
}: BookingEligibilityWarningProps) {
  return (
    <Alert className={`border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600 ${className ?? ''}`}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>This provider isn&apos;t currently verified for {formatEnumLabel(serviceCategory)}</AlertTitle>
      <AlertDescription className="space-y-1 text-amber-800">
        <p className="mb-0 text-sm">
          You can still book, but the required credentials for this service haven&apos;t been reviewed and approved yet.
        </p>
        {missingCredentialTypes.length > 0 ? (
          <p className="mb-0 text-sm">Missing: {missingCredentialTypes.map(formatEnumLabel).join(', ')}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
