'use client';
// apps/frontend/src/app/(dashboard)/dashboard/financing/scenarios/[id]/page.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { MobilePageContainer } from '@/components/mobile/dashboard/MobilePrimitives';
import OptionComparisonTable from '@/components/features/financing/OptionComparisonTable';
import { usd, OPTION_LABELS } from '@/components/features/financing/FinancingUtils';
import { Button } from '@/components/ui/button';
import type { FinancingScenario, FinancingOptionType } from '@/types';

export default function ScenarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';

  const [scenario, setScenario] = useState<FinancingScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<FinancingOptionType | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!propertyId || !id) return;
    api
      .getFinancingScenario(propertyId, id)
      .then((s) => {
        setScenario(s);
        setSelectedOption(s.selectedOption);
      })
      .catch(() => setError('Scenario not found'))
      .finally(() => setLoading(false));
  }, [propertyId, id]);

  async function saveOption(opt: FinancingOptionType) {
    if (!propertyId || !id) return;
    setSelectedOption(opt);
    setSaving(true);
    try {
      await api.updateFinancingScenario(propertyId, id, { selectedOption: opt });
    } finally {
      setSaving(false);
    }
  }

  const backHref = `/dashboard/financing?propertyId=${propertyId}`;

  return (
    <MobilePageContainer className="space-y-5 pb-10">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Financing Center
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : error || !scenario ? (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30">
          {error ?? 'Scenario not found'}
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Saved Scenario
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              {scenario.title}
            </h1>
            {scenario.projectDescription && (
              <p className="mt-1 text-sm text-slate-500">{scenario.projectDescription}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">
              Project cost: <strong>{usd(scenario.projectCostCents)}</strong>
            </p>
            {selectedOption && (
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
                Selected: <strong>{OPTION_LABELS[selectedOption]}</strong>
                {saving && <span className="ml-2 text-xs text-slate-400">Saving…</span>}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Tap an option to mark your choice
            </p>
            <OptionComparisonTable
              results={scenario.resultsJson}
              selectedOption={selectedOption}
              onSelect={saveOption}
            />
          </div>

          {scenario.notes && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              <p className="text-xs font-semibold text-slate-400 mb-1">Notes</p>
              {scenario.notes}
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            {scenario.resultsJson.disclaimer}{' '}
            Rates as of {new Date(scenario.resultsJson.ratesAsOf).toLocaleDateString()}.
          </p>
        </>
      )}
    </MobilePageContainer>
  );
}
