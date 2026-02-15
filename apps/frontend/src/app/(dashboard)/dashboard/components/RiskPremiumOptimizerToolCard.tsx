'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import {
  getRiskPremiumOptimizer,
  RiskPremiumOptimizationDTO,
  runRiskPremiumOptimizer,
} from '@/lib/api/riskPremiumOptimizerApi';
import { Button } from '@/components/ui/button';

type RiskPremiumOptimizerToolCardProps = {
  propertyId: string;
};

function statusText(analysis: RiskPremiumOptimizationDTO | null, hasAnalysis: boolean) {
  if (!hasAnalysis || !analysis) return 'Not run yet';
  if (analysis.status === 'STALE') return 'Review recommended';
  if (analysis.status === 'ERROR') return 'Needs refresh';
  return 'Ready';
}

function money(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

export default function RiskPremiumOptimizerToolCard({
  propertyId,
}: RiskPremiumOptimizerToolCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<RiskPremiumOptimizationDTO | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!propertyId) {
        setLoading(false);
        setHasAnalysis(false);
        setAnalysis(null);
        return;
      }

      setLoading(true);
      try {
        const result = await getRiskPremiumOptimizer(propertyId);
        if (!mounted) return;

        if (result.exists) {
          setHasAnalysis(true);
          setAnalysis(result.analysis);
        } else {
          setHasAnalysis(false);
          setAnalysis(null);
        }
      } catch (error) {
        if (!mounted) return;
        setHasAnalysis(false);
        setAnalysis(null);
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
    if (!hasAnalysis || !analysis) return 'Run optimizer';
    if (analysis.status === 'STALE') return 'Re-run';
    return 'View details';
  }, [analysis, hasAnalysis]);

  const handlePrimaryCta = async () => {
    if (!propertyId) return;

    if (!hasAnalysis || analysis?.status === 'STALE') {
      setRunning(true);
      try {
        const latest = await runRiskPremiumOptimizer(propertyId);
        setHasAnalysis(true);
        setAnalysis(latest);
        router.push(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`);
      } finally {
        setRunning(false);
      }
      return;
    }

    router.push(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`);
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-100">
            <ShieldAlert className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Risk-to-Premium Optimizer</h3>
            <p className="text-sm text-gray-500">Lower premium pressure without increasing risk.</p>
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
            <span className="font-medium">Status:</span> {statusText(analysis, hasAnalysis)}
          </>
        )}
      </div>

      {analysis && hasAnalysis && (
        <div className="mt-3 text-xs text-gray-600 space-y-1">
          <div>
            Savings range:{' '}
            <span className="font-medium text-gray-800">
              {money(analysis.estimatedSavingsMin)} - {money(analysis.estimatedSavingsMax)}
            </span>
          </div>
          {analysis.recommendations.length > 0 && (
            <div className="truncate">
              Top recommendation:{' '}
              <span className="font-medium text-gray-800">{analysis.recommendations[0].title}</span>
            </div>
          )}
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
