// apps/frontend/src/app/(dashboard)/dashboard/components/verification/HomeEquityNudge.tsx
'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';

interface HomeEquityNudgeProps {
  title: string;
  question: string;
  purchasePriceDollars: string;
  purchaseDate: string;
  isSaving: boolean;
  onPurchasePriceChange: (value: string) => void;
  onPurchaseDateChange: (value: string) => void;
  onSubmit: () => void;
}

export function HomeEquityNudge({
  title,
  question,
  purchasePriceDollars,
  purchaseDate,
  isSaving,
  onPurchasePriceChange,
  onPurchaseDateChange,
  onSubmit,
}: HomeEquityNudgeProps) {
  const canSubmit = purchasePriceDollars.trim().length > 0 && purchaseDate.trim().length > 0;

  return (
    <div className="w-full rounded-xl border-2 border-emerald-200 border-l-4 border-l-emerald-600 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-100 p-2 shrink-0">
          <TrendingUp className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-700">{question}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Purchase price</label>
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 420000"
                value={purchasePriceDollars}
                disabled={isSaving}
                onChange={(event) => onPurchasePriceChange(event.target.value)}
                className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Purchase date</label>
              <input
                type="date"
                value={purchaseDate}
                disabled={isSaving}
                onChange={(event) => onPurchaseDateChange(event.target.value)}
                className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={onSubmit}
              disabled={!canSubmit || isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save equity baseline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
