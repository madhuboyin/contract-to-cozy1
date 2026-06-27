'use client';
// apps/frontend/src/components/features/financing/FinancingCta.tsx
import React, { useState } from 'react';
import { DollarSign, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FinancingEntryPoint } from '@/types';
import FinancingCalculatorSheet from './FinancingCalculatorSheet';

export interface FinancingCtaProps {
  propertyId: string;
  projectCostCents: number;
  projectDescription: string;
  entryPoint: FinancingEntryPoint;
  sourceEntityType?: string;
  sourceEntityId?: string;
  ctaLabel?: string;
  variant?: 'inline' | 'card' | 'chip';
}

export default function FinancingCta({
  propertyId,
  projectCostCents,
  projectDescription,
  entryPoint,
  sourceEntityType,
  sourceEntityId,
  ctaLabel = 'See financing options',
  variant = 'inline',
}: FinancingCtaProps) {
  const [open, setOpen] = useState(false);

  const trigger =
    variant === 'chip' ? (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <DollarSign className="h-3 w-3" />
        {ctaLabel}
      </button>
    ) : variant === 'card' ? (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-3 text-left hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
            <DollarSign className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ctaLabel}</p>
            <p className="text-xs text-slate-500">Compare HELOC, personal loan, and more</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
      >
        <DollarSign className="h-3.5 w-3.5" />
        {ctaLabel}
        <ChevronRight className="h-3 w-3" />
      </button>
    );

  return (
    <>
      {trigger}

      {/* Bottom sheet overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white px-5 pb-8 pt-5 shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Financing Options
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <FinancingCalculatorSheet
                propertyId={propertyId}
                initialCostCents={projectCostCents}
                projectDescription={projectDescription}
                entryPoint={entryPoint}
                sourceEntityType={sourceEntityType}
                sourceEntityId={sourceEntityId}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
