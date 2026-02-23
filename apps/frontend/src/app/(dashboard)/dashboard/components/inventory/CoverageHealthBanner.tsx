'use client';

import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

type CoverageHealthBannerProps = {
  gapCount: number;
  exposedValue: number;
  totalValue: number;
  onReviewGaps: () => void;
  onViewActions: () => void;
};

export default function CoverageHealthBanner({
  gapCount,
  exposedValue,
  totalValue,
  onReviewGaps,
  onViewActions,
}: CoverageHealthBannerProps) {
  if (gapCount === 0) {
    return (
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 p-1.5">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">All high-value items are protected</p>
            <p className="text-xs text-emerald-600">Inventory Health: 100% - {formatCurrency(totalValue)} tracked</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReviewGaps}
            className="text-xs text-emerald-700 transition-colors hover:underline"
          >
            Review gaps
          </button>
          <button
            type="button"
            onClick={onViewActions}
            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            View in Actions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-red-100 p-1.5">
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-800">
            {gapCount} item{gapCount !== 1 ? 's' : ''} with coverage gaps detected
          </p>
          <p className="text-xs text-red-600">{formatCurrency(exposedValue)} in unprotected replacement value</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onReviewGaps}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
      >
        Review {gapCount} gap{gapCount !== 1 ? 's' : ''} {'->'}
      </button>
    </div>
  );
}
