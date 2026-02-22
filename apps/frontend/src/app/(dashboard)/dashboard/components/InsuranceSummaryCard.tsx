// apps/frontend/src/app/(dashboard)/dashboard/components/InsuranceSummaryCard.tsx
'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api/client';

interface InsuranceSummaryCardProps {
  propertyId: string | undefined;
}

const INSURANCE_PROTECTION_GAP_QUERY_KEY = 'insurance-protection-gap';

function formatCents(cents: number | null | undefined) {
  const safe = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe / 100);
}

export function InsuranceSummaryCard({ propertyId }: InsuranceSummaryCardProps) {
  const { data } = useQuery({
    queryKey: [INSURANCE_PROTECTION_GAP_QUERY_KEY, propertyId],
    enabled: !!propertyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await api.getInsuranceProtectionGap(propertyId!);
      return response.success ? response.data : null;
    },
  });

  if (!propertyId || !data || !data.hasActivePolicy || !data.isPolicyVerified) {
    return null;
  }

  const hasGap = data.underInsuredCents > 0;

  if (hasGap) {
    return (
      <div className="w-full rounded-xl border-2 border-red-200 border-l-4 border-l-red-600 bg-gradient-to-r from-red-50 to-orange-50 px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-red-100 p-2 shrink-0">
            <ShieldAlert className="h-5 w-5 text-red-700" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">Protection Gap Detected</h3>
            <p className="mt-1 text-sm text-gray-700">
              Protection Gap Detected: Your inventory is valued at {formatCents(data.totalInventoryValueCents)}, but your policy only covers {formatCents(data.personalPropertyLimitCents)}. You are under-insured by {formatCents(data.underInsuredCents)}.
            </p>
            <p className="mt-2 text-xs text-red-800">
              Deductible Exposure: {formatCents(data.deductibleCents)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-green-100 p-2 shrink-0">
          <ShieldCheck className="h-5 w-5 text-green-700" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">Coverage Check Complete</h3>
          <p className="mt-1 text-sm text-gray-700">
            Your verified inventory value ({formatCents(data.totalInventoryValueCents)}) is within your policy limit ({formatCents(data.personalPropertyLimitCents)}).
          </p>
          <p className="mt-2 text-xs text-green-800">
            Deductible Exposure: {formatCents(data.deductibleCents)}
          </p>
        </div>
      </div>
    </div>
  );
}
