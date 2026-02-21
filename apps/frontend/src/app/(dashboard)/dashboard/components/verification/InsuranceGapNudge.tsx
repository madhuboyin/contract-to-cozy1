// apps/frontend/src/app/(dashboard)/dashboard/components/verification/InsuranceGapNudge.tsx
'use client';

import React from 'react';
import { Camera, FileScan } from 'lucide-react';
import { InsuranceNudgeDTO } from './verificationApi';

interface InsuranceGapNudgeProps {
  nudge: InsuranceNudgeDTO;
  insuranceUploading: boolean;
  insuranceConfirming: boolean;
  insuranceExtracted: {
    personalPropertyLimitCents: number | null;
    deductibleCents: number | null;
  } | null;
  onUploadClick: () => void;
  onConfirm: () => void;
  onSnooze: () => void;
}

function formatCents(cents: number | null | undefined) {
  const safe = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe / 100);
}

export function InsuranceGapNudge({
  nudge,
  insuranceUploading,
  insuranceConfirming,
  insuranceExtracted,
  onUploadClick,
  onConfirm,
  onSnooze,
}: InsuranceGapNudgeProps) {
  return (
    <div
      className="
        w-full rounded-xl shadow-sm
        bg-gradient-to-r from-rose-50 to-orange-50
        border-2 border-rose-200 border-l-4 border-l-rose-600
        px-5 py-4
        hover:shadow-md transition-shadow
      "
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-rose-100 rounded-lg shrink-0">
          <FileScan className="w-5 h-5 text-rose-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{nudge.title}</h3>
          <p className="text-sm text-gray-700 mt-1">
            Are you fully covered? Snap a photo of your Insurance Declarations page to see if your coverage matches your verified inventory value.
          </p>

          <div className="mt-2 text-xs text-rose-800">
            Verified inventory: {formatCents(nudge.totalInventoryValueCents)} • Policy limit on file:{' '}
            {formatCents(nudge.personalPropertyLimitCents)}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={onUploadClick}
              disabled={insuranceUploading || insuranceConfirming}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              {insuranceUploading ? 'Scanning...' : 'Snap / Upload Declarations'}
            </button>

            {insuranceExtracted && (
              <button
                onClick={onConfirm}
                disabled={insuranceConfirming}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {insuranceConfirming ? 'Saving...' : 'Confirm OCR Values'}
              </button>
            )}

            <button
              onClick={onSnooze}
              type="button"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Snooze 24h
            </button>
          </div>

          {insuranceExtracted && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-white/80 p-3 text-xs text-gray-700">
              <div>
                Personal Property Limit: {formatCents(insuranceExtracted.personalPropertyLimitCents)}
              </div>
              <div className="mt-1">
                Deductible: {formatCents(insuranceExtracted.deductibleCents)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
