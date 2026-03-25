'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DoNothingRunDTO,
  getLatestDoNothingRun,
  runDoNothingSimulation,
} from '@/lib/api/doNothingSimulatorApi';

type DoNothingSimulatorToolCardProps = {
  propertyId: string;
};

const CARD_BASE =
  'flex h-full flex-col rounded-2xl border border-gray-200/65 bg-white/95 p-4 shadow-[0_6px_16px_-14px_rgba(15,23,42,0.28)] sm:p-5';
const HEADER_ICON_WRAP = 'flex h-7 w-7 items-center justify-center rounded-md bg-slate-100/60';
const HEADER_ICON = 'h-3.5 w-3.5 text-slate-600';
const TITLE_CLASS = 'text-[15px] font-medium leading-none text-gray-800';
const BADGE_BASE =
  'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none';
const VALUE_ZONE = 'mt-2.5 rounded-lg bg-slate-50/45 px-2.5 py-2';
const CTA_CLASS =
  'group inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 transition-colors hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50';

function statusMeta(loading: boolean, run: DoNothingRunDTO | null, hasRun: boolean) {
  if (loading) {
    return { label: 'Checking', className: 'border-slate-200/65 bg-slate-50/70 text-slate-600' };
  }
  if (!hasRun || !run) {
    return { label: 'Not run yet', className: 'border-slate-200/65 bg-slate-50/70 text-slate-600' };
  }
  if (run.status === 'STALE') {
    return {
      label: 'Review recommended',
      className: 'border-amber-200/65 bg-amber-50/70 text-amber-700',
    };
  }
  if (run.status === 'ERROR') {
    return { label: 'Needs refresh', className: 'border-rose-200/65 bg-rose-50/70 text-rose-700' };
  }
  return { label: 'Ready', className: 'border-emerald-200/65 bg-emerald-50/70 text-emerald-700' };
}

function likelihoodTone(likelihood?: DoNothingRunDTO['incidentLikelihood']): string {
  if (likelihood === 'HIGH') return 'border-rose-200/65 bg-rose-50/70 text-rose-700';
  if (likelihood === 'MEDIUM') return 'border-amber-200/65 bg-amber-50/70 text-amber-700';
  if (likelihood === 'LOW') return 'border-emerald-200/65 bg-emerald-50/70 text-emerald-700';
  return 'border-slate-200/65 bg-slate-50/70 text-slate-700';
}

function moneyFromCents(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export default function DoNothingSimulatorToolCard({
  propertyId,
}: DoNothingSimulatorToolCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [run, setRun] = useState<DoNothingRunDTO | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!propertyId) {
        setLoading(false);
        setHasRun(false);
        setRun(null);
        return;
      }

      setLoading(true);
      try {
        const result = await getLatestDoNothingRun(propertyId);
        if (!mounted) return;

        if (result.exists) {
          setHasRun(true);
          setRun(result.run);
        } else {
          setHasRun(false);
          setRun(null);
        }
      } catch {
        if (!mounted) return;
        setHasRun(false);
        setRun(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [propertyId]);

  const ctaLabel = useMemo(() => {
    if (!hasRun || !run) return 'Run simulation';
    if (run.status === 'STALE') return 'Re-run';
    return 'View details';
  }, [hasRun, run]);

  const handlePrimaryCta = async () => {
    if (!propertyId) return;

    if (!hasRun || run?.status === 'STALE') {
      setRunning(true);
      try {
        const next = await runDoNothingSimulation(propertyId, {
          horizonMonths: 12,
          inputOverrides: {
            skipMaintenance: true,
            skipWarranty: true,
            deductibleStrategy: 'KEEP_HIGH',
            riskTolerance: 'MEDIUM',
          },
        });
        setHasRun(true);
        setRun(next);
        router.push(`/dashboard/properties/${propertyId}/tools/do-nothing`);
      } finally {
        setRunning(false);
      }
      return;
    }

    router.push(`/dashboard/properties/${propertyId}/tools/do-nothing`);
  };

  const status = statusMeta(loading, run, hasRun);

  const riskDeltaLabel =
    run?.riskScoreDelta === null || run?.riskScoreDelta === undefined
      ? '—'
      : run.riskScoreDelta > 0
        ? `+${run.riskScoreDelta}`
        : `${run.riskScoreDelta}`;

  const projectedRange =
    hasRun && run
      ? `${moneyFromCents(run.expectedCostDeltaCentsMin)} - ${moneyFromCents(run.expectedCostDeltaCentsMax)}`
      : '—';

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={HEADER_ICON_WRAP}>
            <PauseCircle className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Do-Nothing Simulator</h3>
        </div>
        <span className={cn(BADGE_BASE, status.className)}>{status.label}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-gray-500">
        See what happens if you delay action.
      </p>

      <div className={VALUE_ZONE}>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
            Checking simulation profile…
          </span>
        ) : hasRun && run ? (
          <div>
            <p className="text-[1.95rem] font-medium leading-tight tracking-tight text-gray-800">{projectedRange}</p>
            <p className="mt-1 text-sm text-gray-600">Projected cost impact over the selected horizon.</p>
          </div>
        ) : (
          <div>
            <p className="text-[1.32rem] font-medium leading-tight tracking-tight text-gray-800">Run 12-month scenario</p>
            <p className="mt-1 text-sm text-gray-600">Estimate delayed-action cost and risk pressure.</p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
        <span>{hasRun && run ? `${run.horizonMonths} mo horizon` : '12 mo horizon'}</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span>
          Risk delta <span className="font-medium text-gray-800">{riskDeltaLabel}</span>
        </span>
        <span className={cn(BADGE_BASE, likelihoodTone(run?.incidentLikelihood))}>
          {run?.incidentLikelihood ?? 'N/A'}
        </span>
      </div>

      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={handlePrimaryCta}
          disabled={loading || running || !propertyId}
          className={CTA_CLASS}
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
            </>
          ) : (
            <>
              {ctaLabel}
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
