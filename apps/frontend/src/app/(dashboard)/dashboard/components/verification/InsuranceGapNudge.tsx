// apps/frontend/src/app/(dashboard)/dashboard/components/verification/InsuranceGapNudge.tsx
'use client';

import React from 'react';
import { Camera, FileScan, Flame } from 'lucide-react';
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
  showSuccessFlash?: boolean;
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
  showSuccessFlash = false,
}: InsuranceGapNudgeProps) {
  const underInsuredCents = Math.max(0, nudge.underInsuredCents ?? 0);
  // Keep red rare: only use it for materially high uncovered exposure.
  const isHighUrgency = underInsuredCents >= 5_000_000;

  const tone = isHighUrgency
    ? {
        container:
          'bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 border-l-4 border-l-rose-600',
        iconWrap: 'bg-rose-100',
        icon: 'text-rose-700',
        detailText: 'text-rose-800',
        ctaBorder: 'border-rose-300',
        ctaText: 'text-rose-700',
        ctaHover: 'hover:bg-rose-100',
        extractedBorder: 'border-rose-200',
      }
    : {
        container:
          'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 border-l-4 border-l-amber-500',
        iconWrap: 'bg-amber-100',
        icon: 'text-amber-700',
        detailText: 'text-amber-800',
        ctaBorder: 'border-amber-300',
        ctaText: 'text-amber-700',
        ctaHover: 'hover:bg-amber-100',
        extractedBorder: 'border-amber-200',
      };

  return (
    <div
      className={`
        w-full rounded-xl shadow-sm
        ${tone.container}
        px-5 py-4
        hover:shadow-md transition-shadow
        ${showSuccessFlash ? 'ring-2 ring-emerald-300 animate-pulse' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${tone.iconWrap}`}>
          <FileScan className={`w-5 h-5 ${tone.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">{nudge.title}</h3>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
            <Flame className="h-3.5 w-3.5" />
            🔥 {nudge.currentStreak} Task Streak
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {nudge.description}
          </p>

          <div className={`mt-2 text-xs ${tone.detailText}`}>
            Verified inventory: {formatCents(nudge.totalInventoryValueCents)} • Policy limit on file:{' '}
            {formatCents(nudge.personalPropertyLimitCents)}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={onUploadClick}
              disabled={insuranceUploading || insuranceConfirming}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${tone.ctaBorder} ${tone.ctaText} ${tone.ctaHover}`}
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
            <div className={`mt-3 rounded-lg border bg-white/80 p-3 text-xs text-gray-700 ${tone.extractedBorder}`}>
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
