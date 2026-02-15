'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PauseCircle } from 'lucide-react';
import {
  DoNothingRunDTO,
  getLatestDoNothingRun,
  runDoNothingSimulation,
} from '@/lib/api/doNothingSimulatorApi';
import { Button } from '@/components/ui/button';

type DoNothingSimulatorToolCardProps = {
  propertyId: string;
};

function statusText(run: DoNothingRunDTO | null, hasRun: boolean) {
  if (!hasRun || !run) return 'Not run yet';
  if (run.status === 'STALE') return 'Review recommended';
  if (run.status === 'ERROR') return 'Needs refresh';
  return 'Ready';
}

function likelihoodTone(likelihood?: DoNothingRunDTO['incidentLikelihood']): string {
  if (likelihood === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (likelihood === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  if (likelihood === 'LOW') return 'bg-emerald-100 text-emerald-700';
  return 'bg-gray-100 text-gray-700';
}

function moneyFromCents(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value / 100);
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

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-100">
            <PauseCircle className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Do-Nothing Simulator</h3>
            <p className="text-sm text-gray-500">See what happens if you delay action.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-700">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            Checking status…
          </span>
        ) : (
          <>
            <span className="font-medium">Status:</span> {statusText(run, hasRun)}
          </>
        )}
      </div>

      {hasRun && run && (
        <div className="mt-3 space-y-1 text-xs text-gray-600">
          <div>
            Horizon: <span className="font-medium text-gray-800">{run.horizonMonths} months</span>
          </div>
          <div>
            Risk delta:{' '}
            <span className="font-medium text-gray-800">
              {run.riskScoreDelta === null || run.riskScoreDelta === undefined ? '—' : `+${run.riskScoreDelta}`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span>Projected cost: <span className="font-medium text-gray-800">{moneyFromCents(run.expectedCostDeltaCentsMin)} - {moneyFromCents(run.expectedCostDeltaCentsMax)}</span></span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${likelihoodTone(run.incidentLikelihood)}`}>
              {run.incidentLikelihood ?? 'N/A'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Button onClick={handlePrimaryCta} disabled={loading || running || !propertyId}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            ctaLabel
          )}
        </Button>
      </div>
    </div>
  );
}
